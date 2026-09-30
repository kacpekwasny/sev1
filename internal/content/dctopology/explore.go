package dctopology

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/netip"
	"sort"
)

type UpdateFlow struct {
	Example   *FlowExample         `json:"example,omitempty"`
	FromID    string               `json:"from_id"`
	ToID      string               `json:"to_id"`
	Reachable bool                 `json:"reachable"`
	Reason    string               `json:"reason,omitempty"`
	Route     *Route               `json:"route,omitempty"`
	Routes    []Route              `json:"routes"`
	Steps     []RouteAdvertisement `json:"steps"`
}

type PacketHop struct {
	EntityID string `json:"entity_id"`
	Ingress  string `json:"ingress,omitempty"`
	Egress   string `json:"egress,omitempty"`
	Stage    string `json:"stage"`
	TTL      int    `json:"ttl"`
}

type PacketInspection struct {
	FromID             string      `json:"from_id"`
	ToID               string      `json:"to_id"`
	Reachable          bool        `json:"reachable"`
	Reason             string      `json:"reason,omitempty"`
	Family             string      `json:"family"`
	Source             string      `json:"source"`
	Destination        string      `json:"destination"`
	Protocol           string      `json:"protocol"`
	Payload            string      `json:"payload"`
	TTL                int         `json:"ttl"`
	RouteID            string      `json:"route_id,omitempty"`
	VPCID              uint32      `json:"vpc_id,omitempty"`
	VNI                uint32      `json:"vni,omitempty"`
	VXLAN              bool        `json:"vxlan"`
	OuterSource        string      `json:"outer_source,omitempty"`
	OuterDestination   string      `json:"outer_destination,omitempty"`
	UDPSourcePort      int         `json:"udp_source_port,omitempty"`
	UDPDestinationPort int         `json:"udp_destination_port,omitempty"`
	PhysicalNodeIDs    []string    `json:"physical_node_ids"`
	PhysicalLinkIDs    []string    `json:"physical_link_ids"`
	DisplayHopIDs      []string    `json:"display_hop_ids"`
	Hops               []PacketHop `json:"hops"`
	EqualCostPathCount int         `json:"equal_cost_path_count"`
	SelectedPathIndex  int         `json:"selected_path_index"`
}

type explorationResponse struct {
	OK      bool              `json:"ok"`
	Message string            `json:"message,omitempty"`
	Update  *UpdateFlow       `json:"update_flow,omitempty"`
	Packet  *PacketInspection `json:"packet,omitempty"`
}

func (s *configStore) explore(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	model, loaded := s.snapshot, s.loaded
	s.mu.RUnlock()
	respond := func(status int, value explorationResponse) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(value)
	}
	if !loaded {
		respond(http.StatusConflict, explorationResponse{Message: "brak konfiguracji"})
		return
	}
	q := r.URL.Query()
	from, to := q.Get("from"), q.Get("to")
	if !knownEndpoint(model, from) || !knownEndpoint(model, to) {
		respond(http.StatusBadRequest, explorationResponse{Message: "wybierz istniejące urządzenie lub VM dla obu końców"})
		return
	}
	if from == to {
		respond(http.StatusBadRequest, explorationResponse{Message: "wybierz dwa różne urządzenia lub VM"})
		return
	}
	switch q.Get("kind") {
	case "update":
		routeID := q.Get("route")
		if routeID != "" {
			found := false
			for _, route := range model.Routes.Origins {
				found = found || route.ID == routeID
			}
			if !found {
				respond(http.StatusBadRequest, explorationResponse{Message: "nie znaleziono trasy"})
				return
			}
		}
		flow := InspectUpdateFlow(model, from, to, routeID)
		respond(http.StatusOK, explorationResponse{OK: true, Update: &flow})
	case "packet":
		family := q.Get("family")
		if family == "" {
			family = "ipv4"
		}
		if family != "ipv4" && family != "ipv6" {
			respond(http.StatusBadRequest, explorationResponse{Message: "niepoprawna rodzina pakietu"})
			return
		}
		var packet PacketInspection
		if id := q.Get("traffic"); id != "" {
			packet = InspectTrafficPacket(model, id)
			if family != "ipv4" || packet.FromID != from || packet.ToID != to {
				respond(http.StatusBadRequest, explorationResponse{Message: "wybierz końce i rodzinę skonfigurowanego przepływu"})
				return
			}
		} else {
			packet = InspectPacket(model, from, to, family)
		}
		respond(http.StatusOK, explorationResponse{OK: true, Packet: &packet})
	default:
		respond(http.StatusBadRequest, explorationResponse{Message: "nieznany rodzaj inspekcji"})
	}
}

func knownEndpoint(model Model, id string) bool {
	for _, node := range model.Nodes {
		if node.ID == id {
			return true
		}
	}
	for _, vm := range model.VMs {
		if vm.ID == id {
			return true
		}
	}
	return false
}

