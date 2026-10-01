import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../../web/static/dc-topology/route-flow.js', import.meta.url), 'utf8');
const {routeFlowStreams, automaticRouteFlowStreams} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const steps = [
  {session_id:'host-bolt',from_id:'host-1',to_id:'bolt-1',wave:0},
  {session_id:'bolt-ctrl',from_id:'bolt-1',to_id:'ctrl-1',wave:1},
  {session_id:'ctrl-bolt',from_id:'ctrl-1',to_id:'bolt-2',wave:2},
  {session_id:'bolt-host-2',from_id:'bolt-2',to_id:'host-2',wave:3},
  {session_id:'bolt-host-3',from_id:'bolt-2',to_id:'host-3',wave:3},
];
const example = (id,family,overrides={}) => ({route:{id,ip_family:family,origin_kind:'host',safi:'evpn',route_type:5,vpc_id:0,vni:3,...overrides},steps});
const model = {route_state:{flow_examples:[example('primary-v4','ipv4'),example('primary-v6','ipv6')]}};
const before = JSON.stringify(model);
const streams = routeFlowStreams(model);
assert.equal(streams.length,2, 'Explicit selector retains both families');
assert.deepEqual(automaticRouteFlowStreams(streams).map(s=>s.route.id),['primary-v4']);
assert.equal(automaticRouteFlowStreams(streams)[0].steps.length,5, 'Deduplication retains complete RS fanout');
assert.equal(automaticRouteFlowStreams(streams)[0].waves.length,4, 'End-device delivery waves remain intact');
assert.deepEqual(automaticRouteFlowStreams([...streams].reverse()).map(s=>s.route.id),['primary-v6'], 'Respect the configured order, whichever family comes first');
assert.equal(JSON.stringify(model),before, 'Playback cannot remove IPv6 from the model');
assert.deepEqual(routeFlowStreams(model,{reachable:true,route:model.route_state.flow_examples[1].route,example:model.route_state.flow_examples[1]}).map(s=>[s.route.id,s.focused]),[['primary-v6',true]], 'Focused IPv6 inspection stays available');

const reordered = {...streams[1],steps:[...streams[1].steps].reverse()};
assert.equal(automaticRouteFlowStreams([streams[0],reordered]).length,1, 'Export row ordering cannot produce duplicate animations');
const withRoute = patch => ({...streams[1],route:{...streams[1].route,...patch}});
for (const different of [
  withRoute({vpc_id:1,vni:10001}),
  withRoute({route_type:2}),
  withRoute({safi:'unicast',route_type:0,vni:0,origin_kind:'customer'}),
  {...streams[1],steps:streams[1].steps.slice(0,-1)},
  {...streams[1],steps:streams[1].steps.map(s=>({...s,fromID:s.toID,toID:s.fromID}))},
  {...streams[1],steps:streams[1].steps.map(s=>({...s,wave:s.wave+1}))},
]) assert.equal(automaticRouteFlowStreams([streams[0],different]).length,2, 'Distinct context, branches, direction or waves must be retained');
assert.equal(automaticRouteFlowStreams([streams[0],{...streams[0],route:{...streams[0].route,id:'another-v4-prefix'}}]).length,2, 'Different same-family prefixes are not a family repeat');

if (process.argv[2]) {
  const actual = JSON.parse(await readFile(process.argv[2],'utf8'));
  const all = routeFlowStreams(actual);
  const automatic = automaticRouteFlowStreams(all);
  assert(automatic.length>0 && automatic.length<all.length, 'The shipped topology has repeated IPv4/IPv6 paths to collapse');
  assert.equal(routeFlowStreams(actual).length,all.length, 'The real explicit selector stays complete');
  for (const kind of new Set(all.map(s=>s.route.origin_kind))) assert(automatic.some(s=>s.route.origin_kind===kind), `Automatic mode retains ${kind} advertisements`);
  console.log(`Shipped topology: ${all.length} selectable advertisements → ${automatic.length} automatic examples`);
}
console.log('Automatic family-path deduplication, distinct waves/contexts and explicit IPv6 inspection passed');
