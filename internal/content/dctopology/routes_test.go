package dctopology

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
)

func TestDefaultRouteStateAndForwarding(t *testing.T) {
	model, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	state := model.Routes
	if len(state.VPCs) != 1 || state.VPCs[0].RouteTarget != "target:64512:1" || state.VPCs[0].VNI != 10001 {
		t.Fatalf("unexpected VPC overlay context: %+v", state.VPCs)
	}
	underlayOrigins, tenantOrigins := 0, 0
	for _, route := range state.Origins {
		if route.OriginKind == "underlay" {
			underlayOrigins++
		} else {
			tenantOrigins++
		}
	}
	if underlayOrigins != 88 || tenantOrigins != 13 {
		t.Fatalf("route origins: underlay=%d tenant=%d; want 88 and 13", underlayOrigins, tenantOrigins)
	}
	routes := map[string]Route{}
	for _, route := range state.Origins {
		routes[route.ID] = route
		if route.AFI == "l2vpn" {
			if route.SAFI != "evpn" || route.RouteType != 5 || route.RouteTarget != "target:64512:1" || route.VNI != 10001 {
				t.Errorf("route is missing Type-5/VPC encapsulation context: %+v", route)
			}
		} else if route.OriginKind == "underlay" {
			if route.SAFI != "unicast" || route.VPCID != 0 || route.RouteTarget != "" || route.VNI != 0 {
				t.Errorf("underlay identity route acquired tenant forwarding context: %+v", route)
			}
		} else if route.SAFI != "unicast" || route.VPCID != 1 {
			t.Errorf("customer unicast route lost its family or VPC context: %+v", route)
		}
		if route.LocalPreference != 100 || len(route.ID) == 0 || route.NextHop == "" {
			t.Errorf("route lacks approved selection or next-hop defaults: %+v", route)
		}
	}
	vmRoute := routes["vm/customer-3/ipv4/10.64.0.3"]
	if vmRoute.OriginID != "host-b2-h1" || vmRoute.SourceVMID != "customer-3" || vmRoute.Prefix != "10.64.0.3/32" {
		t.Errorf("VM Type-5 origin does not identify its source NVE and VM: %+v", vmRoute)
	}
	if vmRoute.RD != "64512:65553" {
		t.Errorf("unexpected NVE/VPC route distinguisher %q", vmRoute.RD)
	}

	tables := map[string]BGPSpeakerTable{}
	for _, table := range state.Tables {
		tables[table.SpeakerID] = table
	}
	local := tables["host-b1-h1"]
	if countRoutesByVPC(local.LocallyOriginated, 1) != 4 || countRoutesByVPC(local.Selected, 1) != 13 {
		t.Fatalf("host with two local VMs should originate four and select thirteen tenant prefixes: local=%d selected=%d", countRoutesByVPC(local.LocallyOriginated, 1), countRoutesByVPC(local.Selected, 1))
	}
	remote := tables["host-b2-h1"]
	if countRoutesByVPC(remote.LocallyOriginated, 1) != 2 || countRoutesByVPC(remote.Selected, 1) != 13 {
		t.Fatalf("remote VPC host route table mismatch: local=%d selected=%d", countRoutesByVPC(remote.LocallyOriginated, 1), countRoutesByVPC(remote.Selected, 1))
	}
	if got := countRoutesByVPC(tables["host-b1-h2"].Selected, 1); got != 0 {
		t.Errorf("host with no VPC attachment imported %d tenant routes", got)
	}
	if got := countRoutesByVPC(tables["rs-ctrl-m1"].Selected, 1); got != 13 {
		t.Errorf("RS Ctrl selected route count=%d; want 13", got)
	}
	if got := len(tables["customer-1"].Selected); got != 6 {
		t.Errorf("selected customer BGP table should contain its own and two peer VM routes: got %d, want 6", got)
	}
	for _, candidate := range remote.Selected {
		if candidate.VPCID != 1 {
			continue
		}
		if len(candidate.ASPath) != 1 || candidate.ASPath[0] != candidate.OriginASN {
			t.Errorf("route server prepended an ASN or changed the origin path: %+v", candidate)
		}
		for _, nextHop := range candidate.UnderlayNextHops {
			if nextHop != "tor-b2-r1-1" && nextHop != "tor-b2-r1-2" {
				t.Errorf("unexpected equal-cost first hop from h2001 to remote prefix: %s", nextHop)
			}
		}
	}

	vmForwarding := 0
	for _, entry := range state.Forwarding {
		if entry.OwnerID == "customer-1" {
			vmForwarding++
			if entry.VPCID != 1 {
				t.Errorf("customer VPC forwarding view contains another VPC: %+v", entry)
			}
			if entry.RouteID == "vm/customer-3/ipv4/10.64.0.3" && (!entry.EncapsulateVXLAN || len(entry.ECMPNextHops) != 2) {
				t.Errorf("cross-host route should use VXLAN and retain both host-ToR ECMP paths: %+v", entry)
			}
		}
	}
	if vmForwarding != 7 {
		t.Errorf("customer VPC forwarding view has %d entries; want 7", vmForwarding)
	}
	if len(state.Advertisements) == 0 {
		t.Fatal("expected route advertisements on BGP sessions")
	}
	sessionIDs := map[string]bool{}
	sessionsByID := map[string]BGPSession{}
	for _, session := range model.Sessions {
		sessionIDs[session.ID] = true
		sessionsByID[session.ID] = session
	}
	for _, advertisement := range state.Advertisements {
		if !sessionIDs[advertisement.SessionID] || routes[advertisement.RouteID].ID == "" {
			t.Errorf("advertisement references missing session or route: %+v", advertisement)
		}
		if len(advertisement.PropagationPath) < 2 || advertisement.PropagationPath[0] != routes[advertisement.RouteID].OriginID ||
			advertisement.PropagationPath[len(advertisement.PropagationPath)-2] != advertisement.FromID ||
			advertisement.PropagationPath[len(advertisement.PropagationPath)-1] != advertisement.ToID {
			t.Errorf("advertisement has invalid deterministic propagation path: %+v", advertisement)
		}
		session := sessionsByID[advertisement.SessionID]
		if !((session.A.EntityID == advertisement.FromID && session.B.EntityID == advertisement.ToID) ||
			(session.B.EntityID == advertisement.FromID && session.A.EntityID == advertisement.ToID)) {
			t.Errorf("advertisement path does not use its BGP session endpoints: %+v", advertisement)
		}
		route := routes[advertisement.RouteID]
		if !((advertisement.RouteType == 5 && advertisement.AFI == "l2vpn" && advertisement.SAFI == "evpn") ||
			(route.OriginKind == "underlay" && advertisement.RouteType == 0 && (advertisement.AFI == "ipv4" || advertisement.AFI == "ipv6") && advertisement.SAFI == "unicast") ||
			(route.OriginKind == "customer" && advertisement.RouteType == 0 && (advertisement.AFI == "ipv4" || advertisement.AFI == "ipv6") && advertisement.SAFI == "unicast")) {
			t.Errorf("unexpected advertised family: %+v", advertisement)
		}
	}
	if err := assertUnderlayServiceReachability(model, tables); err != nil {
		t.Fatal(err)
	}
}

