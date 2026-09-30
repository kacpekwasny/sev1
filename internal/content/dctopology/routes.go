package dctopology

import (
	"fmt"
	"hash/fnv"
	"net/netip"
	"sort"
)

type VPCContext struct {
	ID          uint32 `json:"id"`
	Name        string `json:"name"`
	RouteTarget string `json:"route_target"`
	VNI         uint32 `json:"vni"`
}

type Route struct {
	Protocol        string `json:"protocol,omitempty"`
	ID              string `json:"id"`
	Prefix          string `json:"prefix"`
	IPFamily        string `json:"ip_family"`
	AFI             string `json:"afi"`
	SAFI            string `json:"safi"`
	RouteType       int    `json:"route_type"`
	VPCID           uint32 `json:"vpc_id"`
	RD              string `json:"rd"`
	RouteTarget     string `json:"route_target"`
	VNI             uint32 `json:"vni"`
	OriginID        string `json:"origin_id"`
	OriginLabel     string `json:"origin_label"`
	OriginKind      string `json:"origin_kind"`
	SourceVMID      string `json:"source_vm_id,omitempty"`
	OriginASN       uint32 `json:"origin_asn"`
	OriginNVEID     uint16 `json:"origin_nve_id"`
	NextHop         string `json:"next_hop"`
	NextHopNodeID   string `json:"next_hop_node_id"`
	LocalPreference uint32 `json:"local_preference"`
	MED             uint32 `json:"med"`
	OriginCode      int    `json:"origin_code"`
}

type RouteCandidate struct {
	Route
	SpeakerID          string   `json:"speaker_id"`
	ReceivedFrom       string   `json:"received_from,omitempty"`
	NextHopInterfaceID string   `json:"next_hop_interface_id,omitempty"`
	Path               []string `json:"path"`
	ASPath             []uint32 `json:"as_path"`
	UnderlayCost       int      `json:"underlay_cost"`
	UnderlayNextHops   []string `json:"underlay_next_hops"`
	Selected           bool     `json:"selected"`
}

type BGPSpeakerTable struct {
	SpeakerID         string           `json:"speaker_id"`
	Label             string           `json:"label"`
	Kind              string           `json:"kind"`
	LocallyOriginated []RouteCandidate `json:"locally_originated"`
	Received          []RouteCandidate `json:"received"`
	Selected          []RouteCandidate `json:"selected"`
}

type RouteAdvertisement struct {
	ID                 string   `json:"id"`
	SessionID          string   `json:"session_id"`
	FromID             string   `json:"from_id"`
	ToID               string   `json:"to_id"`
	RouteID            string   `json:"route_id"`
	Prefix             string   `json:"prefix"`
	VPCID              uint32   `json:"vpc_id"`
	AFI                string   `json:"afi"`
	SAFI               string   `json:"safi"`
	RouteType          int      `json:"route_type"`
	RD                 string   `json:"rd"`
	RouteTarget        string   `json:"route_target"`
	VNI                uint32   `json:"vni"`
	OriginID           string   `json:"origin_id"`
	LocalPreference    uint32   `json:"local_preference"`
	MED                uint32   `json:"med"`
	OriginCode         int      `json:"origin_code"`
	NextHop            string   `json:"next_hop"`
	NextHopNodeID      string   `json:"next_hop_node_id"`
	NextHopInterfaceID string   `json:"next_hop_interface_id,omitempty"`
	ASPath             []uint32 `json:"as_path"`
	PropagationPath    []string `json:"propagation_path"`
}

type ForwardingEntry struct {
	VRF              string   `json:"vrf,omitempty"`
	ResolvedRouteID  string   `json:"resolved_route_id,omitempty"`
	ResolvedNextHop  string   `json:"resolved_next_hop,omitempty"`
	Protocol         string   `json:"protocol,omitempty"`
	OwnerID          string   `json:"owner_id"`
	OwnerType        string   `json:"owner_type"`
	SourceNVE        string   `json:"source_nve"`
	VPCID            uint32   `json:"vpc_id"`
	Prefix           string   `json:"prefix"`
	RouteID          string   `json:"route_id"`
	RouteType        int      `json:"route_type"`
	RD               string   `json:"rd"`
	RouteTarget      string   `json:"route_target"`
	OriginID         string   `json:"origin_id"`
	NextHop          string   `json:"next_hop"`
	NextHopNodeID    string   `json:"next_hop_node_id"`
	VNI              uint32   `json:"vni"`
	EncapsulateVXLAN bool     `json:"encapsulate_vxlan"`
	UnderlayCost     int      `json:"underlay_cost"`
	ECMPNextHops     []string `json:"ecmp_next_hops"`
}

type ResolvedTraffic struct {
	ID                 string   `json:"id"`
	SourceVMID         string   `json:"source_vm_id"`
	DestinationVMID    string   `json:"destination_vm_id,omitempty"`
	DestinationPrefix  string   `json:"destination_prefix,omitempty"`
	DestinationID      string   `json:"destination_id,omitempty"`
	DestinationLabel   string   `json:"destination_label,omitempty"`
	VPCID              uint32   `json:"vpc_id"`
	Reachable          bool     `json:"reachable"`
	Reason             string   `json:"reason,omitempty"`
	RouteID            string   `json:"route_id,omitempty"`
	NextHop            string   `json:"next_hop,omitempty"`
	NextHopNodeID      string   `json:"next_hop_node_id,omitempty"`
	VNI                uint32   `json:"vni,omitempty"`
	VXLAN              bool     `json:"vxlan"`
	LocalDelivery      bool     `json:"local_delivery"`
	PhysicalNodeIDs    []string `json:"physical_node_ids"`
	PhysicalLinkIDs    []string `json:"physical_link_ids"`
	UnderlayCost       int      `json:"underlay_cost"`
	ECMPNextHops       []string `json:"ecmp_next_hops"`
	EqualCostPathCount int      `json:"equal_cost_path_count"`
	SelectedPathIndex  int      `json:"selected_path_index"`
	LogicalHops        []string `json:"logical_hops"`
}

