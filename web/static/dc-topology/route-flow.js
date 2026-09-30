// One NLRI at a time, branching along expected exports at each propagation wave.
// No route tables or convergence state are changed by this view.
export function routeFlowStreams(model, focused = null) {
  if (!model) return [];
  const streams=(model.route_state?.flow_examples??[]).map(example=>({route:example.route,focused:false,
    steps:example.steps.map(s=>({sessionID:s.session_id,fromID:s.from_id,toID:s.to_id,wave:s.wave}))}));
  if(focused?.reachable)streams.unshift({route:focused.route,focused:true,
    steps:(focused.example?.steps??[]).map(s=>({sessionID:s.session_id,fromID:s.from_id,toID:s.to_id,wave:s.wave}))});
  return streams.filter(stream=>stream.steps.length).map(stream=>({...stream,waves:Array.from({length:Math.max(-1,...stream.steps.map(s=>s.wave))+1},(_,wave)=>stream.steps.filter(s=>s.wave===wave))}));
}
