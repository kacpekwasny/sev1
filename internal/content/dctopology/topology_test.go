package dctopology

import (
	"fmt"
	"net/netip"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestBuildDefaultPhysicalTopology(t *testing.T) {
	model, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(model.Nodes) != 28 || len(model.Groups) != 6 || len(model.Links) != 60 || len(model.Interfaces) != 120 {
		t.Fatalf("unexpected default model dimensions: nodes=%d groups=%d links=%d interfaces=%d", len(model.Nodes), len(model.Groups), len(model.Links), len(model.Interfaces))
	}
	counts := map[string]int{}
	nodes := map[string]Node{}
	for _, node := range model.Nodes {
		nodes[node.ID] = node
	}
	for _, link := range model.Links {
		a, aOK := nodes[link.ANodeID]
		b, bOK := nodes[link.BNodeID]
		if !aOK || !bOK {
			t.Fatalf("link %s references a missing node", link.ID)
		}
		key := pairKey(string(a.Kind), string(b.Kind))
		counts[key]++
		if a.Kind == NodeHost || b.Kind == NodeHost {
			if !link.Unnumbered || (a.Kind != NodeHost && b.Kind != NodeHost) {
				t.Errorf("host attachment must be unnumbered host-to-ToR: %+v", link)
			}
			if a.BoltID != b.BoltID || a.RackID != b.RackID {
				t.Errorf("host link escaped its rack: %+v", link)
			}
		} else if link.Unnumbered {
			t.Errorf("only host-to-ToR links should be unnumbered: %+v", link)
		}
		if a.Kind == NodeLeaf && b.Kind == NodeToR || a.Kind == NodeToR && b.Kind == NodeLeaf {
			if a.BoltID != b.BoltID {
				t.Errorf("leaf-to-ToR link crossed bolt boundary: %+v", link)
			}
		}
	}
	want := map[string]int{
		"border/stem": 4,
		"spine/stem":  8,
		"leaf/spine":  16,
		"leaf/tor":    16,
		"host/tor":    16,
	}
	for key, value := range want {
		if counts[key] != value {
			t.Errorf("%s links=%d; want %d", key, counts[key], value)
		}
	}
	for key, value := range counts {
		if want[key] != value {
			t.Errorf("unexpected edge kind pair %s has %d links", key, value)
		}
	}
}

func TestBuildMaximumPhysicalTopology(t *testing.T) {
	config := exampleConfig(t)
	config.Topology = TopologyConfig{
		Borders: 4, Stems: 4, Spines: 8, Bolts: 4,
		LeavesPerBolt: 4, RacksPerBolt: 4, HostsPerRack: 4,
	}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	if len(model.Nodes) != 128 || len(model.Links) != 432 {
		t.Fatalf("unexpected maximum topology: nodes=%d links=%d", len(model.Nodes), len(model.Links))
	}
}

func TestPhysicalAndIdentityAddressUniqueness(t *testing.T) {
	model, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	identityV4 := map[string]string{}
	identityV6 := map[string]string{}
	for _, node := range model.Nodes {
		if previous, exists := identityV4[node.IPv4]; exists {
			t.Errorf("IPv4 identity %s shared by %s and %s", node.IPv4, previous, node.ID)
		}
		identityV4[node.IPv4] = node.ID
		if previous, exists := identityV6[node.IPv6]; exists {
			t.Errorf("IPv6 identity %s shared by %s and %s", node.IPv6, previous, node.ID)
		}
		identityV6[node.IPv6] = node.ID
	}
	interfaces := map[string]string{}
	for _, intf := range model.Interfaces {
		if intf.IPv4Address == "" {
			if intf.LinkLocalIPv6 == "" || intf.IPv6Address != "" {
				t.Errorf("invalid unnumbered interface: %+v", intf)
			}
			continue
		}
		if previous, exists := interfaces[intf.IPv4Address]; exists {
			t.Errorf("IPv4 interface address %s shared by %s and %s", intf.IPv4Address, previous, intf.ID)
		}
		interfaces[intf.IPv4Address] = intf.ID
		if previous, exists := interfaces[intf.IPv6Address]; exists {
			t.Errorf("IPv6 interface address %s collides with %s", intf.IPv6Address, previous)
		}
		interfaces[intf.IPv6Address] = intf.ID
		if _, err := netip.ParsePrefix(intf.IPv4Prefix); err != nil {
			t.Errorf("invalid IPv4 interface prefix %q: %v", intf.IPv4Prefix, err)
		}
		if _, err := netip.ParsePrefix(intf.IPv6Prefix); err != nil {
			t.Errorf("invalid IPv6 interface prefix %q: %v", intf.IPv6Prefix, err)
		}
	}
}

func TestIdentifiersAndAddressesDoNotShiftWhenCountsGrow(t *testing.T) {
	base, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	config := exampleConfig(t)
	config.Topology.Borders = 3
	config.Topology.Spines = 5
	grown, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	baseNodes := nodeMap(base.Nodes)
	grownNodes := nodeMap(grown.Nodes)
	for _, id := range []string{"border-1", "stem-1", "spine-1", "host-b1-h1", "leaf-b1-1", "tor-b1-r1-1"} {
		before, beforeOK := baseNodes[id]
		after, afterOK := grownNodes[id]
		if !beforeOK || !afterOK {
			t.Fatalf("stable node %s missing", id)
		}
		if before.IPv4 != after.IPv4 || before.IPv6 != after.IPv6 {
			t.Errorf("identity changed for %s: before=%+v after=%+v", id, before, after)
		}
	}
	baseLinks := linkMap(base.Links)
	grownLinks := linkMap(grown.Links)
	for id, before := range baseLinks {
		after, ok := grownLinks[id]
		if !ok {
			t.Fatalf("existing link %s disappeared", id)
		}
		if baseInterface(base, before.AInterfaceID).IPv4Address != baseInterface(grown, after.AInterfaceID).IPv4Address {
			t.Errorf("link address changed when counts grew: %s", id)
		}
	}
}

func TestHostLabelFormat(t *testing.T) {
	for _, tc := range []struct {
		bolt, host int
		want       string
	}{
		{2, 3, "h2003"},
		{13, 45, "h13045"},
		{20, 999, "h20999"},
	} {
		if got := HostLabel(tc.bolt, tc.host); got != tc.want {
			t.Errorf("HostLabel(%d,%d)=%q; want %q", tc.bolt, tc.host, got, tc.want)
		}
	}
}

func TestBuildDefaultVMPlacementsAndBGPSessions(t *testing.T) {
	config := exampleConfig(t)
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	if len(model.VMs) != 19 {
		t.Fatalf("VM count=%d; want 19 (3 customer and 16 route-server)", len(model.VMs))
	}
	vmByID := map[string]VM{}
	for _, vm := range model.VMs {
		vmByID[vm.ID] = vm
		if _, err := netip.ParseAddr(vm.IPv4); err != nil {
			t.Errorf("VM %s has invalid IPv4 %q", vm.ID, vm.IPv4)
		}
		if _, err := netip.ParseAddr(vm.IPv6); err != nil {
			t.Errorf("VM %s has invalid IPv6 %q", vm.ID, vm.IPv6)
		}
	}
	if vmByID["customer-1"].HostID != "host-b1-h1" || vmByID["customer-2"].HostID != "host-b1-h1" || vmByID["customer-3"].HostID != "host-b2-h1" {
		t.Errorf("explicit customer placements were not preserved: %+v %+v %+v", vmByID["customer-1"], vmByID["customer-2"], vmByID["customer-3"])
	}
	if vm := vmByID["rs-bolt-b1-m1"]; vm.HostID != "host-b1-h2" || !vm.ExplicitPlace || vm.ServedBolt != 1 {
		t.Errorf("explicit RS Bolt placement/served bolt not preserved: %+v", vm)
	}
	for _, cluster := range []string{"rs-bolt-b1", "rs-bolt-b2", "rs-ctrl", "rs-user"} {
		seen := map[string]bool{}
		for _, vm := range model.VMs {
			if vm.ClusterID != cluster {
				continue
			}
			if seen[vm.HostID] {
				t.Errorf("cluster %s generated two members on host %s despite available hosts", cluster, vm.HostID)
			}
			seen[vm.HostID] = true
		}
	}
	if len(model.Sessions) != 160 {
		t.Fatalf("BGP session count=%d; want 160", len(model.Sessions))
	}
	wantKinds := map[string]int{
		"fabric": 44, "host-tor": 16, "host-rs-bolt": 32,
		"rs-bolt-rs-ctrl": 32, "rs-ctrl-rs-user": 16,
		"border-rs-ctrl": 8, "customer-rs-user": 12,
	}
	gotKinds := map[string]int{}
	seenSessions := map[string]bool{}
	checkedUnnumbered := false
	for _, session := range model.Sessions {
		gotKinds[session.Kind]++
		if seenSessions[session.ID] {
			t.Errorf("duplicate session ID %s", session.ID)
		}
		seenSessions[session.ID] = true
		if session.State != "established" || session.A.ASN == session.B.ASN {
			t.Errorf("unexpected default session state or ASN pair: %+v", session)
		}
		for _, family := range session.Families {
			if family.AFI == "l2vpn" && (family.SAFI != "evpn" || !reflect.DeepEqual(family.RouteTypes, []int{5})) {
				t.Errorf("EVPN capability must be limited to Type 5: %+v", session)
			}
			if session.Kind == "customer-rs-user" && family.AFI == "l2vpn" {
				t.Errorf("customer-RS User session unexpectedly carries EVPN: %+v", session)
			}
			if session.Kind == "rs-ctrl-rs-user" && family.AFI == "l2vpn" {
				t.Errorf("RS Ctrl-RS User session unexpectedly carries EVPN: %+v", session)
			}
		}
		if session.Kind == "host-tor" {
			checkedUnnumbered = true
			if session.Transport != "ipv6-link-local-unnumbered" || session.A.InterfaceID == "" || session.B.InterfaceID == "" || !strings.HasPrefix(session.A.Address, "fe80:") || !strings.HasPrefix(session.B.Address, "fe80:") {
				t.Errorf("host-ToR BGP transport lost link-local interface scope: %+v", session)
			}
		}
	}
	if !checkedUnnumbered {
		t.Fatal("expected to check the host-ToR unnumbered session")
	}
	if !reflect.DeepEqual(gotKinds, wantKinds) {
		t.Errorf("session matrix=%v; want %v", gotKinds, wantKinds)
	}
	repeated, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(model.VMs, repeated.VMs) || !reflect.DeepEqual(model.Sessions, repeated.Sessions) {
		t.Error("rebuilding the same configuration changed placements or BGP sessions")
	}
}

func TestBuildMaximumBGPSessionMatrix(t *testing.T) {
	config := exampleConfig(t)
	config.Topology = TopologyConfig{
		Borders: 4, Stems: 4, Spines: 8, Bolts: 4,
		LeavesPerBolt: 4, RacksPerBolt: 4, HostsPerRack: 4,
	}
	config.CustomerVMs.Count = 64
	config.CustomerVMs.Overrides = nil
	config.CustomerVMs.RSUserPeers = make([]int, 64)
	for i := range config.CustomerVMs.RSUserPeers {
		config.CustomerVMs.RSUserPeers[i] = i + 1
	}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	if len(model.Nodes) != 128 || len(model.VMs) != 88 || len(model.Links) != 432 || len(model.Sessions) != 1040 {
		t.Fatalf("unexpected capped model: devices=%d vms=%d links=%d sessions=%d", len(model.Nodes), len(model.VMs), len(model.Links), len(model.Sessions))
	}
	asns := map[uint32]string{}
	for _, node := range model.Nodes {
		if previous := asns[node.ASN]; previous != "" {
			t.Errorf("ASN %d shared by %s and %s", node.ASN, previous, node.ID)
		}
		asns[node.ASN] = node.ID
	}
	for _, vm := range model.VMs {
		if previous := asns[vm.ASN]; previous != "" {
			t.Errorf("ASN %d shared by %s and %s", vm.ASN, previous, vm.ID)
		}
		asns[vm.ASN] = vm.ID
	}
}

func exampleConfig(t *testing.T) Config {
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

func pairKey(a, b string) string {
	if b < a {
		a, b = b, a
	}
	return a + "/" + b
}

func nodeMap(nodes []Node) map[string]Node {
	result := make(map[string]Node, len(nodes))
	for _, node := range nodes {
		result[node.ID] = node
	}
	return result
}

func linkMap(links []PhysicalLink) map[string]PhysicalLink {
	result := make(map[string]PhysicalLink, len(links))
	for _, link := range links {
		result[link.ID] = link
	}
	return result
}

func baseInterface(model Model, id string) Interface {
	for _, intf := range model.Interfaces {
		if intf.ID == id {
			return intf
		}
	}
	panic(fmt.Sprintf("interface %s not found", id))
}

func TestRouteServerPlacementPolicies(t *testing.T) {
	for bolts := 1; bolts <= 4; bolts++ {
		for _, hostCount := range []int{1, 4} {
			config := exampleConfig(t)
			config.Topology.Bolts = bolts
			config.Topology.RacksPerBolt = 1
			config.Topology.HostsPerRack = hostCount
			config.RouteServers.Placements = nil
			config.CustomerVMs.Overrides = nil
			model, err := BuildTopology(config)
			if err != nil {
				t.Fatal(err)
			}
			counts := map[int]int{}
			for _, vm := range model.VMs {
				if vm.Role == VMBoltRS && vm.HostBoltID != vm.ServedBolt {
					t.Fatalf("RS Bolt outside served bolt: %+v", vm)
				}
				if vm.Role == VMCtrlRS {
					counts[vm.HostBoltID]++
				}
			}
			for bolt := 1; bolt <= bolts; bolt++ {
				if counts[bolt] == 0 {
					t.Fatalf("bolt %d has no controller with %d bolts", bolt, bolts)
				}
			}
		}
	}
	config := exampleConfig(t)
	config.RouteServers.Placements = []RouteServerPlacement{{Role: "controller", Member: 1, Host: HostRef{BoltID: 2, HostID: 4}}, {Role: "controller", Member: 2, Host: HostRef{BoltID: 2, HostID: 3}}}
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	for _, vm := range model.VMs {
		if vm.ID == "rs-ctrl-m1" && (vm.HostID != "host-b2-h4" || !vm.ExplicitPlace) {
			t.Fatal("compatible explicit placement lost")
		}
	}
}

func TestRouteServerSlugLabels(t *testing.T) {
	for _, sample := range []struct {
		role         VMRole
		bolt, member int
		want         string
	}{
		{VMBoltRS, 13, 1, "rs13001"}, {VMCtrlRS, 0, 4, "rsctrl4"}, {VMUserRS, 0, 3, "rsuser3"},
	} {
		vm := newRouteServerVM(sample.role, sample.bolt, sample.member, Node{}, false)
		if vm.Label != sample.want {
			t.Errorf("route server label=%q, want %q", vm.Label, sample.want)
		}
	}
}