// InspectUpdateFlow follows actual expected exports for one NLRI. It is a
// snapshot explanation, not a convergence engine or a new routing calculation.
func InspectUpdateFlow(model Model, from, to, routeID string) UpdateFlow {
	flow := UpdateFlow{FromID: from, ToID: to, Routes: []Route{}, Steps: []RouteAdvertisement{}, Reason: "no-expected-advertisement-path"}
	origins := append([]Route(nil), model.Routes.Origins...)
	sort.SliceStable(origins, func(i, j int) bool {
		if (origins[i].RouteType == 5) != (origins[j].RouteType == 5) {
			return origins[i].RouteType == 5
		}
		return origins[i].ID < origins[j].ID
	})
	exports := map[string][]RouteAdvertisement{}
	for _, ad := range model.Routes.Advertisements {
		exports[ad.RouteID] = append(exports[ad.RouteID], ad)
	}
	for _, route := range origins {
		adjacency := map[string][]RouteAdvertisement{}
		for _, ad := range exports[route.ID] {
			adjacency[ad.FromID] = append(adjacency[ad.FromID], ad)
		}
		paths := map[string][]RouteAdvertisement{from: {}}
		queue := []string{from}
		for len(queue) > 0 {
			current := queue[0]
			queue = queue[1:]
			for _, ad := range adjacency[current] {
				if _, seen := paths[ad.ToID]; seen {
					continue
				}
				paths[ad.ToID] = append(append([]RouteAdvertisement(nil), paths[current]...), ad)
				queue = append(queue, ad.ToID)
			}
		}
		path, exists := paths[to]
		if !exists || len(path) == 0 {
			continue
		}
		flow.Routes = append(flow.Routes, route)
		if !flow.Reachable && (routeID == "" || routeID == route.ID) {
			copy := route
			flow.Route = &copy
			example := completeFlowExample(route, exports[route.ID])
			flow.Example = &example
			flow.Steps = path
			flow.Reachable = true
			flow.Reason = ""
		}
	}
	return flow
}

func InspectPacket(model Model, from, to, family string) PacketInspection {
	return inspectPacket(model, from, to, family, nil)
}

// InspectTrafficPacket decodes the already resolved preset without choosing a
// different route or ECMP path under the synthetic inspection flow identifier.
func InspectTrafficPacket(model Model, id string) PacketInspection {
	for _, flow := range model.Routes.Traffic {
		if flow.ID == id {
			return inspectPacket(model, flow.SourceVMID, flow.DestinationID, "ipv4", &flow)
		}
	}
	return PacketInspection{Reason: "configured-flow-not-found"}
}