func countRoutesByVPC(routes []RouteCandidate, vpcID uint32) int {
	count := 0
	for _, route := range routes {
		if route.VPCID == vpcID {
			count++
		}
	}
	return count
}

func assertUnderlayServiceReachability(model Model, tables map[string]BGPSpeakerTable) error {
	vmByID := map[string]VM{}
	sessionsByID := map[string]BGPSession{}
	for _, session := range model.Sessions {
		sessionsByID[session.ID] = session
	}
	for _, vm := range model.VMs {
		vmByID[vm.ID] = vm
	}
	user := vmByID["rs-user-m1"]
	localTable, ok := tables[user.HostID]
	if !ok {
		return fmt.Errorf("missing physical BGP table for RS User host %s", user.HostID)
	}
	remoteTable, ok := tables["border-1"]
	if !ok {
		return fmt.Errorf("missing physical BGP table for remote border")
	}
	serviceID := "underlay-service/rs-user-m1/ipv6"
	for name, table := range map[string]BGPSpeakerTable{"local": localTable, "remote": remoteTable} {
		found := false
		for _, candidate := range table.Selected {
			if candidate.ID == serviceID {
				found = true
				expectedNextHopNode := user.HostID
				if name == "remote" {
					expectedNextHopNode = candidate.ReceivedFrom
				}
				if candidate.VPCID != 0 || candidate.RouteTarget != "" || candidate.NextHopNodeID != expectedNextHopNode {
					return fmt.Errorf("%s speaker received RS service address as a tenant route: %+v", name, candidate)
				}
				if name == "remote" && (candidate.NextHop == "" || candidate.NextHopInterfaceID == "") {
					return fmt.Errorf("remote underlay route lost its interface-scoped eBGP next hop: %+v", candidate)
				}
				if name == "remote" && (len(candidate.ASPath) == 0 || candidate.ASPath[0] != modelNodeASN(model, user.HostID)) {
					return fmt.Errorf("remote underlay path does not begin with the origin host ASN: %+v", candidate.ASPath)
				}
			}
		}
		if !found {
			return fmt.Errorf("%s physical speaker did not select RS User IPv6 service route", name)
		}
	}
	for _, candidate := range tables["rs-ctrl-m1"].Selected {
		if candidate.OriginKind == "underlay" {
			return fmt.Errorf("route-server VM received a physical underlay BGP route: %+v", candidate)
		}
	}
	physicalAdvertisements := 0
	for _, advertisement := range model.Routes.Advertisements {
		if strings.HasPrefix(advertisement.SessionID, "bgp/fabric/") || strings.HasPrefix(advertisement.SessionID, "bgp/host-tor/") {
			if advertisement.AFI == "ipv6" && advertisement.SAFI == "unicast" {
				physicalAdvertisements++
				if len(advertisement.ASPath) == 0 {
					return fmt.Errorf("physical eBGP advertisement has no sender ASN: %+v", advertisement)
				}
				if advertisement.NextHopNodeID != advertisement.FromID || advertisement.NextHopInterfaceID == "" {
					return fmt.Errorf("physical eBGP advertisement has no interface-scoped sender next hop: %+v", advertisement)
				}
				session := sessionsByID[advertisement.SessionID]
				for _, endpoint := range []SessionEndpoint{session.A, session.B} {
					if endpoint.EntityID == advertisement.FromID &&
						(advertisement.NextHop != endpoint.Address || advertisement.NextHopInterfaceID != endpoint.InterfaceID) {
						return fmt.Errorf("physical eBGP advertisement next hop differs from sender endpoint: ad=%+v endpoint=%+v", advertisement, endpoint)
					}
				}
			}
		}
	}
	if physicalAdvertisements == 0 {
		return fmt.Errorf("physical BGP sessions contain no unicast route advertisements")
	}
	return nil
}

