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
	ID           string   `json:"id"`
	Label        string   `json:"label"`
	Kind         NodeKind `json:"kind"`
	ASN          uint32   `json:"asn"`
	IPv4         string   `json:"ipv4"`
	IPv6         string   `json:"ipv6"`
	RoleIndex    int      `json:"role_index"`
	BoltID       int      `json:"bolt_id,omitempty"`
	RackID       int      `json:"rack_id,omitempty"`
	HostID       int      `json:"host_id,omitempty"`
	GroupID      string   `json:"group_id,omitempty"`
	InterfaceIDs []string `json:"interface_ids,omitempty"`
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
	Config     Config         `json:"config"`
	Nodes      []Node         `json:"nodes"`
	Groups     []Group        `json:"groups"`
	Interfaces []Interface    `json:"interfaces"`
	Links      []PhysicalLink `json:"physical_links"`
	VMs        []VM           `json:"vms"`
	Sessions   []BGPSession   `json:"bgp_sessions"`
	Routes     RouteState     `json:"route_state"`
}

type BuildError struct {
	Message string
}

func (e *BuildError) Error() string { return e.Message }

func BuildTopology(config Config) (Model, error) {
	if err := config.Validate(); err != nil {
		return Model{}, err
	}
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
	linkSlots := map[uint64]string{}
	addGroup := func(group Group) { model.Groups = append(model.Groups, group) }
	t := config.Topology
	for id := 1; id <= t.Borders; id++ {
		if err := addNode(newFabricNode(NodeBorder, id, 0, 0, 0)); err != nil {
			return Model{}, err
		}
	}
	for id := 1; id <= t.Stems; id++ {
		if err := addNode(newFabricNode(NodeStem, id, 0, 0, 0)); err != nil {
			return Model{}, err
		}
	}
	for id := 1; id <= t.Spines; id++ {
		if err := addNode(newFabricNode(NodeSpine, id, 0, 0, 0)); err != nil {
			return Model{}, err
		}
	}
	for bolt := 1; bolt <= t.Bolts; bolt++ {
		group := Group{ID: boltGroupID(bolt), Kind: "bolt", Label: fmt.Sprintf("Bolt %02d", bolt)}
		for leaf := 1; leaf <= t.LeavesPerBolt; leaf++ {
			node := newFabricNode(NodeLeaf, leaf, bolt, 0, 0)
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
				node := newFabricNode(NodeToR, tor, bolt, rack, 0)
				node.GroupID = rackGroup.ID
				rackGroup.NodeIDs = append(rackGroup.NodeIDs, node.ID)
				if err := addNode(node); err != nil {
					return Model{}, err
				}
			}
			for host := 1; host <= t.HostsPerRack; host++ {
				hostID := (rack-1)*t.HostsPerRack + host
				node := newHostNode(bolt, rack, hostID)
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

	addLinks := func(aID, bID string, unnumbered bool) error {
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
		slot := uint64(0)
		if !unnumbered {
			var ok bool
			slot, ok = stableLinkSlot(model.Nodes[nodeIndex[aID]], model.Nodes[nodeIndex[bID]], t)
			if !ok {
				return &BuildError{Message: "brak stabilnego przydziału adresów dla łącza " + linkID}
			}
			if previous, exists := linkSlots[slot]; exists {
				return &BuildError{Message: fmt.Sprintf("kolidujące przydziały adresów łączy: %s i %s", previous, linkID)}
			}
			linkSlots[slot] = linkID
		}
		aInterface, bInterface, err := buildLinkInterfaces(linkID, aID, bID, aIfID, bIfID, unnumbered, slot)
		if err != nil {
			return err
		}
		model.Interfaces = append(model.Interfaces, aInterface, bInterface)
		model.Nodes[nodeIndex[aID]].InterfaceIDs = append(model.Nodes[nodeIndex[aID]].InterfaceIDs, aIfID)
		model.Nodes[nodeIndex[bID]].InterfaceIDs = append(model.Nodes[nodeIndex[bID]].InterfaceIDs, bIfID)
		model.Links = append(model.Links, PhysicalLink{
			ID: linkID, ANodeID: aID, BNodeID: bID,
			AInterfaceID: aIfID, BInterfaceID: bIfID, Unnumbered: unnumbered,
		})
		return nil
	}
	connect := func(left, right []Node, unnumbered bool) error {
		for _, a := range left {
			for _, b := range right {
				if err := addLinks(a.ID, b.ID, unnumbered); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := connect(nodesOfKind(model.Nodes, NodeBorder), nodesOfKind(model.Nodes, NodeStem), false); err != nil {
		return Model{}, err
	}
	if err := connect(nodesOfKind(model.Nodes, NodeStem), nodesOfKind(model.Nodes, NodeSpine), false); err != nil {
		return Model{}, err
	}
	spines := nodesOfKind(model.Nodes, NodeSpine)
	for bolt := 1; bolt <= t.Bolts; bolt++ {
		if err := connect(spines, nodesForBolt(model.Nodes, NodeLeaf, bolt), false); err != nil {
			return Model{}, err
		}
		leaves := nodesForBolt(model.Nodes, NodeLeaf, bolt)
		for rack := 1; rack <= t.RacksPerBolt; rack++ {
			tors := nodesForRack(model.Nodes, bolt, rack, NodeToR)
			if err := connect(leaves, tors, false); err != nil {
				return Model{}, err
			}
			hosts := nodesForRack(model.Nodes, bolt, rack, NodeHost)
			if err := connect(hosts, tors, true); err != nil {
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
	if err := buildSessions(&model); err != nil {
		return Model{}, err
	}
	model.Routes = BuildExpectedRouteState(model)
	return model, nil
}

func newFabricNode(kind NodeKind, id, bolt, rack, host int) Node {
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
	ipv6 := identityIPv6(1, 0, ipv6ID)
	return Node{ID: nodeID, Label: label, Kind: kind, RoleIndex: id, ASN: asn, IPv4: ipv4.String(), IPv6: ipv6.String(), BoltID: bolt, RackID: rack}
}

func newHostNode(bolt, rack, hostID int) Node {
	globalID := (bolt-1)*16 + hostID
	ipv4 := ipv4FromPool("10.16.0.0/12", uint64(globalID))
	ipv6 := identityIPv6(2, uint16(bolt), uint32(hostID))
	return Node{
		ID: hostNodeID(bolt, hostID), Label: HostLabel(bolt, hostID), Kind: NodeHost,
		ASN: uint32(64576 + globalID - 1), IPv4: ipv4.String(), IPv6: ipv6.String(),
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

func identityIPv6(role, scope uint16, entity uint32) netip.Addr {
	var raw [16]byte
	parts := [8]uint16{0x2001, 0x0db8, role, scope, uint16(entity >> 16), uint16(entity), 0, 1}
	for i, part := range parts {
		binary.BigEndian.PutUint16(raw[i*2:], part)
	}
	return netip.AddrFrom16(raw)
}

func buildLinkInterfaces(linkID, aID, bID, aIfID, bIfID string, unnumbered bool, slot uint64) (Interface, Interface, error) {
	a := Interface{ID: aIfID, NodeID: aID, PeerNodeID: bID, LinkID: linkID, Name: "to-" + bID}
	b := Interface{ID: bIfID, NodeID: bID, PeerNodeID: aID, LinkID: linkID, Name: "to-" + aID}
	if unnumbered {
		a.LinkLocalIPv6, b.LinkLocalIPv6 = "fe80::1", "fe80::2"
		return a, b, nil
	}
	v4Offset := slot * 2
	v4Prefix := prefixFromOffset("10.128.0.0/12", v4Offset, 31)
	v4a := addIPv4Offset(netip.MustParseAddr("10.128.0.0"), v4Offset)
	v4b := addIPv4Offset(netip.MustParseAddr("10.128.0.0"), v4Offset+1)
	v6Base := netip.MustParseAddr("2001:db8:100::")
	v6Offset := slot * 2
	v6Prefix := prefixFromOffsetV6(v6Base, v6Offset, 127)
	v6a := addIPv6Offset(v6Base, v6Offset)
	v6b := addIPv6Offset(v6Base, v6Offset+1)
	a.IPv4Address, b.IPv4Address = v4a.String(), v4b.String()
	a.IPv4Prefix, b.IPv4Prefix = v4Prefix, v4Prefix
	a.IPv6Address, b.IPv6Address = v6a.String(), v6b.String()
	a.IPv6Prefix, b.IPv6Prefix = v6Prefix, v6Prefix
	return a, b, nil
}

func stableLinkSlot(a, b Node, topology TopologyConfig) (uint64, bool) {
	if a.Kind == NodeStem && b.Kind == NodeBorder {
		a, b = b, a
	}
	if a.Kind == NodeBorder && b.Kind == NodeStem {
		return uint64(1 + (a.RoleIndex-1)*4 + (b.RoleIndex - 1)), true
	}
	if a.Kind == NodeStem && b.Kind == NodeSpine || a.Kind == NodeSpine && b.Kind == NodeStem {
		if a.Kind == NodeSpine {
			a, b = b, a
		}
		return uint64(1 + 16 + (a.RoleIndex-1)*8 + (b.RoleIndex - 1)), true
	}
	if a.Kind == NodeSpine && b.Kind == NodeLeaf || a.Kind == NodeLeaf && b.Kind == NodeSpine {
		if a.Kind == NodeLeaf {
			a, b = b, a
		}
		leafIndex := (b.BoltID-1)*4 + b.RoleIndex - 1
		return uint64(1 + 48 + (a.RoleIndex-1)*16 + leafIndex), true
	}
	if a.Kind == NodeLeaf && b.Kind == NodeToR || a.Kind == NodeToR && b.Kind == NodeLeaf {
		if a.Kind == NodeToR {
			a, b = b, a
		}
		leafIndex := a.RoleIndex - 1
		torIndex := (b.BoltID-1)*32 + leafIndex*8 + (b.RackID-1)*2 + b.RoleIndex - 1
		return uint64(1 + 176 + torIndex), true
	}
	if a.Kind == NodeHost && b.Kind == NodeToR || a.Kind == NodeToR && b.Kind == NodeHost {
		if a.Kind == NodeToR {
			a, b = b, a
		}
		hostInRack := a.HostID - (a.RackID-1)*topology.HostsPerRack - 1
		torIndex := (a.BoltID-1)*32 + (a.RackID-1)*8 + hostInRack*2 + b.RoleIndex - 1
		return uint64(1 + 304 + torIndex), false
	}
	return 0, false
}

func prefixFromOffset(base string, offset uint64, bits int) string {
	address := addIPv4Offset(netip.MustParseAddr(netip.MustParsePrefix(base).Addr().String()), offset)
	return netip.PrefixFrom(address, bits).Masked().String()
}

func prefixFromOffsetV6(base netip.Addr, offset uint64, bits int) string {
	return netip.PrefixFrom(addIPv6Offset(base, offset), bits).Masked().String()
}

func addIPv4Offset(base netip.Addr, offset uint64) netip.Addr {
	bytes := base.As4()
	value := uint64(binary.BigEndian.Uint32(bytes[:])) + offset
	return netip.AddrFrom4([4]byte{byte(value >> 24), byte(value >> 16), byte(value >> 8), byte(value)})
}

func addIPv6Offset(base netip.Addr, offset uint64) netip.Addr {
	bytes := base.As16()
	value := binary.BigEndian.Uint64(bytes[8:]) + offset
	binary.BigEndian.PutUint64(bytes[8:], value)
	return netip.AddrFrom16(bytes)
}
