package dctopology

import (
	"fmt"
	"net/netip"
	"sort"
	"strings"
)

type VMRole string

const (
	VMCustomer VMRole = "customer"
	VMBoltRS   VMRole = "rs_bolt"
	VMCtrlRS   VMRole = "rs_ctrl"
	VMUserRS   VMRole = "rs_user"
)

type VM struct {
	ID                 string   `json:"id"`
	Label              string   `json:"label"`
	Role               VMRole   `json:"role"`
	ClusterID          string   `json:"cluster_id,omitempty"`
	Member             int      `json:"member,omitempty"`
	ServedBolt         int      `json:"served_bolt,omitempty"`
	HostID             string   `json:"host_id"`
	HostBoltID         int      `json:"host_bolt_id"`
	HostRackID         int      `json:"host_rack_id"`
	HostLocalID        int      `json:"host_local_id"`
	VPCID              uint32   `json:"vpc_id"`
	ASN                uint32   `json:"asn"`
	IPv4               string   `json:"ipv4"`
	IPv6               string   `json:"ipv6"`
	Addresses          []string `json:"addresses"`
	AdvertisedPrefixes []string `json:"advertised_prefixes,omitempty"`
	ExplicitPlace      bool     `json:"explicit_placement"`
}

type AFISAFI struct {
	AFI        string `json:"afi"`
	SAFI       string `json:"safi"`
	RouteTypes []int  `json:"route_types,omitempty"`
}

type SessionEndpoint struct {
	EntityType  string `json:"entity_type"`
	EntityID    string `json:"entity_id"`
	Kind        string `json:"kind"`
	Label       string `json:"label"`
	ASN         uint32 `json:"asn"`
	Address     string `json:"address"`
	InterfaceID string `json:"interface_id,omitempty"`
}

type BGPSession struct {
	ID        string          `json:"id"`
	Kind      string          `json:"kind"`
	Transport string          `json:"transport"`
	A         SessionEndpoint `json:"a"`
	B         SessionEndpoint `json:"b"`
	Families  []AFISAFI       `json:"families"`
	State     string          `json:"state"`
}