type ResolvedControlPath struct {
	SessionID          string   `json:"session_id"`
	FromID             string   `json:"from_id"`
	ToID               string   `json:"to_id"`
	Transport          string   `json:"transport"`
	Reachable          bool     `json:"reachable"`
	Reason             string   `json:"reason,omitempty"`
	PhysicalNodeIDs    []string `json:"physical_node_ids"`
	PhysicalLinkIDs    []string `json:"physical_link_ids"`
	UnderlayCost       int      `json:"underlay_cost"`
	ECMPNextHops       []string `json:"ecmp_next_hops"`
	EqualCostPathCount int      `json:"equal_cost_path_count"`
	SelectedPathIndex  int      `json:"selected_path_index"`
}

type RouteState struct {
	FlowExamples        []FlowExample         `json:"flow_examples"`
	VPCs                []VPCContext          `json:"vpcs"`
	Origins             []Route               `json:"origins"`
	Tables              []BGPSpeakerTable     `json:"tables"`
	Advertisements      []RouteAdvertisement  `json:"advertisements"`
	AdvertisementCounts map[string]int        `json:"advertisement_counts"`
	Forwarding          []ForwardingEntry     `json:"forwarding"`
	Traffic             []ResolvedTraffic     `json:"traffic"`
	ControlPaths        []ResolvedControlPath `json:"control_paths"`
}

type routePeer struct {
	Endpoint SessionEndpoint
	Session  BGPSession
}