func modelNodeASN(model Model, id string) uint32 {
	for _, node := range model.Nodes {
		if node.ID == id {
			return node.ASN
		}
	}
	return 0
}

func TestRouteContextsKeepOverlappingPrefixesIsolated(t *testing.T) {
	config := exampleConfig(t)
	config.VPCs = append(config.VPCs, VPCConfig{ID: 2, Name: "odizolowana"})
	config.CustomerVMs.Overrides = []CustomerVMOverride{
		{ID: 1, Addresses: []string{"10.64.0.20", "2001:db8:6::20"}},
		{ID: 3, VPCID: uint32ptr(2), Addresses: []string{"10.64.0.20", "2001:db8:6::20"}},
	}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]Route{}
	for _, route := range model.Routes.Origins {
		byID[route.ID] = route
	}
	vpc1, vpc2 := byID["vm/customer-1/ipv4/10.64.0.20"], byID["vm/customer-3/ipv4/10.64.0.20"]
	if vpc1.Prefix != vpc2.Prefix || vpc1.RD == vpc2.RD || vpc1.RouteTarget == vpc2.RouteTarget || vpc1.VNI == vpc2.VNI {
		t.Fatalf("overlapping addresses lost their independent VPC identities: vpc1=%+v vpc2=%+v", vpc1, vpc2)
	}
	for _, entry := range model.Routes.Forwarding {
		if entry.OwnerID == "customer-1" && entry.VPCID != 1 {
			t.Errorf("VPC 1 forwarding view contains VPC %d route %s", entry.VPCID, entry.Prefix)
		}
		if entry.OwnerID == "customer-3" && entry.VPCID != 2 {
			t.Errorf("VPC 2 forwarding view contains VPC %d route %s", entry.VPCID, entry.Prefix)
		}
	}
	for _, host := range []string{"host-b1-h1", "host-b2-h1"} {
		for _, entry := range model.Routes.Forwarding {
			if entry.OwnerID == host && entry.VPCID == 0 {
				t.Errorf("host forwarding entry lost VPC context: %+v", entry)
			}
		}
	}
}

