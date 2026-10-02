import { t } from "../i18n.js";
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
  button.setAttribute("aria-label", t`Inspektuj trasę ${route.prefix}`);
  identifyRoute(button, route, ownerID); pre.append(button);
  return button;
};
const originCode = (value) => ({ 0: "i", 1: "e", 2: "?" })[value] ?? "?";

export function appendOriginatedRoutes(container, model, speakerID, mode, appendRows) {
  const routes=(model.route_state?.origins??[]).filter(route=>route.origin_id===speakerID&&route.protocol!=="static")
    .map(route=>({...route,speaker_id:speakerID,path:[speakerID],as_path:[],received_from:""}));
  const parent=section(container,t`Trasy inicjowane przez urządzenie · ${routes.length}`);
  parent.classList.add("dc-originated-routes");parent.dataset.originSpeaker=speakerID;
  if(!routes.length) {
    const note=document.createElement("p");
    const vm=model.vms.find(item=>item.id===speakerID);
    note.textContent=vm?t`Ta VM nie inicjuje tras BGP w tym modelu. Jej prefiksy usługowe lub EVPN ogłasza host ${vm.host_id}.`:t("Urządzenie nie inicjuje tras w tej konfiguracji.");
    parent.append(note);return;
  }
  if(mode!=="linux") {appendRows(parent,routes,true,speakerID);return;}
  const pre=document.createElement("pre");pre.className="dc-terminal";
  pre.textContent=t`${speakerID}# trasy lokalnie inicjowane\n# Lokalny AS_PATH jest pusty; własny ASN trafia do eksportu eBGP.\n`;
  parent.append(pre);
  for(const route of routes)routeLine(pre,route,speakerID,t`${route.prefix}  ${route.afi}/${route.safi}  NH ${route.next_hop}${route.vpc_id?t`  VPC ${route.vpc_id}`:""}\n`);
}

export function appendRIB(container, model, speakerID, mode, appendRows) {
  const table = model.route_state?.tables?.find((item) => item.speaker_id === speakerID);
  if (!table) return;
  const selected = table.selected ?? [], received = table.received ?? [], local = table.locally_originated ?? [];
  const parent = section(container, t`Oczekiwana tablica BGP · ${selected.length} wybranych · ${received.length} odebranych · EVPN ${selected.filter((route) => route.route_type === 5).length}`, table.kind === "host");
  const families = [["l2vpn", t("EVPN Type 5"), t("show bgp l2vpn evpn route type prefix")], ["ipv4", t("IPv4 unicast"), t("show bgp ipv4 unicast")], ["ipv6", t("IPv6 unicast"), t("show bgp ipv6 unicast")]];
  for (const [afi, label, command] of families) {
    const best = selected.filter((route) => route.afi === afi);
    const incoming = received.filter((route) => route.afi === afi);
    const originated = local.filter((route) => route.afi === afi);
    const family = section(parent, t`${label} · ${best.length} wybranych`, afi === "l2vpn");
    family.dataset.family = afi;
    family.classList.add("dc-rib-family");
    family.querySelector("summary").prepend(Object.assign(document.createElement("span"), {className:"dc-family-badge", textContent:t("AFI / SAFI ")}));
    if(afi!=="l2vpn") {
      const note=document.createElement('p');
      note.textContent=t('RIB pokazuje next hop BGP. Loopbacki urządzeń i IPv6 usług RS używają underlay; next hop klienta jest rekursywny przez EVPN/VXLAN, nie bezpośrednią trasą do VM.');
      family.append(note);
    }
    if (mode === "linux") {
      const bestIDs = new Set(best.map((route) => route.id));
      const rows = [...best, ...incoming.filter((route) => !bestIDs.has(route.id))];
      let output = t`${speakerID}# ${command}\n# Oczekiwany RIB w stylu FRR; * poprawna, > najlepsza\n`;
      output += t("Status Network / NLRI                         Next Hop                 Metric LocPrf Path\n");
      const pre = document.createElement("pre"); pre.className = "dc-terminal"; pre.textContent = output; family.append(pre);
      for (const route of rows) {
        const nlri = afi === "l2vpn" ? `[5]:[0]:[${route.prefix.split("/")[1]}]:[${route.prefix.split("/")[0]}]` : route.prefix;
        let line = afi === "l2vpn" ? t`Route Distinguisher: ${route.rd}\n` : "";
        const asPath = route.received_from ? route.as_path ?? [] : [];
        line += `${bestIDs.has(route.id) ? "*>" : "* "} ${nlri.padEnd(40)} ${route.next_hop.padEnd(24)} ${String(route.med).padEnd(6)} ${String(route.local_preference).padEnd(6)} `;
        const pathStart=line.length,pathText=asPath.join(' ');
        line += `${pathText} ${originCode(route.origin_code)}\n`;
        if (afi === "l2vpn") line += t`   RT ${route.route_target}  VNI ${route.vni}  VPC ${route.vpc_id}\n`;
        if (route.received_from) line += t`   od ${route.received_from}\n`;
        const button=routeLine(pre, route, speakerID, line);
        if(pathText) {
          const path=document.createElement('span');path.dataset.asPath='';path.textContent=pathText;
          button.replaceChildren(line.slice(0,pathStart),path,line.slice(pathStart+pathText.length));
        }
      }
      if (!rows.length) pre.append(t("Brak tras.\n"));
    } else {
      for (const [title, routes] of [[t("Najlepsze ścieżki"), best], [t("Trasy lokalne"), originated], [t("Trasy odebrane"), incoming]]) {
        const group = section(family, `${title} · ${routes.length}`, title === t("Najlepsze ścieżki"));
        appendRows(group, routes, true, speakerID);
      }
    }
  }
}