// BuildExpectedRouteState calculates a static educational snapshot from configuration.
// It has no BGP update clock, convergence state, or dependency on browser animation.
func BuildExpectedRouteState(model Model) RouteState {
	state := RouteState{VPCs: buildVPCContexts(model.Config.VPCs)}
	nodes := make(map[string]Node, len(model.Nodes))
	for _, node := range model.Nodes {
		nodes[node.ID] = node
	}
	vms := make(map[string]VM, len(model.VMs))
	for _, vm := range model.VMs {
		vms[vm.ID] = vm
	}
	vpcByID := make(map[uint32]VPCContext, len(state.VPCs))
	for _, vpc := range state.VPCs {
		vpcByID[vpc.ID] = vpc
	}
	for _, node := range model.Nodes {
		for _, item := range []struct{ family, address string }{{"ipv4", node.IPv4}, {"ipv6", node.IPv6}} {
			bits := 128
			if item.family == "ipv4" {
				bits = 32
			}
			state.Origins = append(state.Origins, Route{
				ID:     fmt.Sprintf("underlay/%s/%s", node.ID, item.family),
				Prefix: netip.PrefixFrom(netip.MustParseAddr(item.address), bits).String(), IPFamily: item.family,
				AFI: item.family, SAFI: "unicast", OriginID: node.ID,
				OriginLabel: node.Label, OriginKind: "underlay", OriginASN: node.ASN,
				NextHop: item.address, NextHopNodeID: node.ID,
				LocalPreference: 100, MED: 0, OriginCode: 0,
			})
		}
	}
	for _, vm := range model.VMs {
		if vm.Role == VMCustomer {
			continue
		}
		host := nodes[vm.HostID]
		for _, item := range []struct{ family, address string }{{"ipv4", vm.IPv4}, {"ipv6", vm.IPv6}} {
			bits := 128
			if item.family == "ipv4" {
				bits = 32
			}
			state.Origins = append(state.Origins, Route{
				ID:     fmt.Sprintf("underlay-service/%s/%s", vm.ID, item.family),
				Prefix: netip.PrefixFrom(netip.MustParseAddr(item.address), bits).String(), IPFamily: item.family,
				AFI: item.family, SAFI: "unicast", OriginID: host.ID,
				OriginLabel: vm.Label + " via " + host.Label, OriginKind: "underlay", SourceVMID: vm.ID,
				OriginASN: host.ASN, NextHop: item.address, NextHopNodeID: host.ID,
				LocalPreference: 100, MED: 0, OriginCode: 0,
			})
		}
	}
	for _, vm := range model.VMs {
		if vm.Role != VMCustomer {
			continue
		}
		host := nodes[vm.HostID]
		for _, address := range vm.Addresses {
			parsed, err := netip.ParseAddr(address)
			if err != nil {
				continue
			}
			prefixBits, family := 128, "ipv6"
			if parsed.Is4() {
				prefixBits, family = 32, "ipv4"
			}
			route := makeRoute(
				fmt.Sprintf("vm/%s/%s/%s", vm.ID, family, parsed), netip.PrefixFrom(parsed, prefixBits).String(),
				family, vm.VPCID, host.ID, vm.Label+" via "+host.Label, "host", host.ASN, nveID(host), host.IPv4, host.ID, 0, vpcByID[vm.VPCID],
			)
			route.SourceVMID = vm.ID
			state.Origins = append(state.Origins, route)
		}
	}
	selectedPeers := make(map[int]bool, len(model.Config.CustomerVMs.RSUserPeers))
	for _, id := range model.Config.CustomerVMs.RSUserPeers {
		selectedPeers[id] = true
	}
	for _, vm := range model.VMs {
		if vm.Role != VMCustomer {
			continue
		}
		var vmNumber int
		_, _ = fmt.Sscanf(vm.ID, "customer-%d", &vmNumber)
		if !selectedPeers[vmNumber] {
			continue
		}
		host := nodes[vm.HostID]
		for _, address := range vm.Addresses {
			parsed, err := netip.ParseAddr(address)
			if err != nil {
				continue
			}
			bits, family := 128, "ipv6"
			if parsed.Is4() {
				bits, family = 32, "ipv4"
			}
			vpc := vpcByID[vm.VPCID]
			state.Origins = append(state.Origins, Route{
				ID:     fmt.Sprintf("customer/%s/%s/%s", vm.ID, family, parsed),
				Prefix: netip.PrefixFrom(parsed, bits).String(), IPFamily: family,
				AFI: family, SAFI: "unicast", VPCID: vm.VPCID,
				RouteTarget: vpc.RouteTarget, OriginID: vm.ID, OriginLabel: vm.Label,
				OriginKind: "customer", SourceVMID: vm.ID, OriginASN: vm.ASN,
				NextHop: parsed.String(), NextHopNodeID: host.ID,
				LocalPreference: 100, MED: 0, OriginCode: 0,
			})
		}
	}
	for _, origin := range model.Config.RouteOrigins {
		borderID := fmt.Sprintf("border-%d", origin.BorderID)
		border := nodes[borderID]
		prefix, _ := netip.ParsePrefix(origin.Prefix)
		family := "ipv6"
		if prefix.Addr().Is4() {
			family = "ipv4"
		}
		route := makeRoute(
			"border/"+origin.ID, prefix.Masked().String(), family, origin.VPCID,
			border.ID, border.Label, "border", border.ASN, uint16(0xf000+origin.BorderID),
			border.IPv4, border.ID, 2, vpcByID[origin.VPCID],
		)
		// Configured uplinks are static egress destinations, not border BGP NLRI.
		route.Protocol, route.AFI, route.SAFI, route.RouteType, route.RD, route.OriginASN = "static", family, "unicast", 0, "", 0
		state.Origins = append(state.Origins, route)
	}
	// Border addresses are reachable through static underlay and per-VPC egress
	// routes, independently of any UPDATE from a border speaker.
	for _, border := range model.Nodes {
		if border.Kind != NodeBorder {
			continue
		}
		contexts := append([]VPCContext{}, state.VPCs...)
		public := false
		for _, context := range contexts {
			if context.ID == 0 {
				public = true
			}
		}
		if !public {
			contexts = append(contexts, VPCContext{})
		}
		for _, context := range contexts {
			for _, item := range []struct{ family, address string }{{"ipv4", border.IPv4}, {"ipv6", border.IPv6}} {
				bits := 128
				if item.family == "ipv4" {
					bits = 32
				}
				nextHop := border.IPv4
				if context.ID == 0 {
					nextHop = item.address
				}
				state.Origins = append(state.Origins, Route{ID: fmt.Sprintf("static/%s/vpc%d/%s", border.ID, context.ID, item.family),
					Protocol: "static", Prefix: netip.PrefixFrom(netip.MustParseAddr(item.address), bits).String(),
					IPFamily: item.family, AFI: item.family, SAFI: "unicast", VPCID: context.ID, VNI: context.VNI, RouteTarget: context.RouteTarget,
					OriginID: border.ID, OriginKind: "border", OriginLabel: border.Label, NextHop: nextHop, NextHopNodeID: border.ID, LocalPreference: 100})
			}
		}
	}
	sort.Slice(state.Origins, func(i, j int) bool { return state.Origins[i].ID < state.Origins[j].ID })

	entityByID := make(map[string]SessionEndpoint, len(model.Nodes)+len(model.VMs))
	for _, node := range model.Nodes {
		entityByID[node.ID] = SessionEndpoint{EntityType: "node", EntityID: node.ID, Kind: string(node.Kind), Label: node.Label, ASN: node.ASN}
	}
	for _, vm := range model.VMs {
		entityByID[vm.ID] = SessionEndpoint{EntityType: "vm", EntityID: vm.ID, Kind: string(vm.Role), Label: vm.Label, ASN: vm.ASN}
	}
	peersByEntity := make(map[string][]routePeer)
	underlayPeersByEntity := make(map[string][]routePeer)
	for _, session := range model.Sessions {
		peer := routePeer{Endpoint: session.B, Session: session}
		other := routePeer{Endpoint: session.A, Session: session}
		switch session.Kind {
		case "fabric", "host-tor":
			underlayPeersByEntity[session.A.EntityID] = append(underlayPeersByEntity[session.A.EntityID], peer)
			underlayPeersByEntity[session.B.EntityID] = append(underlayPeersByEntity[session.B.EntityID], other)
		default:
			if overlaySession(session.Kind) {
				peersByEntity[session.A.EntityID] = append(peersByEntity[session.A.EntityID], peer)
				peersByEntity[session.B.EntityID] = append(peersByEntity[session.B.EntityID], other)
			}
		}
	}
	for _, peerMap := range []map[string][]routePeer{peersByEntity, underlayPeersByEntity} {
		for id := range peerMap {
			sort.Slice(peerMap[id], func(i, j int) bool {
				return peerMap[id][i].Session.ID < peerMap[id][j].Session.ID
			})
		}
	}
	underlay := newUnderlay(model)

	allCandidates := make(map[string][]RouteCandidate)
	candidateBySpeakerAndRoute := make(map[string]map[string]RouteCandidate)
	for _, route := range state.Origins {
		if route.Protocol == "static" {
			continue
		}
		physicalTransit := route.OriginKind == "underlay"
		peers := peersByEntity
		if physicalTransit {
			peers = underlayPeersByEntity
		}
		start := route.OriginID
		if route.OriginKind == "host" {
			// A host/NVE originates VM prefixes; the VM itself is not made a BGP peer for EVPN.
			start = route.NextHopNodeID
		}
		if route.OriginKind == "border" {
			start = route.OriginID
		}
		previous := reachableRouteSpeakers(start, route, peers, entityByID, route.VPCID, vms, physicalTransit)
		for speakerID, path := range previous {
			endpoint, known := entityByID[speakerID]
			if !known {
				continue
			}
			if speakerID != start && containsASN(route.OriginASN, []uint32{endpoint.ASN}) {
				continue
			}
			fromID := ""
			nextHop, nextHopNodeID, nextHopInterfaceID := route.NextHop, route.NextHopNodeID, ""
			if speakerID != start {
				fromID = path[len(path)-2]
				if physicalTransit {
					for _, peer := range peers[speakerID] {
						if peer.Endpoint.EntityID == fromID {
							nextHop, nextHopNodeID, nextHopInterfaceID = peer.Endpoint.Address, fromID, peer.Endpoint.InterfaceID
							break
						}
					}
				}
			}
			resolution := underlay.resolve(speakerID, route.NextHopNodeID, nodes, vms)
			if !resolution.Reachable {
				continue
			}
			// Every eBGP hop, including this deployment's RSs, prepends its
			// own ASN. The receiving speaker is not part of its received path.
			asPath := make([]uint32, 0, len(path)-1)
			for index := len(path) - 2; index >= 0; index-- {
				asPath = append(asPath, entityByID[path[index]].ASN)
			}
			candidate := RouteCandidate{
				Route: route, SpeakerID: speakerID, ReceivedFrom: fromID,
				NextHopInterfaceID: nextHopInterfaceID,
				Path:               append([]string(nil), path...), ASPath: asPath,
				UnderlayCost: resolution.Cost, UnderlayNextHops: resolution.NextHops,
			}
			candidate.NextHop, candidate.NextHopNodeID = nextHop, nextHopNodeID
			allCandidates[speakerID] = append(allCandidates[speakerID], candidate)
			if candidateBySpeakerAndRoute[speakerID] == nil {
				candidateBySpeakerAndRoute[speakerID] = make(map[string]RouteCandidate)
			}
			candidateBySpeakerAndRoute[speakerID][route.ID] = candidate
		}
	}
	for speakerID := range allCandidates {
		sort.Slice(allCandidates[speakerID], func(i, j int) bool {
			return routeCandidateLess(allCandidates[speakerID][i], allCandidates[speakerID][j])
		})
	}

	selectedBySpeaker := make(map[string][]RouteCandidate)
	for speakerID, candidates := range allCandidates {
		bestByKey := make(map[string]RouteCandidate)
		for _, candidate := range candidates {
			key := routeSelectionKey(candidate.Route)
			previous, exists := bestByKey[key]
			if !exists || betterRoute(candidate, previous, entityByID) {
				bestByKey[key] = candidate
			}
		}
		for _, candidate := range bestByKey {
			candidate.Selected = true
			selectedBySpeaker[speakerID] = append(selectedBySpeaker[speakerID], candidate)
		}
		sort.Slice(selectedBySpeaker[speakerID], func(i, j int) bool {
			return routeCandidateLess(selectedBySpeaker[speakerID][i], selectedBySpeaker[speakerID][j])
		})
	}

	state.Tables = buildRouteTables(model, allCandidates, selectedBySpeaker)
	state.Advertisements = buildRouteAdvertisements(model, selectedBySpeaker, candidateBySpeakerAndRoute, entityByID, peersByEntity, underlayPeersByEntity)
	state.FlowExamples = buildFlowExamples(model, state)
	state.AdvertisementCounts = make(map[string]int, len(model.Sessions))
	for _, session := range model.Sessions {
		state.AdvertisementCounts[session.ID] = 0
	}
	for _, advertisement := range state.Advertisements {
		state.AdvertisementCounts[advertisement.SessionID]++
	}
	state.Forwarding = buildForwarding(model, selectedBySpeaker, state.Origins)
	state.Traffic = resolveTraffic(model, state.Forwarding, underlay)
	state.ControlPaths = resolveControlPaths(model, underlay)
	return state
}