func buildVMs(config Config, nodes []Node) ([]VM, error) {
	hosts := make([]Node, 0)
	hostByKey := make(map[string]Node)
	for _, node := range nodes {
		if node.Kind != NodeHost {
			continue
		}
		hosts = append(hosts, node)
		hostByKey[hostRefKey(node.BoltID, node.HostID)] = node
	}
	if len(hosts) == 0 {
		return nil, &BuildError{Message: "topologia nie zawiera hostów"}
	}

	cursor := 0
	placeNext := func(used map[string]bool) Node {
		selected := cursor % len(hosts)
		for offset := 0; offset < len(hosts); offset++ {
			candidate := (cursor + offset) % len(hosts)
			if !used[hosts[candidate].ID] {
				selected = candidate
				break
			}
		}
		host := hosts[selected]
		cursor = (selected + 1) % len(hosts)
		return host
	}

	placements := make(map[string]HostRef, len(config.RouteServers.Placements))
	for _, placement := range config.RouteServers.Placements {
		role := map[string]VMRole{"bolt": VMBoltRS, "controller": VMCtrlRS, "user": VMUserRS}[strings.ToLower(placement.Role)]
		placements[routePlacementKey(string(role), placement.ServedBolt, placement.Member)] = placement.Host
	}
	var vms []VM
	addCluster := func(role VMRole, servedBolt int) error {
		clusterID := string(role)
		if servedBolt != 0 {
			clusterID += fmt.Sprintf("-b%d", servedBolt)
		}
		used := map[string]bool{}
		boltCounts := map[int]int{}
		chosen := make(map[int]Node, 4)
		for member := 1; member <= 4; member++ {
			if hostRef, explicit := placements[routePlacementKey(string(role), servedBolt, member)]; explicit {
				host, ok := hostByKey[hostRefKey(hostRef.BoltID, hostRef.HostID)]
				if !ok {
					return &BuildError{Message: fmt.Sprintf("nie znaleziono hosta dla %s członka %d", clusterID, member)}
				}
				chosen[member] = host
				used[host.ID] = true
				boltCounts[host.BoltID]++
			}
		}
		for member := 1; member <= 4; member++ {
			host, explicit := chosen[member]
			if !explicit {
				if role == VMUserRS {
					host = placeNext(used)
				} else {
					bolt := servedBolt
					if role == VMCtrlRS {
						bolt = 1
						for candidate := 2; candidate <= config.Topology.Bolts; candidate++ {
							if boltCounts[candidate] < boltCounts[bolt] {
								bolt = candidate
							}
						}
					}
					// Prefer different hosts inside the selected bolt; co-locate only
					// when its host count is smaller than the cluster membership.
					for _, candidate := range hosts {
						if candidate.BoltID != bolt {
							continue
						}
						if host.ID == "" {
							host = candidate
						}
						if !used[candidate.ID] {
							host = candidate
							break
						}
					}
				}
				boltCounts[host.BoltID]++
				chosen[member] = host
				used[host.ID] = true
			}
			vm := newRouteServerVM(config.Addressing.IPv6, role, servedBolt, member, host, explicit)
			vms = append(vms, vm)
		}
		return nil
	}
	for bolt := 1; bolt <= config.Topology.Bolts; bolt++ {
		if err := addCluster(VMBoltRS, bolt); err != nil {
			return nil, err
		}
	}
	if err := addCluster(VMCtrlRS, 0); err != nil {
		return nil, err
	}
	if err := addCluster(VMUserRS, 0); err != nil {
		return nil, err
	}

	overrides := make(map[int]CustomerVMOverride, len(config.CustomerVMs.Overrides))
	for _, override := range config.CustomerVMs.Overrides {
		overrides[override.ID] = override
	}
	for id := 1; id <= config.CustomerVMs.Count; id++ {
		override, hasOverride := overrides[id]
		host, explicit := Node{}, false
		if hasOverride && override.Host != nil {
			var ok bool
			host, ok = hostByKey[hostRefKey(override.Host.BoltID, override.Host.HostID)]
			if !ok {
				return nil, &BuildError{Message: fmt.Sprintf("nie znaleziono hosta dla klienta %d", id)}
			}
			explicit = true
		} else {
			host = placeNext(nil)
		}
		vpcID := config.CustomerVMs.DefaultVPCID
		if hasOverride && override.VPCID != nil {
			vpcID = *override.VPCID
		}
		vm := newCustomerVM(config.Addressing.IPv6, id, host, vpcID, override.Addresses, explicit)
		for _, raw := range override.AdvertisedPrefixes {
			vm.AdvertisedPrefixes = append(vm.AdvertisedPrefixes, netip.MustParsePrefix(raw).Masked().String())
		}
		vms = append(vms, vm)
	}
	sort.Slice(vms, func(i, j int) bool { return vms[i].ID < vms[j].ID })
	return vms, nil
}

