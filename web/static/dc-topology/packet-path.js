// Shared geometry for the drawn yellow links and the moving packet. Node
// interiors are not links: delivery jumps from ingress to egress at each hop.
export function physicalPoints(a,b) {
  const direction=Math.sign(b.y-a.y)||1;
  return [{x:a.x,y:a.y+direction*a.height/2},{x:b.x,y:b.y-direction*b.height/2}];
}
export function tapPoints(host,vm) {
  const a={x:host.x,y:host.y+host.height/2-25};
  const dx=a.x-vm.x,dy=a.y-vm.y;
  const scale=1/Math.max(Math.abs(dx)/47,Math.abs(dy)/12,1);
  return [a,{x:vm.x+dx*scale,y:vm.y+dy*scale}];
}
export function packetSegments(model,positions,ids) {
  if(ids.some(id=>!positions.entityPoints.has(id)))return [];
  const result=[];
  for(let index=1;index<ids.length;index++) {
    const from=ids[index-1],to=ids[index];let points;
    const physical=model.physical_links.find(l=>(l.a_node_id===from&&l.b_node_id===to)||(l.a_node_id===to&&l.b_node_id===from));
    if(physical)points=physicalPoints(positions.nodes.get(from),positions.nodes.get(to));
    else {
      const tap=(model.local_links??[]).find(l=>(l.host_id===from&&l.vm_id===to)||(l.vm_id===from&&l.host_id===to));
      if(!tap)return [];
      points=tapPoints(positions.nodes.get(tap.host_id),positions.entityPoints.get(tap.vm_id));
      if(from===tap.vm_id)points.reverse();
    }
    result.push({from,to,points,hopIndex:index-1});
  }
  return result;
}