func makeRoute(id, prefix, family string, vpcID uint32, originID, originLabel, originKind string, originASN uint32, nve uint16, nextHop string, nextHopNodeID string, originCode int, vpc VPCContext) Route {
	secondField := uint64(65536)*uint64(vpcID) + uint64(nve)
	return Route{
		ID: id, Prefix: prefix, IPFamily: family, AFI: "l2vpn", SAFI: "evpn", RouteType: 5,
		VPCID: vpcID, RD: fmt.Sprintf("64512:%d", secondField), RouteTarget: vpc.RouteTarget,
		VNI: vpc.VNI, OriginID: originID, OriginLabel: originLabel, OriginKind: originKind,
		OriginASN: originASN, OriginNVEID: nve, NextHop: nextHop, NextHopNodeID: nextHopNodeID,
		LocalPreference: 100, MED: 0, OriginCode: originCode,
	}
}

func buildVPCContexts(vpcs []VPCConfig) []VPCContext {
	result := make([]VPCContext, 0, len(vpcs))
	for _, vpc := range vpcs {
		vni := uint32(10000) + vpc.ID
		if vpc.ID == 0 {
			vni = 3
		}
		result = append(result, VPCContext{
			ID: vpc.ID, Name: vpc.Name, RouteTarget: fmt.Sprintf("target:64512:%d", vpc.ID), VNI: vni,
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result
}

func nveID(host Node) uint16 { return uint16((host.BoltID-1)*16 + host.HostID) }

func overlaySession(kind string) bool {
	switch kind {
	case "host-rs-bolt", "rs-bolt-rs-ctrl", "rs-ctrl-rs-user", "border-rs-ctrl", "customer-rs-user":
		return true
	default:
		return false
	}
}

func routeFamilySupported(session BGPSession, route Route) bool {
	for _, family := range session.Families {
		if family.AFI == route.AFI && family.SAFI == route.SAFI {
			if route.AFI != "l2vpn" || containsInt(family.RouteTypes, route.RouteType) {
				return true
			}
		}
	}
	return false
}

func reachableRouteSpeakers(start string, route Route, peers map[string][]routePeer, entities map[string]SessionEndpoint, vpcID uint32, vms map[string]VM, physicalTransit bool) map[string][]string {
	paths := map[string][]string{start: {start}}
	queue := []string{start}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if entities[current].Kind == "border" {
			continue
		}
		if !physicalTransit && current != start && !isRouteServerEntity(current) {
			continue
		}
		if physicalTransit && current != start && entities[current].Kind == "host" {
			continue
		}
		for _, peer := range peers[current] {
			neighbor := peer.Endpoint.EntityID
			if entities[current].Kind == string(VMUserRS) && entities[neighbor].Kind == string(VMCustomer) {
				continue // Customer sessions import from the VM; RS User never exports back.
			}
			if _, seen := paths[neighbor]; seen || !routeFamilySupported(peer.Session, route) {
				continue
			}
			if entity := entities[neighbor]; entity.EntityType == "vm" {
				if vm, ok := vms[neighbor]; ok && vm.Role == VMCustomer && vm.VPCID != vpcID {
					continue
				}
			}
			// Global host RIBs retain every advertised NLRI; VRF import belongs in forwarding.
			path := append(append([]string(nil), paths[current]...), neighbor)
			paths[neighbor] = path
			if physicalTransit || isRouteServerEntity(neighbor) {
				queue = append(queue, neighbor)
			}
		}
	}
	return paths
}

func isRouteServerEntity(id string) bool {
	return len(id) >= 3 && id[:3] == "rs-"
}

func containsInt(values []int, wanted int) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func containsASN(wanted uint32, values []uint32) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
}

func routeSelectionKey(route Route) string {
	return fmt.Sprintf("%d/%s/%s/%s/%d", route.VPCID, route.Prefix, route.AFI, route.SAFI, route.RouteType)
}

func betterRoute(a, b RouteCandidate, entities map[string]SessionEndpoint) bool {
	if a.LocalPreference != b.LocalPreference {
		return a.LocalPreference > b.LocalPreference
	}
	if len(a.ASPath) != len(b.ASPath) {
		return len(a.ASPath) < len(b.ASPath)
	}
	if a.OriginCode != b.OriginCode {
		return a.OriginCode < b.OriginCode
	}
	neighborA, neighborB := entities[a.ReceivedFrom], entities[b.ReceivedFrom]
	if a.ReceivedFrom != "" && b.ReceivedFrom != "" && neighborA.ASN == neighborB.ASN && a.MED != b.MED {
		return a.MED < b.MED
	}
	if a.UnderlayCost != b.UnderlayCost {
		return a.UnderlayCost < b.UnderlayCost
	}
	return a.OriginID < b.OriginID
}

func routeCandidateLess(a, b RouteCandidate) bool {
	if routeSelectionKey(a.Route) == routeSelectionKey(b.Route) {
		return a.OriginID < b.OriginID
	}
	return routeSelectionKey(a.Route) < routeSelectionKey(b.Route)
}

func buildRouteTables(model Model, received, selected map[string][]RouteCandidate) []BGPSpeakerTable {
	tables := make([]BGPSpeakerTable, 0, len(model.Nodes)+len(model.VMs))
	makeTable := func(id, label, kind string) BGPSpeakerTable {
		table := BGPSpeakerTable{SpeakerID: id, Label: label, Kind: kind, Selected: selected[id]}
		for _, candidate := range received[id] {
			if candidate.ReceivedFrom == "" {
				table.LocallyOriginated = append(table.LocallyOriginated, candidate)
			} else {
				table.Received = append(table.Received, candidate)
			}
		}
		return table
	}
	for _, node := range model.Nodes {
		tables = append(tables, makeTable(node.ID, node.Label, string(node.Kind)))
	}
	for _, vm := range model.VMs {
		tables = append(tables, makeTable(vm.ID, vm.Label, string(vm.Role)))
	}
	sort.Slice(tables, func(i, j int) bool { return tables[i].SpeakerID < tables[j].SpeakerID })
	return tables
}

func buildRouteAdvertisements(model Model, selected map[string][]RouteCandidate, reachable map[string]map[string]RouteCandidate, entities map[string]SessionEndpoint, overlayPeers, underlayPeers map[string][]routePeer) []RouteAdvertisement {
	var result []RouteAdvertisement
	seen := map[string]bool{}
	for speakerID, candidates := range selected {
		if entities[speakerID].Kind == "border" {
			continue
		}
		for _, candidate := range candidates {
			physicalTransit := candidate.OriginKind == "underlay"
			if physicalTransit && entities[speakerID].Kind == "host" && candidate.OriginID != speakerID {
				continue // Hosts advertise local/service prefixes, not fabric transit.
			}
			peers := overlayPeers
			if physicalTransit {
				peers = underlayPeers
			} else if !isRouteServerEntity(speakerID) && speakerID != candidate.OriginID {
				continue
			}
			for _, peer := range peers[speakerID] {
				recipient := peer.Endpoint.EntityID
				if entities[speakerID].Kind == string(VMUserRS) && entities[recipient].Kind == string(VMCustomer) {
					continue
				}
				if recipient == candidate.ReceivedFrom || !routeFamilySupported(peer.Session, candidate.Route) ||
					containsASN(entities[recipient].ASN, candidate.ASPath) {
					continue
				}
				if _, canReceive := reachable[recipient][candidate.ID]; !canReceive {
					continue
				}
				if entity := entities[recipient]; entity.EntityType == "vm" {
					if vm, ok := modelVMByID(model.VMs, recipient); ok && vm.Role == VMCustomer && vm.VPCID != candidate.VPCID {
						continue
					}
				}
				key := peer.Session.ID + "/" + speakerID + "/" + candidate.ID
				if seen[key] {
					continue
				}
				seen[key] = true
				asPath := append([]uint32{entities[speakerID].ASN}, candidate.ASPath...)
				nextHop, nextHopNodeID, nextHopInterfaceID := candidate.NextHop, candidate.NextHopNodeID, candidate.NextHopInterfaceID
				if physicalTransit {
					for _, endpoint := range []SessionEndpoint{peer.Session.A, peer.Session.B} {
						if endpoint.EntityID == speakerID {
							nextHop, nextHopNodeID, nextHopInterfaceID = endpoint.Address, speakerID, endpoint.InterfaceID
							break
						}
					}
				}
				result = append(result, RouteAdvertisement{
					ID: key, SessionID: peer.Session.ID, FromID: speakerID, ToID: recipient,
					RouteID: candidate.ID, Prefix: candidate.Prefix, VPCID: candidate.VPCID,
					AFI: candidate.AFI, SAFI: candidate.SAFI, RouteType: candidate.RouteType,
					RD: candidate.RD, RouteTarget: candidate.RouteTarget, VNI: candidate.VNI,
					OriginID: candidate.OriginID, LocalPreference: candidate.LocalPreference,
					MED: candidate.MED, OriginCode: candidate.OriginCode,
					NextHop: nextHop, NextHopNodeID: nextHopNodeID, NextHopInterfaceID: nextHopInterfaceID,
					ASPath:          asPath,
					PropagationPath: append(append([]string(nil), candidate.Path...), recipient),
				})
			}
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result
}

func modelVMByID(vms []VM, id string) (VM, bool) {
	for _, vm := range vms {
		if vm.ID == id {
			return vm, true
		}
	}
	return VM{}, false
}

func buildForwarding(model Model, selected map[string][]RouteCandidate, origins []Route) []ForwardingEntry {
	var result []ForwardingEntry
	hostVPCs := make(map[string]map[uint32]bool)
	for _, vm := range model.VMs {
		if vm.Role == VMCustomer {
			if hostVPCs[vm.HostID] == nil {
				hostVPCs[vm.HostID] = make(map[uint32]bool)
			}
			hostVPCs[vm.HostID][vm.VPCID] = true
		}
	}
	hostEntries := map[string][]ForwardingEntry{}
	for _, node := range model.Nodes {
		if node.Kind != NodeHost {
			continue
		}
		for _, overlay := range selected[node.ID] {
			if overlay.AFI != "l2vpn" || overlay.RouteType != 5 || (overlay.VPCID != 0 && !hostVPCs[node.ID][overlay.VPCID]) {
				continue
			}
			entry := forwardingEntry(node.ID, "host", node.ID, overlay)
			if overlay.VPCID == 0 {
				entry.VRF = "default"
				for _, unicast := range selected[node.ID] {
					if unicast.OriginKind != "customer" || unicast.VPCID != 0 || unicast.IPFamily != overlay.IPFamily {
						continue
					}
					address, err := netip.ParseAddr(unicast.NextHop)
					prefix, prefixErr := netip.ParsePrefix(overlay.Prefix)
					if err != nil || prefixErr != nil || !prefix.Contains(address) {
						continue
					}
					// Unicast stays unicast in table main. Its VM next hop resolves
					// through an imported Type-5 route to an IPv4 VTEP on VNI 3.
					entry = forwardingEntry(node.ID, "host", node.ID, unicast)
					entry.VRF, entry.Protocol = "default", "bgp"
					entry.ResolvedRouteID, entry.ResolvedNextHop = overlay.ID, overlay.NextHop
					entry.VNI, entry.RouteTarget = overlay.VNI, overlay.RouteTarget
					break
				}
			}
			hostEntries[node.ID] = append(hostEntries[node.ID], entry)
			result = append(result, entry)
		}
	}
	for _, vm := range model.VMs {
		if vm.Role != VMCustomer {
			continue
		}
		for _, entry := range hostEntries[vm.HostID] {
			if entry.VPCID != vm.VPCID {
				continue
			}
			entry.OwnerID, entry.OwnerType = vm.ID, "vpc-view"
			result = append(result, entry)
		}
	}
	nodes := map[string]Node{}
	vms := map[string]VM{}
	for _, node := range model.Nodes {
		nodes[node.ID] = node
	}
	for _, vm := range model.VMs {
		vms[vm.ID] = vm
	}
	underlay := newUnderlay(model)
	for _, route := range origins {
		if route.Protocol != "static" {
			continue
		}
		add := func(owner, kind, host string) {
			resolved := underlay.resolve(host, route.NextHopNodeID, nodes, vms)
			if !resolved.Reachable {
				return
			}
			candidate := RouteCandidate{Route: route, UnderlayCost: resolved.Cost, UnderlayNextHops: resolved.NextHops}
			entry := forwardingEntry(owner, kind, host, candidate)
			entry.EncapsulateVXLAN = route.VPCID != 0 && host != route.NextHopNodeID
			if route.VPCID == 0 {
				entry.VRF = "default"
			}
			result = append(result, entry)
		}
		if route.VPCID == 0 {
			for _, node := range model.Nodes {
				add(node.ID, string(node.Kind), node.ID)
			}
			for _, vm := range model.VMs {
				if vm.Role != VMCustomer {
					add(vm.ID, "infra", vm.HostID)
				} else if vm.VPCID == 0 {
					add(vm.ID, "vpc-view", vm.HostID)
				}
			}
			continue
		}
		for host, vpcs := range hostVPCs {
			if vpcs[route.VPCID] {
				add(host, "host", host)
			}
		}
		for _, vm := range model.VMs {
			if vm.Role == VMCustomer && vm.VPCID == route.VPCID {
				add(vm.ID, "vpc-view", vm.HostID)
			}
		}
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].OwnerID == result[j].OwnerID {
			if result[i].VPCID == result[j].VPCID {
				return result[i].Prefix < result[j].Prefix
			}
			return result[i].VPCID < result[j].VPCID
		}
		return result[i].OwnerID < result[j].OwnerID
	})
	return result
}

func forwardingEntry(ownerID, ownerType, sourceNVE string, candidate RouteCandidate) ForwardingEntry {
	return ForwardingEntry{
		Protocol: candidate.Protocol,
		OwnerID:  ownerID, OwnerType: ownerType, SourceNVE: sourceNVE,
		VPCID: candidate.VPCID, Prefix: candidate.Prefix, RouteID: candidate.ID, RouteType: candidate.RouteType,
		RD: candidate.RD, RouteTarget: candidate.RouteTarget, OriginID: candidate.OriginID,
		NextHop: candidate.NextHop, NextHopNodeID: candidate.NextHopNodeID,
		VNI: candidate.VNI, EncapsulateVXLAN: candidate.NextHopNodeID != sourceNVE,
		UnderlayCost: candidate.UnderlayCost, ECMPNextHops: append([]string(nil), candidate.UnderlayNextHops...),
	}
}

type underlayGraph struct {
	neighbors map[string][]string
	links     map[string]string
	hosts     map[string]bool
}

type underlayResult struct {
	Reachable bool
	Cost      int
	NextHops  []string
}

func newUnderlay(model Model) underlayGraph {
	graph := underlayGraph{neighbors: make(map[string][]string), links: make(map[string]string), hosts: make(map[string]bool)}
	for _, node := range model.Nodes {
		if node.Kind == NodeHost {
			graph.hosts[node.ID] = true
		}
	}
	for _, link := range model.Links {
		graph.neighbors[link.ANodeID] = append(graph.neighbors[link.ANodeID], link.BNodeID)
		graph.neighbors[link.BNodeID] = append(graph.neighbors[link.BNodeID], link.ANodeID)
		graph.links[physicalPairKey(link.ANodeID, link.BNodeID)] = link.ID
	}
	for id := range graph.neighbors {
		sort.Strings(graph.neighbors[id])
	}
	return graph
}

func (g underlayGraph) resolve(speakerID, nextHopNodeID string, nodes map[string]Node, vms map[string]VM) underlayResult {
	source := speakerID
	if node, ok := nodes[source]; !ok || node.Kind != NodeHost {
		if vm, ok := vms[source]; ok {
			source = vm.HostID
		}
	}
	if source == nextHopNodeID {
		return underlayResult{Reachable: true}
	}
	distance := map[string]int{nextHopNodeID: 0}
	queue := []string{nextHopNodeID}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, neighbor := range g.neighbors[current] {
			if _, seen := distance[neighbor]; seen {
				continue
			}
			distance[neighbor] = distance[current] + 1
			queue = append(queue, neighbor)
		}
	}
	cost, reachable := distance[source]
	if !reachable {
		return underlayResult{Reachable: false}
	}
	var nextHops []string
	for _, neighbor := range g.neighbors[source] {
		if distance[neighbor] == cost-1 {
			nextHops = append(nextHops, neighbor)
		}
	}
	sort.Strings(nextHops)
	return underlayResult{Reachable: true, Cost: cost, NextHops: nextHops}
}

