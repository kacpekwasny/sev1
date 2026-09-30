// Educational renderings of the same snapshot; no router commands are executed.
const section = (container, title, open = false) => {
  const details = document.createElement("details"); details.className = "dc-interface-details"; details.open = open;
  const summary = document.createElement("summary"); summary.textContent = title;
  details.append(summary); container.append(details); return details;
};
export function identifyRoute(button, route, ownerID = "") {
  button.dataset.routeId = route.route_id ?? route.id;
  button.dataset.routeOwner = ownerID || route.speaker_id || route.owner_id || route.to_id || "";
  button.dataset.routeCandidate = JSON.stringify(route);
}
const routeLine = (pre, route, ownerID, value) => {
  const button = document.createElement("button"); button.type = "button";
  button.className = "dc-cli-route"; button.textContent = value;
  button.setAttribute("aria-label", `Inspektuj trasę ${route.prefix}`);
  identifyRoute(button, route, ownerID); pre.append(button);
};
const originCode = (value) => ({ 0: "i", 1: "e", 2: "?" })[value] ?? "?";

export function appendOriginatedRoutes(container, model, speakerID, mode, appendRows) {
  const routes=(model.route_state?.origins??[]).filter(route=>route.origin_id===speakerID&&route.protocol!=="static")
    .map(route=>({...route,speaker_id:speakerID,path:[speakerID],as_path:[],received_from:""}));
  const parent=section(container,`Trasy inicjowane przez urządzenie · ${routes.length}`);
  parent.classList.add("dc-originated-routes");parent.dataset.originSpeaker=speakerID;
  if(!routes.length) {
    const note=document.createElement("p");
    const vm=model.vms.find(item=>item.id===speakerID);
    note.textContent=vm?`Ta VM nie inicjuje tras BGP w tym modelu. Jej prefiksy usługowe lub EVPN ogłasza host ${vm.host_id}.`:"Urządzenie nie inicjuje tras w tej konfiguracji.";
    parent.append(note);return;
  }
  if(mode!=="linux") {appendRows(parent,routes,true,speakerID);return;}
  const pre=document.createElement("pre");pre.className="dc-terminal";
  pre.textContent=`${speakerID}# trasy lokalnie inicjowane\n# Lokalny AS_PATH jest pusty; własny ASN trafia do eksportu eBGP.\n`;
  parent.append(pre);
  for(const route of routes)routeLine(pre,route,speakerID,`${route.prefix}  ${route.afi}/${route.safi}  NH ${route.next_hop}${route.vpc_id?`  VPC ${route.vpc_id}`:""}\n`);
}

export function appendRIB(container, model, speakerID, mode, appendRows) {
  const table = model.route_state?.tables?.find((item) => item.speaker_id === speakerID);
  if (!table) return;
  const selected = table.selected ?? [], received = table.received ?? [], local = table.locally_originated ?? [];
  const parent = section(container, `Oczekiwana tablica BGP · ${selected.length} wybranych · ${received.length} odebranych · EVPN ${selected.filter((route) => route.route_type === 5).length}`, table.kind === "host");
  const families = [["l2vpn", "EVPN Type 5", "show bgp l2vpn evpn route type prefix"], ["ipv4", "IPv4 unicast", "show bgp ipv4 unicast"], ["ipv6", "IPv6 unicast", "show bgp ipv6 unicast"]];
  for (const [afi, label, command] of families) {
    const best = selected.filter((route) => route.afi === afi);
    const incoming = received.filter((route) => route.afi === afi);
    const originated = local.filter((route) => route.afi === afi);
    const family = section(parent, `${label} · ${best.length} wybranych`, afi === "l2vpn");
    family.dataset.family = afi;
    family.classList.add("dc-rib-family");
    family.querySelector("summary").prepend(Object.assign(document.createElement("span"), {className:"dc-family-badge", textContent:"AFI / SAFI "}));
    if (mode === "linux") {
      const bestIDs = new Set(best.map((route) => route.id));
      const rows = [...best, ...incoming.filter((route) => !bestIDs.has(route.id))];
      let output = `${speakerID}# ${command}\n# Oczekiwany RIB w stylu FRR; * poprawna, > najlepsza\n`;
      output += "Status Network / NLRI                         Next Hop                 Metric LocPrf Path\n";
      const pre = document.createElement("pre"); pre.className = "dc-terminal"; pre.textContent = output; family.append(pre);
      for (const route of rows) {
        const nlri = afi === "l2vpn" ? `[5]:[0]:[${route.prefix.split("/")[1]}]:[${route.prefix.split("/")[0]}]` : route.prefix;
        let line = afi === "l2vpn" ? `Route Distinguisher: ${route.rd}\n` : "";
        const asPath = route.received_from ? route.as_path ?? [] : [];
        line += `${bestIDs.has(route.id) ? "*>" : "* "} ${nlri.padEnd(40)} ${route.next_hop.padEnd(24)} ${String(route.med).padEnd(6)} ${String(route.local_preference).padEnd(6)} ${asPath.join(" ")} ${originCode(route.origin_code)}\n`;
        if (afi === "l2vpn") line += `   RT ${route.route_target}  VNI ${route.vni}  VPC ${route.vpc_id}\n`;
        if (route.received_from) line += `   od ${route.received_from}\n`;
        routeLine(pre, route, speakerID, line);
      }
      if (!rows.length) pre.append("Brak tras.\n");
    } else {
      for (const [title, routes] of [["Najlepsze ścieżki", best], ["Trasy lokalne", originated], ["Trasy odebrane", incoming]]) {
        const group = section(family, `${title} · ${routes.length}`, title === "Najlepsze ścieżki");
        appendRows(group, routes, true, speakerID);
      }
    }
  }
}