func TestOnlyYAMLSelectedCustomerVMsUseRSUserForUnicastRoutes(t *testing.T) {
	config := exampleConfig(t)
	config.CustomerVMs.RSUserPeers = []int{1}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	for _, route := range model.Routes.Origins {
		if route.OriginKind == "customer" && route.SourceVMID != "customer-1" {
			t.Errorf("unselected customer originated an RS User unicast route: %+v", route)
		}
	}
	customerSessions := 0
	for _, session := range model.Sessions {
		if session.Kind == "customer-rs-user" {
			customerSessions++
			if session.A.EntityID != "customer-1" && session.B.EntityID != "customer-1" {
				t.Errorf("unselected customer formed an RS User session: %+v", session)
			}
		}
	}
	if customerSessions != 4 {
		t.Fatalf("customer-RS User sessions=%d; want four for the one selected VM", customerSessions)
	}
	for _, id := range []string{"customer-2", "customer-3"} {
		for _, table := range model.Routes.Tables {
			if table.SpeakerID == id && (len(table.LocallyOriginated) != 0 || len(table.Received) != 0) {
				t.Errorf("unselected customer %s unexpectedly has an active BGP route table: %+v", id, table)
			}
		}
	}
}

func TestMultipleAddressesOfOneFamilyKeepDistinctType5RouteIdentity(t *testing.T) {
	config := exampleConfig(t)
	config.CustomerVMs.Overrides = []CustomerVMOverride{{
		ID: 1, Addresses: []string{"10.64.0.11", "2001:db8:6::11", "10.64.0.12", "2001:db8:6::12"},
	}}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	prefixes := map[string]bool{}
	for _, route := range model.Routes.Origins {
		if route.SourceVMID != "customer-1" || route.OriginKind != "host" {
			continue
		}
		if ids[route.ID] {
			t.Errorf("multiple VM addresses shared Type-5 route ID %q", route.ID)
		}
		ids[route.ID] = true
		prefixes[route.Prefix] = true
	}
	if len(ids) != 4 || len(prefixes) != 4 {
		t.Fatalf("VM with two addresses per family has %d distinct Type-5 origins and %d prefixes; want 4", len(ids), len(prefixes))
	}
}