func resolveTraffic(model Model, forwarding []ForwardingEntry, underlay underlayGraph) []ResolvedTraffic {
	return resolveTrafficInFamily(model, forwarding, underlay, "ipv4")
}

func resolveTrafficInFamily(model Model, forwarding []ForwardingEntry, underlay underlayGraph, family string) []ResolvedTraffic {
	vms := make(map[int]VM)
	vmByID := make(map[string]VM)
	nodes := make(map[string]Node)
	for _, node := range model.Nodes {
		nodes[node.ID] = node
	}
	for _, vm := range model.VMs {
		if vm.Role == VMCustomer {
			var id int
			_, _ = fmt.Sscanf(vm.ID, "customer-%d", &id)
			vms[id], vmByID[vm.ID] = vm, vm
		}
	}
	var results []ResolvedTraffic
	for _, request := range model.Config.Traffic {
		source, ok := vms[request.SourceVMID]
		if !ok {
			continue
		}
		result := ResolvedTraffic{ID: request.ID, SourceVMID: source.ID, VPCID: source.VPCID}
		var destination *VM
		var prefix netip.Prefix
		if request.DestinationVMID != nil {
			destinationID := fmt.Sprintf("customer-%d", *request.DestinationVMID)
			value, exists := vmByID[destinationID]
			if !exists {
				result.Reason = "destination-vm-not-found"
				results = append(results, result)
				continue
			}
			destination = &value
			result.DestinationVMID = value.ID
			result.DestinationID = value.ID
			result.DestinationLabel = value.Label
			if source.VPCID != value.VPCID {
				result.Reason = "cross-vpc-not-permitted"
				results = append(results, result)
				continue
			}
			destinationAddress, bits := value.IPv4, 32
			if family == "ipv6" {
				destinationAddress, bits = value.IPv6, 128
			}
			address, err := netip.ParseAddr(destinationAddress)
			if err != nil {
				result.Reason = "destination-address-invalid"
				results = append(results, result)
				continue
			}
			prefix = netip.PrefixFrom(address, bits)
		} else {
			parsed, err := netip.ParsePrefix(request.DestinationPrefix)
			if err != nil {
				result.Reason = "destination-prefix-invalid"
				results = append(results, result)
				continue
			}
			prefix = parsed.Masked()
			result.DestinationPrefix = prefix.String()
		}
		var entry *ForwardingEntry
		for index := range forwarding {
			candidate := &forwarding[index]
			if candidate.OwnerID != source.ID || candidate.VPCID != source.VPCID {
				continue
			}
			routePrefix, err := netip.ParsePrefix(candidate.Prefix)
			if err != nil || routePrefix.Addr().BitLen() != prefix.Addr().BitLen() || !routePrefix.Contains(prefix.Addr()) {
				continue
			}
			if entry == nil {
				entry = candidate
				continue
			}
			bestPrefix, _ := netip.ParsePrefix(entry.Prefix)
			if routePrefix.Bits() > bestPrefix.Bits() || (routePrefix.Bits() == bestPrefix.Bits() && candidate.RouteID < entry.RouteID) {
				entry = candidate
			}
		}
		if entry == nil {
			result.Reason = "no-matching-vpc-route"
			results = append(results, result)
			continue
		}
		result.RouteID = entry.RouteID
		result.NextHop = entry.NextHop
		result.NextHopNodeID = entry.NextHopNodeID
		result.VNI = entry.VNI
		result.VXLAN = entry.EncapsulateVXLAN
		result.DestinationPrefix = entry.Prefix
		if destination != nil {
			result.DestinationLabel = destination.Label
		}
		paths := underlay.shortestPaths(source.HostID, entry.NextHopNodeID)
		if len(paths) == 0 {
			result.Reason = "unresolved-underlay-next-hop"
			results = append(results, result)
			continue
		}
		selected := selectPath(request.ID+"/"+source.ID+"/"+result.DestinationPrefix, len(paths))
		path := paths[selected]
		result.Reachable = true
		result.LocalDelivery = destination != nil && destination.HostID == source.HostID
		result.PhysicalNodeIDs = path
		result.PhysicalLinkIDs = underlay.linkPath(path)
		result.UnderlayCost = len(path) - 1
		result.EqualCostPathCount = len(paths)
		result.SelectedPathIndex = selected
		result.ECMPNextHops = firstHops(underlay, source.HostID, path)
		sourceHost := nodes[source.HostID]
		result.LogicalHops = []string{source.Label, sourceHost.Label}
		if result.LocalDelivery {
			result.LogicalHops = append(result.LogicalHops, destination.Label)
		} else if destination != nil {
			destinationHost := nodes[destination.HostID]
			result.LogicalHops = append(result.LogicalHops, destinationHost.Label, destination.Label)
		} else if nextHop, exists := nodes[entry.NextHopNodeID]; exists {
			result.DestinationID = nextHop.ID
			result.DestinationLabel = nextHop.Label
			result.LogicalHops = append(result.LogicalHops, nextHop.Label)
		}
		results = append(results, result)
	}
	return results
}

