package dctopology

import "testing"

func TestEveryVMHasLocalTAPAndGuestNIC(t *testing.T) {
	model, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	if len(model.LocalLinks) != len(model.VMs) || len(model.LocalInterfaces) != 2*len(model.VMs) {
		t.Fatal("incomplete VM attachments")
	}
	interfaces := map[string]Interface{}
	for _, iface := range model.LocalInterfaces {
		if len(iface.Name) > 15 {
			t.Fatal("Linux interface name too long")
		}
		if _, exists := interfaces[iface.ID]; exists {
			t.Fatal("duplicate local interface")
		}
		interfaces[iface.ID] = iface
	}
	for _, link := range model.LocalLinks {
		tap, nic := interfaces[link.TapInterfaceID], interfaces[link.GuestInterfaceID]
		if tap.Kind != "tap" || tap.NodeID != link.HostID || tap.PeerNodeID != link.VMID || nic.Kind != "vnic" || nic.NodeID != link.VMID || nic.Name != "eth0" || tap.VPCID != nic.VPCID {
			t.Fatalf("invalid attachment: %+v", link)
		}
		found := false
		for _, node := range model.Nodes {
			if node.ID == link.HostID {
				for _, id := range node.LocalInterfaceIDs {
					found = found || id == tap.ID
				}
			}
		}
		if !found {
			t.Fatal("TAP not attached to its host")
		}
	}
	if len(model.Links) != 60 || len(model.Interfaces) != 120 {
		t.Fatal("local attachments changed physical cables")
	}
	for _, table := range model.Routes.Tables {
		if table.SpeakerID == "host-b1-h2" {
			underlay, evpn := 0, 0
			for _, r := range table.Selected {
				if r.OriginKind == "underlay" {
					underlay++
				}
				if r.RouteType == 5 {
					evpn++
				}
			}
			if underlay != 68 || evpn != 6 {
				t.Fatalf("host RIB lacks underlay or EVPN: %d %d", underlay, evpn)
			}
		}
	}
}