func newRouteServerVM(scheme IPv6Config, role VMRole, servedBolt, member int, host Node, explicit bool) VM {
	roleCode, entity, asn := uint16(0), uint32(member), uint32(0)
	label := ""
	clusterID := string(role)
	switch role {
	case VMBoltRS:
		label, roleCode = fmt.Sprintf("rs%d%03d", servedBolt, member), 3
		clusterID = fmt.Sprintf("rs-bolt-b%d", servedBolt)
		entity = uint32(member)
		asn = uint32(64640 + (servedBolt-1)*4 + member - 1)
	case VMCtrlRS:
		label, roleCode, asn = fmt.Sprintf("rsctrl%d", member), 4, uint32(64656+member-1)
		clusterID = "rs-ctrl"
	case VMUserRS:
		label, roleCode, asn = fmt.Sprintf("rsuser%d", member), 5, uint32(64660+member-1)
		clusterID = "rs-user"
	}
	id := fmt.Sprintf("%s-m%d", clusterID, member)
	infraIndex := uint32(0)
	scope := uint16(0)
	if role == VMBoltRS {
		infraIndex = uint32((servedBolt-1)*4 + member)
		scope = uint16(servedBolt)
	} else if role == VMCtrlRS {
		infraIndex = uint32(16 + member)
	} else {
		infraIndex = uint32(20 + member)
	}
	ipv4 := ipv4FromPool("10.32.0.0/12", uint64(infraIndex)).String()
	ipv6 := scheme.identity(roleCode, scope, entity).String()
	return VM{
		ID: id, Label: label, Role: role, ClusterID: clusterID, Member: member,
		ServedBolt: servedBolt, HostID: host.ID, HostBoltID: host.BoltID,
		HostRackID: host.RackID, HostLocalID: host.HostID, ASN: asn,
		IPv4: ipv4, IPv6: ipv6, Addresses: []string{ipv4, ipv6}, ExplicitPlace: explicit,
	}
}

func newCustomerVM(scheme IPv6Config, id int, host Node, vpcID uint32, explicitAddresses []string, explicitPlace bool) VM {
	ipv4 := ipv4FromPool("10.64.0.0/10", uint64(id)).String()
	ipv6 := scheme.identity(6, 0, uint32(id)).String()
	addresses := []string{ipv4, ipv6}
	familyReplaced := map[bool]bool{}
	for _, raw := range explicitAddresses {
		address := netip.MustParseAddr(raw).String()
		is6 := strings.Contains(address, ":")
		index := 0
		if is6 {
			index = 1
		}
		if !familyReplaced[is6] {
			addresses[index] = address
			familyReplaced[is6] = true
			if is6 {
				ipv6 = address
			} else {
				ipv4 = address
			}
		} else {
			addresses = append(addresses, address)
		}
	}
	return VM{
		ID: fmt.Sprintf("customer-%d", id), Label: fmt.Sprintf("VM klienta %d", id),
		Role: VMCustomer, HostID: host.ID, HostBoltID: host.BoltID,
		HostRackID: host.RackID, HostLocalID: host.HostID, VPCID: vpcID,
		ASN: uint32(64664 + id - 1), IPv4: ipv4, IPv6: ipv6,
		Addresses: addresses, ExplicitPlace: explicitPlace,
	}
}

func routePlacementKey(role string, servedBolt, member int) string {
	return fmt.Sprintf("%s/%d/%d", strings.ToLower(role), servedBolt, member)
}

func hostRefKey(bolt, host int) string { return fmt.Sprintf("%d/%d", bolt, host) }