func inspectPacket(model Model, from, to, family string, preset *ResolvedTraffic) PacketInspection {
	result := PacketInspection{FromID: from, ToID: to, Family: family, Protocol: "ICMP Echo Request", Payload: "SEV1: przykładowy pakiet", TTL: 64}
	if family == "ipv6" {
		result.Protocol = "ICMPv6 Echo Request"
	}
	nodes := map[string]Node{}
	vms := map[string]VM{}
	for _, n := range model.Nodes {
		nodes[n.ID] = n
	}
	for _, v := range model.VMs {
		vms[v.ID] = v
	}
	address := func(id string) string {
		if vm, ok := vms[id]; ok {
			if family == "ipv6" {
				return vm.IPv6
			}
			return vm.IPv4
		}
		if family == "ipv6" {
			return nodes[id].IPv6
		}
		return nodes[id].IPv4
	}
	underlayID := func(id string) string {
		if vm, ok := vms[id]; ok {
			return vm.HostID
		}
		return id
	}
	result.Source, result.Destination = address(from), address(to)
	if result.Source == "" || result.Destination == "" {
		result.Reason = "endpoint-address-unavailable"
		return result
	}
	source, sourceVM := vms[from]
	destination, destinationVM := vms[to]
	graph := newUnderlay(model)
	if sourceVM && source.Role == VMCustomer {
		var flow ResolvedTraffic
		if preset != nil {
			flow = *preset
			if !destinationVM && flow.DestinationPrefix != "" {
				prefix := netip.MustParsePrefix(flow.DestinationPrefix)
				address := prefix.Addr()
				if prefix.Contains(address.Next()) {
					address = address.Next()
				}
				result.Destination = address.String()
			}
		} else {
			var sourceNumber int
			_, _ = fmt.Sscanf(source.ID, "customer-%d", &sourceNumber)
			request := TrafficRequest{ID: "inspected-packet", SourceVMID: sourceNumber}
			if destinationVM && destination.Role == VMCustomer {
				var id int
				_, _ = fmt.Sscanf(destination.ID, "customer-%d", &id)
				request.DestinationVMID = &id
			} else if node, ok := nodes[to]; ok && node.Kind == NodeBorder {
				for _, route := range model.Routes.Origins {
					if route.OriginID == to && route.OriginKind == "border" && route.VPCID == source.VPCID && route.IPFamily == family {
						request.DestinationPrefix = route.Prefix
						prefix := netip.MustParsePrefix(route.Prefix)
						address := prefix.Addr()
						if prefix.Contains(address.Next()) {
							address = address.Next()
						}
						result.Destination = address.String()
						break
					}
				}
				if request.DestinationPrefix == "" {
					result.Reason = "no-matching-vpc-route"
					return result
				}
			} else {
				result.Reason = "tenant-target-not-supported"
				return result
			}
			scenario := model
			scenario.Config.Traffic = []TrafficRequest{request}
			flows := resolveTrafficInFamily(scenario, model.Routes.Forwarding, graph, family)
			if len(flows) == 0 {
				result.Reason = "no-matching-vpc-route"
				return result
			}
			flow = flows[0]
		}
		result.Reachable, result.Reason = flow.Reachable, flow.Reason
		result.RouteID = flow.RouteID
		result.VPCID = source.VPCID
		result.VNI = flow.VNI
		result.VXLAN = flow.VXLAN
		result.PhysicalNodeIDs, result.PhysicalLinkIDs = flow.PhysicalNodeIDs, flow.PhysicalLinkIDs
		result.EqualCostPathCount, result.SelectedPathIndex = flow.EqualCostPathCount, flow.SelectedPathIndex
	} else {
		if destinationVM && destination.Role == VMCustomer {
			result.Reason = "tenant-target-not-supported"
			return result
		}
		paths := graph.shortestPaths(underlayID(from), underlayID(to))
		if len(paths) == 0 {
			result.Reason = "unresolved-underlay-next-hop"
			return result
		}
		selected := selectPath(from+"/"+to+"/"+family, len(paths))
		result.PhysicalNodeIDs = paths[selected]
		result.PhysicalLinkIDs = graph.linkPath(paths[selected])
		result.EqualCostPathCount = len(paths)
		result.SelectedPathIndex = selected
		result.Reachable = true
		for _, route := range model.Routes.Origins {
			if route.OriginKind == "underlay" && route.IPFamily == family && route.Prefix == result.Destination+map[string]string{"ipv4": "/32", "ipv6": "/128"}[family] {
				result.RouteID = route.ID
				break
			}
		}
	}
	if !result.Reachable {
		return result
	}
	if result.VXLAN {
		result.OuterSource = nodes[underlayID(from)].IPv4
		result.OuterDestination = nodes[result.PhysicalNodeIDs[len(result.PhysicalNodeIDs)-1]].IPv4
		result.UDPSourcePort = 49152
		result.UDPDestinationPort = 4789
	}
	localName := func(id string, tap bool) string {
		for _, link := range model.LocalLinks {
			if link.VMID == id {
				wanted := link.GuestInterfaceID
				if tap {
					wanted = link.TapInterfaceID
				}
				for _, iface := range model.LocalInterfaces {
					if iface.ID == wanted {
						return iface.Name
					}
				}
			}
		}
		return ""
	}
	if sourceVM {
		result.DisplayHopIDs = append(result.DisplayHopIDs, from)
		result.Hops = append(result.Hops, PacketHop{EntityID: from, Egress: localName(from, false), Stage: "VM → TAP", TTL: 64})
	}
	for index, id := range result.PhysicalNodeIDs {
		hop := PacketHop{EntityID: id, Stage: "routowanie IP", TTL: 64 - index}
		if sourceVM && !result.VXLAN {
			hop.TTL--
		}
		if result.VXLAN {
			hop.Stage = "underlay IPv4 / VXLAN"
			if index == 0 {
				hop.Stage = "enkapsulacja VXLAN"
			}
			if index == len(result.PhysicalNodeIDs)-1 {
				hop.Stage = "dekapsulacja VXLAN"
			}
		}
		if index == 0 && sourceVM {
			hop.Ingress = localName(from, true)
		}
		if index == len(result.PhysicalNodeIDs)-1 && destinationVM {
			hop.Egress = localName(to, true)
		}
		for _, iface := range model.Interfaces {
			if iface.NodeID != id {
				continue
			}
			if index > 0 && iface.PeerNodeID == result.PhysicalNodeIDs[index-1] {
				hop.Ingress = iface.Name
			}
			if index+1 < len(result.PhysicalNodeIDs) && iface.PeerNodeID == result.PhysicalNodeIDs[index+1] {
				hop.Egress = iface.Name
			}
		}
		result.DisplayHopIDs = append(result.DisplayHopIDs, id)
		result.Hops = append(result.Hops, hop)
	}
	if destinationVM {
		ttl := 64 - len(result.PhysicalNodeIDs)
		if result.VXLAN {
			ttl = 62
		}
		result.DisplayHopIDs = append(result.DisplayHopIDs, to)
		result.Hops = append(result.Hops, PacketHop{EntityID: to, Ingress: localName(to, false), Stage: "TAP → VM", TTL: ttl})
	}
	return result
}
