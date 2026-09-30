package dctopology

import "fmt"

// LocalLink is a VM attachment, not another physical fabric cable.
type LocalLink struct {
	ID               string `json:"id"`
	HostID           string `json:"host_id"`
	VMID             string `json:"vm_id"`
	TapInterfaceID   string `json:"tap_interface_id"`
	GuestInterfaceID string `json:"guest_interface_id"`
}

func buildLocalInterfaces(model *Model) {
	hosts := make(map[string]int)
	for i, node := range model.Nodes {
		hosts[node.ID] = i
	}
	for _, vm := range model.VMs {
		name := ""
		switch vm.Role {
		case VMCustomer:
			name = "tap-c" + vm.ID[len("customer-"):]
		case VMBoltRS:
			name = fmt.Sprintf("tap-b%dm%d", vm.ServedBolt, vm.Member)
		case VMCtrlRS:
			name = fmt.Sprintf("tap-ctrl%d", vm.Member)
		case VMUserRS:
			name = fmt.Sprintf("tap-user%d", vm.Member)
		}
		link := LocalLink{ID: "local/" + vm.ID, HostID: vm.HostID, VMID: vm.ID, TapInterfaceID: vm.HostID + "/" + name, GuestInterfaceID: vm.ID + "/eth0"}
		model.LocalLinks = append(model.LocalLinks, link)
		model.LocalInterfaces = append(model.LocalInterfaces,
			Interface{ID: link.TapInterfaceID, Kind: "tap", NodeID: vm.HostID, PeerNodeID: vm.ID, LinkID: link.ID, Name: name, VPCID: vm.VPCID},
			Interface{ID: link.GuestInterfaceID, Kind: "vnic", NodeID: vm.ID, PeerNodeID: vm.HostID, LinkID: link.ID, Name: "eth0", VPCID: vm.VPCID, IPv4Address: vm.IPv4, IPv4Prefix: "32", IPv6Address: vm.IPv6, IPv6Prefix: "128"},
		)
		index := hosts[vm.HostID]
		model.Nodes[index].LocalInterfaceIDs = append(model.Nodes[index].LocalInterfaceIDs, link.TapInterfaceID)
	}
}
