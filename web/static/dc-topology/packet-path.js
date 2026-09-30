// Shared geometry for yellow links and continuous ingress-to-egress traversal.
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

export function packetTraversal(links) {
  const result=[];
  for(const link of links) {
    const previous=result.at(-1)?.points[1],start=link.points[0];
    if(previous&&Math.hypot(previous.x-start.x,previous.y-start.y)>.001) {
      result.push({from:link.from,to:link.from,points:[previous,start],hopIndex:link.hopIndex,internal:true,duration:350});
    }
    result.push({...link,duration:900});
  }
  return result;
}

export function packetPosition(traversal,elapsed) {
  if(!traversal.length)return null;
  // A first rAF timestamp may precede the Play click's performance.now().
  let remaining=Math.max(0,elapsed);
  for(const [index,segment] of traversal.entries()) {
    if(remaining<=segment.duration||index===traversal.length-1) {
      const fraction=Math.min(1,remaining/segment.duration),[a,b]=segment.points;
      return {x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction,hopIndex:fraction===1&&!segment.internal?segment.hopIndex+1:segment.hopIndex,internal:Boolean(segment.internal)};
    }
    remaining-=segment.duration;
  }
}