export function appendFIB(container, model, ownerID, title, mode, appendRows) {
  const entries = (model.route_state?.forwarding ?? []).filter((item) => item.owner_id === ownerID&&(item.vpc_id||item.vni||item.vrf==="default"));
  const parent = section(container, `${title} · ${entries.length} wpisów`);
  if (mode !== "linux") { appendRows(parent, entries, true, ownerID); return; }
  const table = model.route_state?.tables?.find((item) => item.speaker_id === ownerID);
  const localDevice = (route) => {
    const origin = model.route_state?.origins?.find((item) => item.id === (route.route_id ?? route.id));
    const link = model.local_links?.find((item) => item.vm_id === origin?.source_vm_id && item.host_id === ownerID);
    return model.local_interfaces?.find((item) => item.id === link?.tap_interface_id)?.name ?? "lo";
  };
  const pre = document.createElement("pre"); pre.className = "dc-terminal"; parent.append(pre);
  let output = "# Oczekiwana tablica jądra w stylu iproute2; urządzenia VXLAN są ilustracją L3VNI.\n";
  for (const family of ["ipv4", "ipv6"]) {
    output += `\n$ ip -${family === "ipv4" ? "4" : "6"} route show table main\n`;
    for (const route of table?.selected ?? []) {
      if (route.afi !== family || route.origin_kind !== "underlay") continue;
      pre.append(output); output = "";
      if (route.next_hop_node_id === ownerID) output += `${route.prefix} dev ${localDevice(route)} proto bgp\n`;
      else {
        output += `${route.prefix} proto bgp\n`;
        for (const hop of route.underlay_next_hops ?? []) {
          const iface = model.interfaces.find((item) => item.node_id === ownerID && item.peer_node_id === hop);
          const peer = model.interfaces.find((item) => item.link_id === iface?.link_id && item.node_id === hop);
          if (iface && peer) output += `    nexthop via ${family === "ipv4" ? "inet6 " : ""}${peer.link_local_ipv6 || peer.ipv6_address} dev ${iface.name} weight 1\n`;
        }
      }
      routeLine(pre, route, ownerID, output); output = "";
    }
  }
  for (const vpcID of [...new Set(entries.map((route) => route.vpc_id))]) {
    for (const bits of [4, 6]) {
      output += `\n$ ip -${bits} route show ${vpcID?`vrf vpc${vpcID}`:"table main"}\n`;
      const routes = entries.filter((route) => route.vpc_id === vpcID && route.prefix.includes(":") === (bits === 6));
      for (const route of routes) {
        pre.append(output); output = "";
        const device = ownerID.startsWith("customer-") ? "eth0" : route.encapsulate_vxlan ? `vxlan${route.vni}` : localDevice(route);
        output += route.resolved_route_id
          ? `${route.prefix} via ${route.next_hop} proto bgp table main\n    # rekursja EVPN: ${route.resolved_route_id} → VTEP ${route.resolved_next_hop}, VNI ${route.vni}\n`
          : `${route.prefix} dev ${device} proto ${route.protocol||"bgp"} table ${vpcID?route.vni:"main"}\n`;
        if (route.encapsulate_vxlan&&!route.resolved_route_id) output += `    # VTEP ${route.next_hop}, VNI ${route.vni}, RT ${route.route_target}\n`;
        routeLine(pre, route, ownerID, output); output = "";
      }
      if (!routes.length) output += "# Brak wpisów.\n";
    }
  }
  pre.append(output);
}

export function appendBorderRoutes(container,model,ownerID,mode,appendRows) {
  const entries=(model.route_state?.forwarding??[]).filter(r=>r.owner_id===ownerID&&r.protocol==='static'&&r.next_hop_node_id.startsWith('border-'));
  const parent=section(container,`Trasy do border · statyczne · ${entries.length}`);
  parent.classList.add('dc-border-routes');
  if(mode!=='linux') {appendRows(parent,entries,true,ownerID);return;}
  const pre=document.createElement('pre');pre.className='dc-terminal';parent.append(pre);
  for(const route of entries)routeLine(pre,route,ownerID,`${route.prefix} via ${route.next_hop} proto static${route.vpc_id?` vrf vpc${route.vpc_id}`:' table main'}\n`);
}