// The selected host routing RIB uses the same resolved routes installed in the
// expected kernel snapshot. The BGP AFI tables retain their original next hops.
export function routingEntries(model, ownerID) {
  return (model.route_state?.forwarding??[]).filter(route=>route.owner_id===ownerID).map(route=>{
    const origins=model.route_state?.origins??[];
    const origin=origins.find(item=>item.id===route.resolved_route_id)??origins.find(item=>item.id===route.route_id);
    const source=route.protocol==='static'?'local-static':route.protocol==='kernel'?'connected'
      :route.resolved_route_id?'recursive':route.encapsulate_vxlan?'evpn-import':'bgp-underlay';
    return {...route,rib_source:source,source_route_id:origin?.id};
  });
}

export function zebraRouteLine(model, route) {
  const code=route.protocol==='static'?'S':route.protocol==='kernel'?'C':'B';
  const network=route.prefix==='0.0.0.0/0'||route.prefix==='::/0'?'default':route.prefix;
  const distance=code==='S'?1:code==='C'?0:20;
  let line=`${code}>* ${network} [${distance}/0]`;
  if(route.resolved_route_id)line+=t` via ${route.next_hop} (recursive)`;
  else if(route.kernel_device)line+=route.kernel_next_hop?t` via ${route.kernel_next_hop}, ${route.kernel_device}${route.encapsulate_vxlan?' onlink':''}`:t` is directly connected, ${route.kernel_device}`;
  else for(const hop of route.ecmp_next_hops??[]) {
    const iface=model.interfaces.find(item=>item.node_id===route.owner_id&&item.peer_node_id===hop);
    const peer=model.interfaces.find(item=>item.link_id===iface?.link_id&&item.node_id===hop);
    if(iface&&peer)line+=t`\n    via ${peer.link_local_ipv6||peer.ipv6_address}, ${iface.name}`;
  }
  if(route.resolved_route_id)line+=t`\n    # IPv${route.prefix.includes(':')?'6':'4'} unicast; next hop to podstawowy IP VM. Rozwiązanie: ${route.resolved_route_id}${route.encapsulate_vxlan?t` → VTEP ${route.resolved_next_hop}`:` → ${route.kernel_device}`}`;
  else if(route.encapsulate_vxlan)line+=t`\n    # import EVPN → ${route.tunnel_device}, VNI ${route.vni}, VTEP IPv4 ${route.next_hop}`;
  return line+'\n';
}

export function appendRoutingRIB(container, model, ownerID, mode, appendRows) {
  const entries=routingEntries(model,ownerID);
  const parent=section(container,t`Tablica routingu hosta · RIB Zebra · ${entries.length} wybranych`,true);
  parent.classList.add('dc-routing-rib');
  const note=document.createElement('p');
  note.textContent=t('Podstawowe IP VM: lokalna trasa statyczna TAP lub zdalny import EVPN/VXLAN. Dodatkowe prefiksy z RS User: IPv4/IPv6 unicast via podstawowy publiczny IP VM. Rekursja rozwiązuje ten next hop; nie zmienia prefiksu w EVPN. Jądro/FIB poniżej pokazuje rozwiązany dataplane.');
  parent.append(note);
  const vrfs=[...new Set(entries.map(route=>route.vpc_id))];
  for(const vpc of vrfs) {
    const group=section(parent,vpc?t`VRF vpc${vpc}`:t('Default/public VRF'),true);
    group.dataset.routingVrf=String(vpc);
    const categories=[['evpn-import',t('Podstawowe IP VM · import EVPN / VXLAN')],['recursive',t('Dodatkowe prefiksy · IPv4/IPv6 unicast via IP VM')],['local-static',t('Lokalne trasy statyczne do VM')],['bgp-underlay',t('BGP underlay · w tym default')],['connected',t('Adresy loopback · connected')]];
    for(const [key,label] of categories) {
      const rows=entries.filter(route=>route.vpc_id===vpc&&route.rib_source===key);
      if(!rows.length)continue;
      const category=section(group,`${label} · ${rows.length}`,key==='evpn-import'||key==='local-static'||key==='recursive');
      category.dataset.routingSource=key;
      if(mode!=='linux') {appendRows(category,rows,true,ownerID);continue;}
      const pre=document.createElement('pre');pre.className='dc-terminal';
      pre.textContent=t`${ownerID}# show ip route${vpc?t` vrf vpc${vpc}`:''} / show ipv6 route${vpc?t` vrf vpc${vpc}`:''}\n# Oczekiwany wybrany RIB w stylu Zebra; S static, C connected, B BGP; > wybrana, * instalowana.\n`;
      category.append(pre);
      for(const route of rows)routeLine(pre,route,ownerID,zebraRouteLine(model,route));
    }
  }
}

