package dctopology

import (
	"fmt"
	"net/netip"
)

func primaryVMRouteID(vm VM, family string) string {
	address := vm.IPv4
	if family == "ipv6" {
		address = vm.IPv6
	}
	return fmt.Sprintf("vm/%s/%s/%s", vm.ID, family, address)
}

func primaryVMReachable(model Model, bootstrap RouteState, vm, user VM) bool {
	if vm.VPCID != 0 {
		return false
	}
	local, reverse, service := false, false, false
	for _, entry := range bootstrap.Forwarding {
		if entry.VPCID != 0 {
			continue
		}
		if entry.RouteID == primaryVMRouteID(vm, "ipv6") {
			if entry.OwnerID == vm.HostID && entry.Protocol == "static" {
				for _, link := range model.LocalLinks {
					if link.VMID == vm.ID && link.HostID == vm.HostID {
						local = true
					}
				}
			}
			if entry.OwnerID == user.HostID {
				reverse = true
			}
		}
		if entry.OwnerID == vm.HostID && entry.RouteID == fmt.Sprintf("underlay-service/%s/ipv6", user.ID) {
			service = true
		}
	}
	return local && reverse && service
}

func customerSessionReadiness(model Model, bootstrap RouteState) map[string]ResolvedControlPath {
	result := map[string]ResolvedControlPath{}
	physical := map[string]ResolvedControlPath{}
	for _, path := range bootstrap.ControlPaths {
		physical[path.SessionID] = path
	}
	for _, session := range model.Sessions {
		if session.Kind != "customer-rs-user" {
			continue
		}
		vm, _ := modelVMByID(model.VMs, session.A.EntityID)
		user, _ := modelVMByID(model.VMs, session.B.EntityID)
		if vm.Role != VMCustomer {
			vm, user = user, vm
		}
		path := physical[session.ID]
		path.PrimaryEVPNRouteID = primaryVMRouteID(vm, "ipv6")
		if path.Reachable && !primaryVMReachable(model, bootstrap, vm, user) {
			path.Reachable, path.Reason = false, "primary-vm-connectivity-required"
			path.PhysicalNodeIDs, path.PhysicalLinkIDs, path.ECMPNextHops = nil, nil, nil
		}
		result[session.ID] = path
	}
	return result
}

func additionalRouteOrigins(model Model, bootstrap RouteState, readiness map[string]ResolvedControlPath) []Route {
	peering := map[string]bool{}
	for _, session := range model.Sessions {
		if session.Kind != "customer-rs-user" || !readiness[session.ID].Reachable {
			continue
		}
		peering[session.A.EntityID], peering[session.B.EntityID] = true, true
	}
	var result []Route
	makeOrigin := func(id, raw string, vm VM, origin SessionEndpoint, kind string) Route {
		prefix := netip.MustParsePrefix(raw).Masked()
		family, nextHop := "ipv4", vm.IPv4
		if prefix.Addr().Is6() {
			family, nextHop = "ipv6", vm.IPv6
		}
		return Route{ID: id, Prefix: prefix.String(), IPFamily: family, AFI: family, SAFI: "unicast",
			OriginID: origin.EntityID, OriginLabel: origin.Label, OriginKind: kind, SourceVMID: vm.ID, OriginASN: origin.ASN,
			NextHop: nextHop, NextHopNodeID: vm.HostID, LocalPreference: 100}
	}
	for _, vm := range model.VMs {
		if vm.Role != VMCustomer || vm.VPCID != 0 || !peering[vm.ID] {
			continue
		}
		for _, raw := range vm.AdvertisedPrefixes {
			prefix := netip.MustParsePrefix(raw)
			family := "ipv4"
			if prefix.Addr().Is6() {
				family = "ipv6"
			}
			id := fmt.Sprintf("customer/%s/%s/%s", vm.ID, family, prefix)
			result = append(result, makeOrigin(id, raw, vm, vmEndpoint(vm), "customer"))
		}
	}
	for _, config := range model.Config.RouteServers.UserOrigins {
		vm, _ := modelVMByID(model.VMs, fmt.Sprintf("customer-%d", config.NextHopVMID))
		user, _ := modelVMByID(model.VMs, fmt.Sprintf("rs-user-m%d", config.Member))
		if !primaryVMReachable(model, bootstrap, vm, user) {
			continue
		}
		result = append(result, makeOrigin("user-injected/"+config.ID, config.Prefix, vm, vmEndpoint(user), "user-injected"))
	}
	return result
}