func resolveControlPaths(model Model, underlay underlayGraph) []ResolvedControlPath {
	nodes := make(map[string]Node)
	for _, node := range model.Nodes {
		nodes[node.ID] = node
	}
	vms := make(map[string]VM)
	for _, vm := range model.VMs {
		vms[vm.ID] = vm
	}
	results := make([]ResolvedControlPath, 0, len(model.Sessions))
	for _, session := range model.Sessions {
		source := endpointUnderlayNode(session.A, nodes, vms)
		destination := endpointUnderlayNode(session.B, nodes, vms)
		result := ResolvedControlPath{SessionID: session.ID, FromID: session.A.EntityID, ToID: session.B.EntityID, Transport: session.Transport}
		if source == "" || destination == "" {
			result.Reason = "session-endpoint-not-found"
			results = append(results, result)
			continue
		}
		paths := underlay.shortestPaths(source, destination)
		if len(paths) == 0 {
			result.Reason = "unresolved-underlay-path"
			results = append(results, result)
			continue
		}
		selected := selectPath(session.ID, len(paths))
		path := paths[selected]
		result.Reachable = true
		result.PhysicalNodeIDs = path
		result.PhysicalLinkIDs = underlay.linkPath(path)
		result.UnderlayCost = len(path) - 1
		result.ECMPNextHops = firstHops(underlay, source, path)
		result.EqualCostPathCount = len(paths)
		result.SelectedPathIndex = selected
		results = append(results, result)
	}
	return results
}

