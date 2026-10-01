package dctopology

import (
	"encoding/binary"
	"fmt"
	"net/netip"
	"sort"
)

type NodeKind string

const (
	NodeBorder NodeKind = "border"
	NodeStem   NodeKind = "stem"
	NodeSpine  NodeKind = "spine"
	NodeLeaf   NodeKind = "leaf"
	NodeToR    NodeKind = "tor"
	NodeHost   NodeKind = "host"
)

type Node struct {
	ID                string   `json:"id"`
	Label             string   `json:"label"`
	Kind              NodeKind `json:"kind"`
	ASN               uint32   `json:"asn"`
	IPv4              string   `json:"ipv4"`
	IPv6              string   `json:"ipv6"`
	RoleIndex         int      `json:"role_index"`
	BoltID            int      `json:"bolt_id,omitempty"`
	RackID            int      `json:"rack_id,omitempty"`
	HostID            int      `json:"host_id,omitempty"`
	GroupID           string   `json:"group_id,omitempty"`
	InterfaceIDs      []string `json:"interface_ids,omitempty"`
	LocalInterfaceIDs []string `json:"local_interface_ids,omitempty"`
}

type Group struct {
	ID            string   `json:"id"`
	Kind          string   `json:"kind"`
	Label         string   `json:"label"`
	ParentID      string   `json:"parent_id,omitempty"`
	NodeIDs       []string `json:"node_ids"`
	ChildGroupIDs []string `json:"child_group_ids,omitempty"`
}

type Interface struct {
	Kind          string `json:"kind,omitempty"`
	VPCID         uint32 `json:"vpc_id,omitempty"`
	ID            string `json:"id"`
	NodeID        string `json:"node_id"`
	PeerNodeID    string `json:"peer_node_id"`
	LinkID        string `json:"link_id"`
	Name          string `json:"name"`
	IPv4Address   string `json:"ipv4_address,omitempty"`
	IPv4Prefix    string `json:"ipv4_prefix,omitempty"`
	IPv6Address   string `json:"ipv6_address,omitempty"`
	IPv6Prefix    string `json:"ipv6_prefix,omitempty"`
	LinkLocalIPv6 string `json:"link_local_ipv6,omitempty"`
}

type PhysicalLink struct {
	ID           string `json:"id"`
	ANodeID      string `json:"a_node_id"`
	BNodeID      string `json:"b_node_id"`
	AInterfaceID string `json:"a_interface_id"`
	BInterfaceID string `json:"b_interface_id"`
	Unnumbered   bool   `json:"unnumbered"`
}

type Model struct {
	Config          Config         `json:"config"`
	Nodes           []Node         `json:"nodes"`
	Groups          []Group        `json:"groups"`
	Interfaces      []Interface    `json:"interfaces"`
	LocalInterfaces []Interface    `json:"local_interfaces"`
	LocalLinks      []LocalLink    `json:"local_links"`
	Links           []PhysicalLink `json:"physical_links"`
	VMs             []VM           `json:"vms"`
	Sessions        []BGPSession   `json:"bgp_sessions"`
	Routes          RouteState     `json:"route_state"`
}

type BuildError struct {
	Message string
}

func (e *BuildError) Error() string { return e.Message }

