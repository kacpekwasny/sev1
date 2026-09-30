// A bounded stream of independent NLRI illustrations projected onto real sessions.
// No route tables or convergence state are changed by this view.
export function routeFlowStreams(model, focused = null) {
  if (!model) return [];
  const streams = [];
  if (focused?.reachable) streams.push({route:focused.route,focused:true,steps:focused.steps.map(s=>({sessionID:s.session_id,fromID:s.from_id,toID:s.to_id}))});
  const origins=(model.route_state?.origins??[]).filter(r=>r.route_type===5);
  const hosts=model.nodes.filter(n=>n.kind==='host');
  for (const [index, route] of origins.entries()) {
    if(streams.length>=24)break;
    const source=route.next_hop_node_id;
    const origin=model.nodes.find(n=>n.id===source);
    const target=hosts.find(n=>n.bolt_id!==origin?.bolt_id&&n.id!==source)??hosts.find(n=>n.id!==source);
    if(!origin||!target)continue;
    const steps=[];
    let from=source;
    const connect=(kind,predicate=()=>true)=>{
      const peers=model.bgp_sessions.filter(s=>s.kind===kind&&(s.a.entity_id===from||s.b.entity_id===from)&&s.families.some(f=>f.route_types?.includes(5))).map(s=>({session:s,to:s.a.entity_id===from?s.b.entity_id:s.a.entity_id})).filter(p=>predicate(p.to));
      if(!peers.length)return false;
      const peer=peers[index%peers.length];steps.push({sessionID:peer.session.id,fromID:from,toID:peer.to});from=peer.to;return true;
    };
    if(origin.kind==='host'&&(!connect('host-rs-bolt')||!connect('rs-bolt-rs-ctrl')))continue;
    if(origin.kind==='border'&&!connect('border-rs-ctrl'))continue;
    if(!connect('rs-bolt-rs-ctrl',id=>model.vms.some(v=>v.id===id&&v.served_bolt===target.bolt_id)))continue;
    if(!connect('host-rs-bolt',id=>id===target.id))continue;
    streams.push({route,steps,focused:false});
  }
  return streams;
}
