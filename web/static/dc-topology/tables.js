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
    if(afi!=="l2vpn") {
      const note=document.createElement('p');
      note.textContent='RIB pokazuje next hop BGP. Loopbacki urządzeń i IPv6 usług RS używają underlay; next hop klienta jest rekursywny przez EVPN/VXLAN, nie bezpośrednią trasą do VM.';
      family.append(note);
    }
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

// Render the resolved kernel nexthop, keeping BGP recursion in explanatory comments.
export function kernelRouteLine(model, route) {
  const table=route.kernel_table||'main', protocol=route.protocol||'bgp';
  const prefix=route.kernel_device==='lo'&&table==='local'?`local ${route.prefix}`:route.prefix;
  let line;
  if(route.kernel_device) {
    line=`${prefix}${route.kernel_next_hop?` via ${route.kernel_next_hop}`:''} dev ${route.kernel_device} proto ${protocol}${route.encapsulate_vxlan?' onlink':route.kernel_device==='lo'?' scope host':' scope link'}\n`;
  } else {
    line=`${prefix} proto ${protocol}\n`;
    for(const hop of route.ecmp_next_hops??[]) {
      const iface=model.interfaces.find(item=>item.node_id===(route.owner_type==='vpc-view'?route.source_nve:route.owner_id)&&item.peer_node_id===hop);
      const peer=model.interfaces.find(item=>item.link_id===iface?.link_id&&item.node_id===hop);
      if(iface&&peer)line+=`    nexthop via ${route.prefix.includes(':')?'':'inet6 '}${peer.link_local_ipv6||peer.ipv6_address} dev ${iface.name} weight 1\n`;
    }
  }
  if(route.resolved_route_id)line+=`    # RIB: via ${route.next_hop}; rekursja EVPN ${route.resolved_route_id} → VTEP ${route.resolved_next_hop}\n`;
  if(route.encapsulate_vxlan)line+=`    # ${route.kernel_device} → ${route.tunnel_device}, VXLAN VNI ${route.vni}, zewnętrzny VTEP IPv4 ${route.resolved_next_hop||route.next_hop}\n`;
  return line;
}

export function appendFIB(container, model, ownerID, title, mode, appendRows) {
  const entries=(model.route_state?.forwarding??[]).filter(item=>item.owner_id===ownerID);
  const parent=section(container,`${title} · ${entries.length} wpisów`);
  parent.classList.add('dc-fib');
  const guestView=entries.some(route=>route.owner_type==='vpc-view');
  if(guestView) {
    const note=document.createElement('p');
    note.textContent='Widok NVE hosta dla VRF tej VM. Enkapsulacja i rekursja działają na hoście, nie w jądrze gościa.';
    parent.append(note);
  }
  const groups=new Map();
  for(const route of entries) {
    const origin=model.route_state?.origins?.find(item=>item.id===route.route_id);
    const key=route.kernel_table==='local'?'local':route.vpc_id?`vpc${route.vpc_id}`:origin?.origin_kind==='underlay'?'underlay':'public';
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(route);
  }
  if(mode!=='linux') {
    for(const [key,routes] of groups) {
      const label=key==='local'?'Adresy lokalne · table local':key==='underlay'?'Underlay · loopbacki i IPv6 usług RS · table main':key==='public'?'Default/public VRF · table main':`Prywatny VRF ${key}`;
      const group=section(parent,`${label} · ${routes.length}`,true);
      group.dataset.fibGroup=key;
      appendRows(group,routes,true,ownerID);
    }
    return;
  }
  const pre=document.createElement('pre');pre.className='dc-terminal';parent.append(pre);
  pre.textContent='# Oczekiwana tablica jądra w stylu iproute2; nazwy L3-SVI/VXLAN i router MAC są ilustracyjne.\n';
  // A guest inspector projects its host's VRF, so use that host's real FIB rows.
  const kernelEntries=guestView?entries.map(route=>model.route_state.forwarding.find(host=>host.owner_id===route.source_nve&&host.route_id===route.route_id&&host.vpc_id===route.vpc_id)||route):entries;
  const tables=[...new Set(kernelEntries.map(route=>route.kernel_table||'main'))];
  for(const table of tables)for(const bits of [4,6]) {
    pre.append(`\n$ ip -${bits} route show table ${table}\n`);
    const routes=kernelEntries.filter(route=>(route.kernel_table||'main')===table&&route.prefix.includes(':')===(bits===6));
    for(const route of routes)routeLine(pre,route,ownerID,kernelRouteLine(model,route));
    if(!routes.length)pre.append('# Brak wpisów.\n');
  }
  const tunnels=new Map();
  for(const route of kernelEntries)if(route.encapsulate_vxlan&&route.router_mac)tunnels.set(`${route.tunnel_device}/${route.kernel_next_hop}`,route);
  if(tunnels.size) {
    pre.append('\n# Rozwiązanie L3-SVI → router MAC → zdalny VTEP (oczekiwane neighbor/FDB)\n');
    for(const route of tunnels.values())routeLine(pre,route,ownerID,
      `$ ip ${route.prefix.includes(':')?'-6':'-4'} neigh show dev ${route.kernel_device}\n${route.kernel_next_hop} lladdr ${route.router_mac} extern_learn NOARP\n$ bridge fdb show dev ${route.tunnel_device}\n${route.router_mac} dst ${route.resolved_next_hop||route.next_hop} self extern_learn\n`);
  }
}

export function appendBorderRoutes(container,model,ownerID,mode,appendRows) {
  const entries=(model.route_state?.forwarding??[]).filter(r=>r.owner_id===ownerID&&r.protocol==='static'&&r.next_hop_node_id.startsWith('border-'));
  const parent=section(container,`Trasy do border · statyczne · ${entries.length}`);
  parent.classList.add('dc-border-routes');
  if(mode!=='linux') {appendRows(parent,entries,true,ownerID);return;}
  const pre=document.createElement('pre');pre.className='dc-terminal';parent.append(pre);
  for(const route of entries)routeLine(pre,route,ownerID,`${route.prefix} via ${route.next_hop} proto static${route.vpc_id?` vrf vpc${route.vpc_id}`:' table main'}\n`);
}