func endpointUnderlayNode(endpoint SessionEndpoint, nodes map[string]Node, vms map[string]VM) string {
	if endpoint.EntityType == "node" {
		if _, ok := nodes[endpoint.EntityID]; ok {
			return endpoint.EntityID
		}
		return ""
	}
	if vm, ok := vms[endpoint.EntityID]; ok {
		return vm.HostID
	}
	return ""
}

func (g underlayGraph) shortestPaths(source, destination string) [][]string {
	if source == destination {
		return [][]string{{source}}
	}
	distance := map[string]int{destination: 0}
	queue := []string{destination}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if g.hosts[current] && current != source && current != destination {
			continue
		}
		for _, neighbor := range g.neighbors[current] {
			if _, seen := distance[neighbor]; seen {
				continue
			}
			distance[neighbor] = distance[current] + 1
			queue = append(queue, neighbor)
		}
	}
	if _, ok := distance[source]; !ok {
		return nil
	}
	var paths [][]string
	var walk func(current string, path []string)
	walk = func(current string, path []string) {
		if g.hosts[current] && current != source && current != destination {
			return
		}
		if current == destination {
			paths = append(paths, append([]string(nil), path...))
			return
		}
		for _, neighbor := range g.neighbors[current] {
			if distance[neighbor] == distance[current]-1 {
				walk(neighbor, append(path, neighbor))
			}
		}
	}
	walk(source, []string{source})
	return paths
}

