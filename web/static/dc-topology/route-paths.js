// Project an inspected RIB candidate's learned path and resolved next hop.
// This never changes the expected snapshot or selects a different BGP route.
export function routePaths(model, selection) {
  if(selection?.type!=="route") return {learned:[],pointsTo:[]};
  const origin=model.route_state?.origins?.find((r)=>r.id===selection.id);
  const candidate=selection.candidate ?? origin;
  const owner=selection.ownerID || candidate?.speaker_id || candidate?.to_id;
  if(!candidate||!owner) return {learned:[],pointsTo:[]};
  const table=model.route_state?.tables?.find((t)=>t.speaker_id===owner);
  const localStatic=candidate.protocol==="static"&&candidate.kernel_device?.startsWith("tap-");
  const route=localStatic||candidate.path||candidate.propagation_path ? candidate : table?.selected?.find((r)=>r.id===selection.id) ?? candidate;
  const learned=[...(route.path??route.propagation_path??[])];
  const hostOf=(id)=>model.vms.find((v)=>v.id===id)?.host_id??id;
  const source=hostOf(owner),destination=route.next_hop_node_id ?? origin?.next_hop_node_id;
  const neighbors=new Map(model.nodes.map((n)=>[n.id,[]]));
  for(const l of model.physical_links) {neighbors.get(l.a_node_id)?.push(l.b_node_id);neighbors.get(l.b_node_id)?.push(l.a_node_id);}
  const hosts=new Set(model.nodes.filter((n)=>n.kind==="host").map((n)=>n.id));
  const paths=new Map([[source,[source]]]),queue=[source];
  while(queue.length&&!paths.has(destination)) {
    const id=queue.shift();if(hosts.has(id)&&id!==source)continue;
    for(const next of (neighbors.get(id)??[]).sort()) {if(paths.has(next))continue;paths.set(next,[...paths.get(id),next]);queue.push(next);}
  }
  const pointsTo=[...(paths.get(destination)??[])];
  if(pointsTo.length&&owner!==source) pointsTo.unshift(owner);
  if(pointsTo.length&&origin?.source_vm_id&&destination===origin.next_hop_node_id&&origin.source_vm_id!==owner) pointsTo.push(origin.source_vm_id);
  return {learned,pointsTo,owner,candidate:route,nextHop:route.next_hop??origin?.next_hop};
}