func TestRouteSelectionUsesStableFinalTieBreakerAndKeepsCandidates(t *testing.T) {
	config := exampleConfig(t)
	config.RouteOrigins = append(config.RouteOrigins, RouteOriginConfig{
		ID: "alternate-uplink-v4", VPCID: 1, Prefix: "198.51.100.0/24", BorderID: 2,
	})
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	var hostTable *BGPSpeakerTable
	for index := range model.Routes.Tables {
		if model.Routes.Tables[index].SpeakerID == "host-b1-h1" {
			hostTable = &model.Routes.Tables[index]
			break
		}
	}
	if hostTable == nil {
		t.Fatal("missing host BGP table")
	}
	candidates := 0
	for _, candidate := range hostTable.Received {
		if candidate.Prefix == "198.51.100.0/24" {
			candidates++
			if candidate.LocalPreference != 100 || candidate.OriginCode != 2 || len(candidate.ASPath) != 1 {
				t.Errorf("unexpected candidate attributes: %+v", candidate)
			}
		}
	}
	if candidates != 2 {
		t.Fatalf("host received %d candidates for overlapping prefix; want 2", candidates)
	}
	selected := 0
	for _, route := range hostTable.Selected {
		if route.Prefix == "198.51.100.0/24" {
			selected++
			if route.OriginID != "border-1" {
				t.Errorf("stable route-ID tie breaker selected %s instead of border-1", route.OriginID)
			}
		}
	}
	if selected != 1 {
		t.Fatalf("host selected %d paths for the prefix; want exactly one", selected)
	}
}

func TestRouteStateIsDeterministicAcrossBuilds(t *testing.T) {
	config := exampleConfig(t)
	a, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	b, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(a.Routes, b.Routes) {
		t.Fatal("route state changed between repeated builds of the same configuration")
	}
}