func (g underlayGraph) linkPath(nodes []string) []string {
	links := make([]string, 0, max(0, len(nodes)-1))
	for index := 0; index+1 < len(nodes); index++ {
		if id := g.links[physicalPairKey(nodes[index], nodes[index+1])]; id != "" {
			links = append(links, id)
		}
	}
	return links
}

func physicalPairKey(a, b string) string {
	if b < a {
		a, b = b, a
	}
	return a + "\x00" + b
}

func firstHops(graph underlayGraph, source string, path []string) []string {
	if len(path) < 2 {
		return nil
	}
	cost := len(path) - 1
	distance := map[string]int{path[len(path)-1]: 0}
	queue := []string{path[len(path)-1]}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, neighbor := range graph.neighbors[current] {
			if _, seen := distance[neighbor]; seen {
				continue
			}
			distance[neighbor] = distance[current] + 1
			queue = append(queue, neighbor)
		}
	}
	var result []string
	for _, neighbor := range graph.neighbors[source] {
		if distance[neighbor] == cost-1 {
			result = append(result, neighbor)
		}
	}
	return result
}

func selectPath(key string, count int) int {
	if count < 2 {
		return 0
	}
	hash := fnv.New64a()
	_, _ = hash.Write([]byte(key))
	return int(hash.Sum64() % uint64(count))
}