func BuildTopology(config Config) (Model, error) {
	if err := config.Validate(); err != nil {
		return Model{}, err
	}
	ipv6 := config.Addressing.IPv6
	model := Model{Config: config}
	nodeIndex := make(map[string]int)
	addNode := func(node Node) error {
		if _, exists := nodeIndex[node.ID]; exists {
			return &BuildError{Message: "powtórzone ID urządzenia: " + node.ID}
		}
		nodeIndex[node.ID] = len(model.Nodes)
		model.Nodes = append(model.Nodes, node)
		return nil
	}
	addGroup := func(group Group) { model.Groups = append(model.Groups, group) }
	t := config.Topology
	for id := 1; id <= t.Borders; id++ {
		if err := addNode(newFabricNode(ipv6, NodeBorder, id, 0, 0, 0)); err != nil {
			return Model{}, err
		}
	}
	for id := 1; id <= t.Stems; id++ {
		if err := addNode(newFabricNode(ipv6, NodeStem, id, 0, 0, 0)); err != nil {
			return Model{}, err
		}
	}
	for id := 1; id <= t.Spines; id++ {
		if err := addNode(newFabricNode(ipv6, NodeSpine, id, 0, 0, 0)); err != nil {
			return Model{}, err
		}
	}
	for bolt := 1; bolt <= t.Bolts; bolt++ {
		group := Group{ID: boltGroupID(bolt), Kind: "bolt", Label: fmt.Sprintf("Bolt %02d", bolt)}
		for leaf := 1; leaf <= t.LeavesPerBolt; leaf++ {
			node := newFabricNode(ipv6, NodeLeaf, leaf, bolt, 0, 0)
			node.GroupID = group.ID
			group.NodeIDs = append(group.NodeIDs, node.ID)
			if err := addNode(node); err != nil {
				return Model{}, err
			}
		}
		for rack := 1; rack <= t.RacksPerBolt; rack++ {
			rackGroup := Group{ID: rackGroupID(bolt, rack), Kind: "rack", Label: fmt.Sprintf("Rack %02d", rack), ParentID: group.ID}
			group.ChildGroupIDs = append(group.ChildGroupIDs, rackGroup.ID)
			for tor := 1; tor <= 2; tor++ {
				node := newFabricNode(ipv6, NodeToR, tor, bolt, rack, 0)
				node.GroupID = rackGroup.ID
				rackGroup.NodeIDs = append(rackGroup.NodeIDs, node.ID)
				if err := addNode(node); err != nil {
					return Model{}, err
				}
			}
			for host := 1; host <= t.HostsPerRack; host++ {
				hostID := (rack-1)*t.HostsPerRack + host
				node := newHostNode(ipv6, bolt, rack, hostID)
				node.GroupID = rackGroup.ID
				rackGroup.NodeIDs = append(rackGroup.NodeIDs, node.ID)
				if err := addNode(node); err != nil {
					return Model{}, err
				}
			}
			addGroup(rackGroup)
		}
		addGroup(group)
	}

	addLinks := func(aID, bID string) error {
		if _, ok := nodeIndex[aID]; !ok {
			return &BuildError{Message: "nieznany koniec łącza: " + aID}
		}
		if _, ok := nodeIndex[bID]; !ok {
			return &BuildError{Message: "nieznany koniec łącza: " + bID}
		}
		if aID == bID {
			return &BuildError{Message: "łącze nie może łączyć urządzenia z samym sobą"}
		}
		if bID < aID {
			aID, bID = bID, aID
		}
		linkID := "link/" + aID + "--" + bID
		for _, existing := range model.Links {
			if existing.ID == linkID {
				return &BuildError{Message: "powtórzone łącze: " + linkID}
			}
		}
		aIfID := aID + "/if/" + bID
		bIfID := bID + "/if/" + aID
		aInterface, bInterface := buildLinkInterfaces(linkID, aID, bID, aIfID, bIfID)
		model.Interfaces = append(model.Interfaces, aInterface, bInterface)
		model.Nodes[nodeIndex[aID]].InterfaceIDs = append(model.Nodes[nodeIndex[aID]].InterfaceIDs, aIfID)
		model.Nodes[nodeIndex[bID]].InterfaceIDs = append(model.Nodes[nodeIndex[bID]].InterfaceIDs, bIfID)
		model.Links = append(model.Links, PhysicalLink{
			ID: linkID, ANodeID: aID, BNodeID: bID,
			AInterfaceID: aIfID, BInterfaceID: bIfID, Unnumbered: true,
		})
		return nil
	}
	connect := func(left, right []Node) error {
		for _, a := range left {
			for _, b := range right {
				if err := addLinks(a.ID, b.ID); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := connect(nodesOfKind(model.Nodes, NodeBorder), nodesOfKind(model.Nodes, NodeStem)); err != nil {
		return Model{}, err
	}
	if err := connect(nodesOfKind(model.Nodes, NodeStem), nodesOfKind(model.Nodes, NodeSpine)); err != nil {
		return Model{}, err
	}
	spines := nodesOfKind(model.Nodes, NodeSpine)
	for bolt := 1; bolt <= t.Bolts; bolt++ {
		if err := connect(spines, nodesForBolt(model.Nodes, NodeLeaf, bolt)); err != nil {
			return Model{}, err
		}
		leaves := nodesForBolt(model.Nodes, NodeLeaf, bolt)
		for rack := 1; rack <= t.RacksPerBolt; rack++ {
			tors := nodesForRack(model.Nodes, bolt, rack, NodeToR)
			if err := connect(leaves, tors); err != nil {
				return Model{}, err
			}
			hosts := nodesForRack(model.Nodes, bolt, rack, NodeHost)
			if err := connect(hosts, tors); err != nil {
				return Model{}, err
			}
		}
	}

	for i := range model.Nodes {
		sort.Strings(model.Nodes[i].InterfaceIDs)
	}
	sort.Slice(model.Interfaces, func(i, j int) bool { return model.Interfaces[i].ID < model.Interfaces[j].ID })
	sort.Slice(model.Links, func(i, j int) bool { return model.Links[i].ID < model.Links[j].ID })
	sort.Slice(model.Groups, func(i, j int) bool {
		if model.Groups[i].Kind == model.Groups[j].Kind {
			return model.Groups[i].ID < model.Groups[j].ID
		}
		return model.Groups[i].Kind < model.Groups[j].Kind
	})
	vms, err := buildVMs(config, model.Nodes)
	if err != nil {
		return Model{}, err
	}
	model.VMs = vms
	buildLocalInterfaces(&model)
	if err := buildSessions(&model); err != nil {
		return Model{}, err
	}
	model.Routes = BuildExpectedRouteState(model)
	for _, path := range model.Routes.ControlPaths {
		if !path.Reachable {
			for i := range model.Sessions {
				if model.Sessions[i].ID == path.SessionID {
					model.Sessions[i].State = "blocked"
				}
			}
		}
	}
	return model, nil
}

func newFabricNode(ipv6 IPv6Config, kind NodeKind, id, bolt, rack, host int) Node {
	nodeID := ""
	label := ""
	var ipv4Index, ipv6ID uint32
	var asn uint32
	switch kind {
	case NodeBorder:
		nodeID, label = fmt.Sprintf("border-%d", id), fmt.Sprintf("Border %02d", id)
		ipv4Index, ipv6ID, asn = uint32(id), uint32(id), uint32(64512+id-1)
	case NodeStem:
		nodeID, label = fmt.Sprintf("stem-%d", id), fmt.Sprintf("Stem %02d", id)
		ipv4Index, ipv6ID, asn = uint32(4+id), uint32(4+id), uint32(64516+id-1)
	case NodeSpine:
		nodeID, label = fmt.Sprintf("spine-%d", id), fmt.Sprintf("Spine %02d", id)
		ipv4Index, ipv6ID, asn = uint32(8+id), uint32(8+id), uint32(64520+id-1)
	case NodeLeaf:
		nodeID = fmt.Sprintf("leaf-b%d-%d", bolt, id)
		label = fmt.Sprintf("Leaf %d.%d", bolt, id)
		slot := (bolt-1)*4 + id
		ipv4Index, ipv6ID, asn = uint32(16+slot), uint32(16+slot), uint32(64528+slot-1)
	case NodeToR:
		nodeID = fmt.Sprintf("tor-b%d-r%d-%d", bolt, rack, id)
		label = fmt.Sprintf("ToR %d.%d.%d", bolt, rack, id)
		slot := (bolt-1)*8 + (rack-1)*2 + id
		ipv4Index, ipv6ID, asn = uint32(32+slot), uint32(32+slot), uint32(64544+slot-1)
	}
	ipv4 := ipv4FromPool("10.0.0.0/12", uint64(ipv4Index))
	v6 := ipv6.identity(1, 0, ipv6ID)
	return Node{ID: nodeID, Label: label, Kind: kind, RoleIndex: id, ASN: asn, IPv4: ipv4.String(), IPv6: v6.String(), BoltID: bolt, RackID: rack}
}

func newHostNode(ipv6 IPv6Config, bolt, rack, hostID int) Node {
	globalID := (bolt-1)*16 + hostID
	ipv4 := ipv4FromPool("10.16.0.0/12", uint64(globalID))
	v6 := ipv6.identity(2, uint16(bolt), uint32(hostID))
	return Node{
		ID: hostNodeID(bolt, hostID), Label: HostLabel(bolt, hostID), Kind: NodeHost,
		ASN: uint32(64576 + globalID - 1), IPv4: ipv4.String(), IPv6: v6.String(),
		BoltID: bolt, RackID: rack, HostID: hostID, RoleIndex: hostID, GroupID: rackGroupID(bolt, rack),
	}
}

func HostLabel(boltID, hostID int) string { return fmt.Sprintf("h%d%03d", boltID, hostID) }

func hostNodeID(boltID, hostID int) string { return fmt.Sprintf("host-b%d-h%d", boltID, hostID) }

func boltGroupID(boltID int) string { return fmt.Sprintf("bolt-%d", boltID) }

func rackGroupID(boltID, rackID int) string { return fmt.Sprintf("rack-b%d-r%d", boltID, rackID) }

func nodesOfKind(nodes []Node, kind NodeKind) []Node {
	var result []Node
	for _, node := range nodes {
		if node.Kind == kind {
			result = append(result, node)
		}
	}
	return result
}

func nodesForBolt(nodes []Node, kind NodeKind, bolt int) []Node {
	var result []Node
	for _, node := range nodes {
		if node.Kind == kind && node.BoltID == bolt {
			result = append(result, node)
		}
	}
	return result
}

func nodesForRack(nodes []Node, bolt, rack int, kind NodeKind) []Node {
	var result []Node
	for _, node := range nodes {
		if node.Kind == kind && node.BoltID == bolt && node.RackID == rack {
			result = append(result, node)
		}
	}
	return result
}

func ipv4FromPool(rawPrefix string, offset uint64) netip.Addr {
	prefix := netip.MustParsePrefix(rawPrefix)
	base := binary.BigEndian.Uint32(prefix.Addr().AsSlice())
	value := base + uint32(offset)
	return netip.AddrFrom4([4]byte{
		byte(value >> 24), byte(value >> 16), byte(value >> 8), byte(value),
	})
}

// Link-local addresses are reusable because every endpoint carries its interface scope.
func buildLinkInterfaces(linkID, aID, bID, aIfID, bIfID string) (Interface, Interface) {
	a := Interface{ID: aIfID, NodeID: aID, PeerNodeID: bID, LinkID: linkID, Name: "to-" + bID, LinkLocalIPv6: "fe80::1"}
	b := Interface{ID: bIfID, NodeID: bID, PeerNodeID: aID, LinkID: linkID, Name: "to-" + aID, LinkLocalIPv6: "fe80::2"}
	return a, b
}