func TestDataAndControlTrafficPathsUseRealPhysicalLinks(t *testing.T) {
	config := exampleConfig(t)
	config.CustomerVMs.Count = 5
	config.CustomerVMs.Overrides = []CustomerVMOverride{
		{ID: 1, Host: &HostRef{BoltID: 1, HostID: 1}},
		{ID: 2, Host: &HostRef{BoltID: 1, HostID: 1}},
		{ID: 3, Host: &HostRef{BoltID: 1, HostID: 2}},
		{ID: 4, Host: &HostRef{BoltID: 1, HostID: 3}},
		{ID: 5, Host: &HostRef{BoltID: 2, HostID: 1}},
	}
	config.Traffic = []TrafficRequest{
		{ID: "same-host", SourceVMID: 1, DestinationVMID: intptr(2)},
		{ID: "same-rack", SourceVMID: 1, DestinationVMID: intptr(3)},
		{ID: "cross-rack", SourceVMID: 1, DestinationVMID: intptr(4)},
		{ID: "cross-bolt-a", SourceVMID: 1, DestinationVMID: intptr(5)},
		{ID: "cross-bolt-b", SourceVMID: 1, DestinationVMID: intptr(5)},
		{ID: "border-prefix", SourceVMID: 1, DestinationPrefix: "198.51.100.0/24"},
	}
	for i := 0; i < 32; i++ {
		config.Traffic = append(config.Traffic, TrafficRequest{ID: fmt.Sprintf("ecmp-vector-%02d", i), SourceVMID: 1, DestinationVMID: intptr(5)})
	}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	flows := map[string]ResolvedTraffic{}
	for _, flow := range model.Routes.Traffic {
		flows[flow.ID] = flow
	}
	for _, id := range []string{"same-host", "same-rack", "cross-rack", "cross-bolt-a", "cross-bolt-b", "border-prefix"} {
		flow, ok := flows[id]
		if !ok || !flow.Reachable {
			t.Fatalf("flow %s did not resolve: %+v", id, flow)
		}
		if len(flow.PhysicalLinkIDs) != len(flow.PhysicalNodeIDs)-1 || flow.UnderlayCost != len(flow.PhysicalLinkIDs) {
			t.Errorf("flow %s has inconsistent physical hops: %+v", id, flow)
		}
		for _, nodeID := range flow.PhysicalNodeIDs {
			if strings.HasPrefix(nodeID, "rs-") {
				t.Errorf("customer traffic traverses route server %s", nodeID)
			}
		}
	}
	if local := flows["same-host"]; !local.LocalDelivery || local.VXLAN || len(local.PhysicalLinkIDs) != 0 {
		t.Errorf("same-host traffic should be local and unencapsulated: %+v", local)
	}
	if flow := flows["same-rack"]; flow.UnderlayCost != 2 {
		t.Errorf("same-rack path cost=%d; want 2 physical hops", flow.UnderlayCost)
	}
	if flow := flows["cross-rack"]; flow.UnderlayCost != 4 {
		t.Errorf("cross-rack path cost=%d; want 4 physical hops", flow.UnderlayCost)
	}
	if flow := flows["cross-bolt-a"]; flow.UnderlayCost != 6 || !flow.VXLAN || flow.EqualCostPathCount < 2 || len(flow.ECMPNextHops) != 2 {
		t.Errorf("cross-bolt flow must show VXLAN and both eligible host-ToR next hops: %+v", flow)
	}
	if flow := flows["border-prefix"]; flow.UnderlayCost != 5 || !flow.VXLAN || flow.DestinationID != "border-1" {
		t.Errorf("border-prefix path did not resolve to its configured border: %+v", flow)
	}
	selectedFirstHops := map[string]bool{}
	for i := 0; i < 32; i++ {
		flow := flows[fmt.Sprintf("ecmp-vector-%02d", i)]
		if len(flow.PhysicalNodeIDs) > 1 {
			selectedFirstHops[flow.PhysicalNodeIDs[1]] = true
		}
	}
	if len(selectedFirstHops) < 2 {
		t.Errorf("fixed flow vectors did not select multiple eligible ECMP paths: %v", selectedFirstHops)
	}
	if len(model.Routes.ControlPaths) != len(model.Sessions) {
		t.Fatalf("control path count=%d; want one for each of %d BGP sessions", len(model.Routes.ControlPaths), len(model.Sessions))
	}
	linkIDs := map[string]bool{}
	for _, link := range model.Links {
		linkIDs[link.ID] = true
	}
	for _, path := range model.Routes.ControlPaths {
		if !path.Reachable || len(path.PhysicalLinkIDs) != len(path.PhysicalNodeIDs)-1 {
			t.Errorf("BGP control path is unresolved or inconsistent: %+v", path)
		}
		for _, linkID := range path.PhysicalLinkIDs {
			if !linkIDs[linkID] {
				t.Errorf("control path references a nonexistent physical link %s", linkID)
			}
		}
	}
}

func TestCrossVPCDataFlowIsRejectedEvenWhenPrefixesOverlap(t *testing.T) {
	config := exampleConfig(t)
	config.VPCs = append(config.VPCs, VPCConfig{ID: 2, Name: "druga"})
	config.CustomerVMs.Count = 3
	config.CustomerVMs.Overrides = []CustomerVMOverride{
		{ID: 1, Addresses: []string{"10.64.0.20", "2001:db8:6::20"}},
		{ID: 3, VPCID: uint32ptr(2), Addresses: []string{"10.64.0.20", "2001:db8:6::20"}},
	}
	config.Traffic = []TrafficRequest{{ID: "no-leak", SourceVMID: 1, DestinationVMID: intptr(3)}}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	if len(model.Routes.Traffic) != 1 || model.Routes.Traffic[0].Reachable || model.Routes.Traffic[0].Reason != "cross-vpc-not-permitted" || len(model.Routes.Traffic[0].PhysicalLinkIDs) != 0 {
		t.Fatalf("cross-VPC flow was not rejected before forwarding: %+v", model.Routes.Traffic)
	}
}

func intptr(value int) *int { return &value }