// Render the resolved kernel nexthop, keeping BGP recursion in explanatory comments.
export function kernelRouteLine(model, route) {
  const table=route.kernel_table||'main', protocol=route.protocol||'bgp';
  const network=route.prefix==='0.0.0.0/0'||route.prefix==='::/0'?'default':route.prefix;
  const prefix=route.kernel_device==='lo'&&table==='local'?t`local ${network}`:network;
  let line;
  if(route.kernel_device) {
    line=t`${prefix}${route.kernel_next_hop?t` via ${route.kernel_next_hop}`:''} dev ${route.kernel_device} proto ${protocol}${route.encapsulate_vxlan?' onlink':route.kernel_device==='lo'?' scope host':' scope link'}\n`;
  } else {
    line=t`${prefix} proto ${protocol}\n`;
    for(const hop of route.ecmp_next_hops??[]) {
      const iface=model.interfaces.find(item=>item.node_id===(route.owner_type==='vpc-view'?route.source_nve:route.owner_id)&&item.peer_node_id===hop);
      const peer=model.interfaces.find(item=>item.link_id===iface?.link_id&&item.node_id===hop);
      if(iface&&peer)line+=t`    nexthop via ${route.prefix.includes(':')?'':t('inet6 ')}${peer.link_local_ipv6||peer.ipv6_address} dev ${iface.name} weight 1\n`;
    }
  }
  if(route.resolved_route_id)line+=t`    # RIB: via ${route.next_hop}; rekursja EVPN ${route.resolved_route_id} → VTEP ${route.resolved_next_hop}\n`;
  if(route.encapsulate_vxlan)line+=t`    # ${route.kernel_device} → ${route.tunnel_device}, VXLAN VNI ${route.vni}, zewnętrzny VTEP IPv4 ${route.resolved_next_hop||route.next_hop}\n`;
  return line;
}

export function appendFIB(container, model, ownerID, title, mode, appendRows) {
  const entries=(model.route_state?.forwarding??[]).filter(item=>item.owner_id===ownerID);
  const parent=section(container,t`${title} · ${entries.length} wpisów`);
  parent.classList.add('dc-fib');
  const guestView=entries.some(route=>route.owner_type==='vpc-view');
  if(guestView) {
    const note=document.createElement('p');
    note.textContent=t('Widok NVE hosta dla VRF tej VM. Enkapsulacja i rekursja działają na hoście, nie w jądrze gościa.');
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
      const label=key==='local'?t('Adresy lokalne · table local'):key==='underlay'?t('Underlay · loopbacki i IPv6 usług RS · table main'):key==='public'?t('Default/public VRF · table main'):t`Prywatny VRF ${key}`;
      const group=section(parent,`${label} · ${routes.length}`,key!=='underlay'&&key!=='local');
      group.dataset.fibGroup=key;
      appendRows(group,routes,true,ownerID);
    }
    return;
  }
  const pre=document.createElement('pre');pre.className='dc-terminal';parent.append(pre);
  pre.textContent=t('# Oczekiwana tablica jądra w stylu iproute2; nazwy L3-SVI/VXLAN i router MAC są ilustracyjne.\n');
  // A guest inspector projects its host's VRF, so use that host's real FIB rows.
  const kernelEntries=guestView?entries.map(route=>model.route_state.forwarding.find(host=>host.owner_id===route.source_nve&&host.route_id===route.route_id&&host.vpc_id===route.vpc_id)||route):entries;
  const tables=[...new Set(kernelEntries.map(route=>route.kernel_table||'main'))];
  for(const table of tables)for(const bits of [4,6]) {
    pre.append(t`\n$ ip -${bits} route show table ${table}\n`);
    const routes=kernelEntries.filter(route=>(route.kernel_table||'main')===table&&route.prefix.includes(':')===(bits===6));
    for(const route of routes)routeLine(pre,route,ownerID,kernelRouteLine(model,route));
    if(!routes.length)pre.append(t('# Brak wpisów.\n'));
  }
  const tunnels=new Map();
  for(const route of kernelEntries)if(route.encapsulate_vxlan&&route.router_mac)tunnels.set(`${route.tunnel_device}/${route.kernel_next_hop}`,route);
  if(tunnels.size) {
    pre.append(t('\n# Rozwiązanie L3-SVI → router MAC → zdalny VTEP (oczekiwane neighbor/FDB)\n'));
    for(const route of tunnels.values())routeLine(pre,route,ownerID,
      t`$ ip ${route.prefix.includes(':')?'-6':'-4'} neigh show dev ${route.kernel_device}\n${route.kernel_next_hop} lladdr ${route.router_mac} extern_learn NOARP\n$ bridge fdb show dev ${route.tunnel_device}\n${route.router_mac} dst ${route.resolved_next_hop||route.next_hop} self extern_learn\n`);
  }
}
