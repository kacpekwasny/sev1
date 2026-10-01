package dctopology

import (
	"net/netip"
	"os"
	"strings"
	"testing"
)

func publicConfig(t *testing.T) Config {
	t.Helper()
	data, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	config, err := ParseYAML(data)
	if err != nil {
		t.Fatal(err)
	}
	return config
}

func TestPrimaryVMRoutesBootstrapAdditionalPrefixes(t *testing.T) {
	model, err := BuildTopology(publicConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	origins := map[string]Route{}
	for _, origin := range model.Routes.Origins {
		origins[origin.ID] = origin
	}
	for _, vm := range model.VMs {
		if vm.Role != VMCustomer {
			continue
		}
		for _, family := range []string{"ipv4", "ipv6"} {
			primary := origins[primaryVMRouteID(vm, family)]
			if primary.SourceVMID != vm.ID || primary.SAFI != "evpn" || primary.OriginID != vm.HostID || primary.VNI != 3 {
				t.Fatalf("primary IP is not host-originated EVPN: %+v", primary)
			}
			for _, host := range model.Nodes {
				if host.Kind != NodeHost {
					continue
				}
				found := false
				for _, entry := range model.Routes.Forwarding {
					if entry.OwnerID != host.ID || entry.RouteID != primary.ID {
						continue
					}
					found = true
					if entry.ResolvedRouteID != "" {
						t.Fatalf("primary EVPN replaced by RS User recursion: %+v", entry)
					}
					if host.ID == vm.HostID {
						if entry.Protocol != "static" || !strings.HasPrefix(entry.KernelDevice, "tap-c") {
							t.Fatal(entry)
						}
					} else if entry.Protocol != "bgp" || !entry.EncapsulateVXLAN || entry.KernelDevice != "br3" {
						t.Fatal(entry)
					}
				}
				if !found {
					t.Fatalf("%s missing primary VM route %s", host.ID, primary.ID)
				}
			}
		}
	}
	additional := 0
	for _, origin := range model.Routes.Origins {
		if origin.OriginKind != "customer" {
			continue
		}
		additional++
		vm, _ := modelVMByID(model.VMs, origin.SourceVMID)
		nextHop := vm.IPv4
		if origin.IPFamily == "ipv6" {
			nextHop = vm.IPv6
		}
		if origin.NextHop != nextHop || origin.SAFI != "unicast" || origin.RouteType != 0 || origin.VNI != 0 || origin.RD != "" || origin.RouteTarget != "" {
			t.Fatalf("additional NLRI converted into EVPN: %+v", origin)
		}
		if netip.MustParsePrefix(origin.Prefix).String() == nextHop+map[string]string{"ipv4": "/32", "ipv6": "/128"}[origin.IPFamily] {
			t.Fatalf("RS User re-advertises the primary IP: %+v", origin)
		}
		for _, host := range model.Nodes {
			if host.Kind != NodeHost {
				continue
			}
			found := false
			for _, entry := range model.Routes.Forwarding {
				if entry.OwnerID != host.ID || entry.RouteID != origin.ID {
					continue
				}
				found = true
				if entry.Protocol != "bgp" || entry.NextHop != nextHop || entry.ResolvedRouteID != primaryVMRouteID(vm, origin.IPFamily) || entry.RouteType != 0 {
					t.Fatalf("wrong unicast recursion: %+v", entry)
				}
			}
			if !found {
				t.Fatalf("%s missing additional route %s", host.ID, origin.ID)
			}
		}
	}
	if additional != 6 {
		t.Fatalf("additional origins=%d; want 6", additional)
	}
	for _, path := range model.Routes.ControlPaths {
		if strings.Contains(path.SessionID, "/customer-rs-user/") && (!path.Reachable || path.PrimaryEVPNRouteID == "") {
			t.Fatalf("customer peering was not bootstrapped: %+v", path)
		}
	}
	for _, ad := range model.Routes.Advertisements {
		if origins[ad.RouteID].OriginKind == "customer" && (ad.SAFI != "unicast" || ad.RouteType != 0 || ad.VNI != 0 || ad.NextHop != origins[ad.RouteID].NextHop) {
			t.Fatalf("an RS changed the additional NLRI/next hop: %+v", ad)
		}
	}
}

func TestRSUserCannotBootstrapItself(t *testing.T) {
	config := publicConfig(t)
	for member := 1; member <= 4; member++ {
		config.RouteServers.Placements = append(config.RouteServers.Placements, RouteServerPlacement{Role: "user", Member: member, Host: HostRef{BoltID: 1, HostID: member}})
	}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	// Disconnect customer 3's host from EVPN, retaining every physical link and
	// its local primary TAP routes. A physical path alone cannot establish BGP.
	sessions := make([]BGPSession, 0, len(model.Sessions))
	for _, session := range model.Sessions {
		if session.Kind == "host-rs-bolt" && (session.A.EntityID == "host-b2-h1" || session.B.EntityID == "host-b2-h1") {
			continue
		}
		sessions = append(sessions, session)
	}
	model.Sessions = sessions
	state := BuildExpectedRouteState(model)
	blocked := 0
	for _, path := range state.ControlPaths {
		if strings.Contains(path.SessionID, "customer-3--rs-user") {
			blocked++
			if path.Reachable || path.Reason != "primary-vm-connectivity-required" {
				t.Fatal(path)
			}
		}
	}
	if blocked != 4 {
		t.Fatalf("blocked sessions=%d; want 4", blocked)
	}
	for _, route := range state.Origins {
		if route.OriginKind == "customer" && route.SourceVMID == "customer-3" {
			t.Fatalf("extra prefix bootstrapped primary reachability: %+v", route)
		}
	}
	private, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	for _, session := range private.Sessions {
		if session.Kind == "customer-rs-user" && session.State != "blocked" {
			t.Fatal(session)
		}
	}
}

func TestRSUserInjectionAndSharedIPKeepPrimaryNextHop(t *testing.T) {
	config := publicConfig(t)
	config.CustomerVMs.RSUserPeers = []int{1, 2}
	config.CustomerVMs.Overrides[1].AdvertisedPrefixes[0] = config.CustomerVMs.Overrides[0].AdvertisedPrefixes[0]
	config.RouteServers.UserOrigins = []UserRouteOrigin{{ID: "shared-v6", Member: 2, NextHopVMID: 3, Prefix: "2001:db8:6:400::/64"}}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	sharedSources, injected := 0, false
	for _, route := range model.Routes.Origins {
		if route.OriginKind == "customer" && route.Prefix == "10.96.0.1/32" {
			sharedSources++
		}
		if route.ID == "user-injected/shared-v6" {
			injected = true
			if route.OriginID != "rs-user-m2" || route.NextHop != "2001:db8:6::3:0:1" || route.SAFI != "unicast" || route.RouteType != 0 {
				t.Fatal(route)
			}
		}
	}
	if sharedSources != 2 || !injected {
		t.Fatalf("shared origins=%d, injected=%v", sharedSources, injected)
	}
	for _, host := range model.Nodes {
		if host.Kind != NodeHost {
			continue
		}
		shared, injection := 0, false
		for _, route := range model.Routes.Forwarding {
			if route.OwnerID != host.ID {
				continue
			}
			if route.Prefix == "10.96.0.1/32" {
				shared++
			}
			if route.RouteID == "user-injected/shared-v6" {
				injection = route.ResolvedRouteID == "vm/customer-3/ipv6/2001:db8:6::3:0:1"
			}
		}
		if shared != 1 || !injection {
			t.Fatalf("%s: shared selected=%d, injection=%v", host.ID, shared, injection)
		}
	}
}

func TestAdditionalPrefixValidationAndCountTrimming(t *testing.T) {
	for _, prefix := range []string{"not-a-prefix", "0.0.0.0/0", "10.64.0.1/32", "2001:db8:6:200::1/64"} {
		config := publicConfig(t)
		config.CustomerVMs.Overrides[0].AdvertisedPrefixes = []string{prefix}
		if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "advertised_prefixes") {
			t.Fatalf("invalid prefix %q accepted: %v", prefix, err)
		}
	}
	config := publicConfig(t)
	config.RouteServers.UserOrigins = []UserRouteOrigin{{ID: "extra", Member: 1, NextHopVMID: 3, Prefix: "10.96.0.10/32"}}
	config.CustomerVMs.Count = 2
	config = trimRemovedCustomerReferences(config)
	if len(config.RouteServers.UserOrigins) != 0 {
		t.Fatal("count reduction retained an injection to a removed VM")
	}
	if err := config.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestPacketsToAdditionalPrefixesResolveToVMWithoutChangingDestination(t *testing.T) {
	config := publicConfig(t)
	config.Traffic = []TrafficRequest{{ID: "extra-v4", SourceVMID: 1, DestinationPrefix: "10.96.0.3/32"},
		{ID: "extra-v6", SourceVMID: 1, DestinationPrefix: "2001:db8:6:300::3/128"}}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	for _, flow := range model.Routes.Traffic {
		if !flow.Reachable || !flow.VXLAN || flow.DestinationID != "customer-3" || !strings.HasPrefix(flow.RouteID, "customer/customer-3/") {
			t.Fatalf("additional prefix was treated as an external border target: %+v", flow)
		}
		packet := InspectTrafficPacket(model, flow.ID)
		if !packet.Reachable || packet.Destination != netip.MustParsePrefix(flow.DestinationPrefix).Addr().String() || packet.DisplayHopIDs[len(packet.DisplayHopIDs)-1] != "customer-3" {
			t.Fatalf("packet destination/last TAP changed to the primary IP: %+v", packet)
		}
	}
}
