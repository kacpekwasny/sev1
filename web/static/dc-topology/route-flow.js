// One NLRI at a time, branching along expected exports at each propagation wave.
// No route tables or convergence state are changed by this view.
export function originatedRouteFlow(model, selection) {
  if(selection?.type!=="route")return null;
  const localStatic=selection.candidate?.protocol==='static'&&selection.candidate?.kernel_device?.startsWith('tap-');
  const routeID=localStatic?(selection.candidate.resolved_route_id||selection.id):selection.id;
  const example=(model.route_state?.originated_flows??[]).find(flow=>flow.route.id===routeID&&flow.route.origin_id===selection.ownerID);
  if(!example?.steps.length || (selection.candidate?.path??selection.candidate?.propagation_path??[]).length>1)return null;
  return {reachable:true,route:example.route,example};
}
export function routeFlowStreams(model, focused = null) {
  if (!model) return [];
  const streams=(model.route_state?.flow_examples??[]).map(example=>({route:example.route,focused:false,
    steps:example.steps.map(s=>({sessionID:s.session_id,fromID:s.from_id,toID:s.to_id,wave:s.wave}))}));
  if(focused?.reachable) { streams.length=0;streams.push({route:focused.route,focused:true,
    steps:(focused.example?.steps??[]).map(s=>({sessionID:s.session_id,fromID:s.from_id,toID:s.to_id,wave:s.wave}))}); }
  return streams.filter(stream=>stream.steps.length).map(stream=>({...stream,waves:Array.from({length:Math.max(-1,...stream.steps.map(s=>s.wave))+1},(_,wave)=>stream.steps.filter(s=>s.wave===wave))}));
}

// Automatic playback needs one family per identical propagation pattern. Keep
// the full list for explicit family selection and focused UPDATE inspection.
export function automaticRouteFlowStreams(streams) {
  const families = new Map();
  return streams.filter(stream => {
    const route = stream.route;
    const path = stream.steps.map(step => JSON.stringify([step.wave, step.sessionID, step.fromID, step.toID])).sort();
    const key = JSON.stringify([route.origin_kind, route.safi, route.route_type ?? 0, route.vpc_id ?? 0, route.vni ?? 0, path]);
    const family = route.ip_family || route.afi;
    if (families.has(key) && families.get(key) !== family) return false;
    families.set(key, family);
    return true;
  });
}