func buildSessions(model *Model) error {
	nodes := make(map[string]Node, len(model.Nodes))
	for _, node := range model.Nodes {
		nodes[node.ID] = node
	}
	interfaces := make(map[string]Interface, len(model.Interfaces))
	for _, intf := range model.Interfaces {
		interfaces[intf.ID] = intf
	}
	vms := make(map[string]VM, len(model.VMs))
	vmByRole := map[VMRole][]VM{}
	for _, vm := range model.VMs {
		vms[vm.ID] = vm
		vmByRole[vm.Role] = append(vmByRole[vm.Role], vm)
	}
	var sessions []BGPSession
	add := func(kind, transport string, a, b SessionEndpoint, families []AFISAFI) {
		left, right := a.EntityID, b.EntityID
		if right < left {
			left, right = right, left
		}
		sessions = append(sessions, BGPSession{
			ID:   "bgp/" + kind + "/" + left + "--" + right,
			Kind: kind, Transport: transport, A: a, B: b, Families: cloneFamilies(families), State: "established",
		})
	}

	for _, link := range model.Links {
		a, b := nodes[link.ANodeID], nodes[link.BNodeID]
		aIf, bIf := interfaces[link.AInterfaceID], interfaces[link.BInterfaceID]
		if a.Kind == NodeHost || b.Kind == NodeHost {
			host, tor, hostIf, torIf := a, b, aIf, bIf
			if host.Kind != NodeHost {
				host, tor, hostIf, torIf = b, a, bIf, aIf
			}
			add("host-tor", "ipv6-link-local-unnumbered",
				nodeEndpoint(host, hostIf.LinkLocalIPv6, hostIf.ID),
				nodeEndpoint(tor, torIf.LinkLocalIPv6, torIf.ID), underlayFamilies())
			continue
		}
		add("fabric", "ipv6-link-local-unnumbered", nodeEndpoint(a, aIf.LinkLocalIPv6, aIf.ID), nodeEndpoint(b, bIf.LinkLocalIPv6, bIf.ID), underlayFamilies())
	}

	boltRS := vmByRole[VMBoltRS]
	ctrlRS := vmByRole[VMCtrlRS]
	userRS := vmByRole[VMUserRS]
	for _, node := range model.Nodes {
		if node.Kind == NodeHost {
			for _, vm := range boltRS {
				if vm.ServedBolt == node.BoltID {
					add("host-rs-bolt", "ipv6", nodeEndpoint(node, node.IPv6, ""), vmEndpoint(vm), evpnFamilies())
				}
			}
		}
		if node.Kind == NodeBorder {
			for _, vm := range ctrlRS {
				add("border-rs-ctrl", "ipv6", nodeEndpoint(node, node.IPv6, ""), vmEndpoint(vm), evpnFamilies())
			}
		}
	}
	for _, bolt := range boltRS {
		for _, ctrl := range ctrlRS {
			add("rs-bolt-rs-ctrl", "ipv6", vmEndpoint(bolt), vmEndpoint(ctrl), evpnFamilies())
		}
	}
	for _, ctrl := range ctrlRS {
		for _, user := range userRS {
			add("rs-ctrl-rs-user", "ipv6", vmEndpoint(ctrl), vmEndpoint(user), unicastFamilies())
		}
	}
	peers := make(map[int]bool, len(model.Config.CustomerVMs.RSUserPeers))
	for _, id := range model.Config.CustomerVMs.RSUserPeers {
		peers[id] = true
	}
	for _, customer := range vmByRole[VMCustomer] {
		var vmID int
		_, _ = fmt.Sscanf(customer.ID, "customer-%d", &vmID)
		if !peers[vmID] {
			continue
		}
		for _, user := range userRS {
			add("customer-rs-user", "ipv6", vmEndpoint(customer), vmEndpoint(user), unicastFamilies())
		}
	}
	sort.Slice(sessions, func(i, j int) bool { return sessions[i].ID < sessions[j].ID })
	model.Sessions = sessions
	return nil
}

func nodeEndpoint(node Node, address, interfaceID string) SessionEndpoint {
	return SessionEndpoint{EntityType: "node", EntityID: node.ID, Kind: string(node.Kind), Label: node.Label, ASN: node.ASN, Address: address, InterfaceID: interfaceID}
}

func vmEndpoint(vm VM) SessionEndpoint {
	return SessionEndpoint{EntityType: "vm", EntityID: vm.ID, Kind: string(vm.Role), Label: vm.Label, ASN: vm.ASN, Address: vm.IPv6}
}

func unicastFamilies() []AFISAFI {
	return []AFISAFI{{AFI: "ipv4", SAFI: "unicast"}, {AFI: "ipv6", SAFI: "unicast"}}
}

func underlayFamilies() []AFISAFI { return unicastFamilies() }

func evpnFamilies() []AFISAFI {
	return []AFISAFI{
		{AFI: "ipv4", SAFI: "unicast"},
		{AFI: "ipv6", SAFI: "unicast"},
		{AFI: "l2vpn", SAFI: "evpn", RouteTypes: []int{5}},
	}
}

func cloneFamilies(families []AFISAFI) []AFISAFI {
	result := make([]AFISAFI, len(families))
	copy(result, families)
	return result
}
