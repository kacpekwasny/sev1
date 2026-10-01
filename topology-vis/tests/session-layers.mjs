import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../../web/static/dc-topology/session-layers.js', import.meta.url), 'utf8');
const {bgpSessionLayer, bgpSessionVisible, filterRouteFlowLayers} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const sessions = [
  {id:'fabric', kind:'fabric', families:[{afi:'ipv6', safi:'unicast'}]},
  {id:'host-tor', kind:'host-tor', families:[{afi:'ipv4', safi:'unicast'}]},
  {id:'host-bolt', kind:'host-rs-bolt', families:[{afi:'l2vpn', safi:'evpn'}]},
  {id:'bolt-ctrl', kind:'rs-bolt-rs-ctrl', families:[{afi:'ipv6', safi:'unicast'}]},
  {id:'ctrl-user', kind:'rs-ctrl-rs-user', families:[{afi:'ipv4', safi:'unicast'}]},
  {id:'border-ctrl', kind:'border-rs-ctrl', families:[{afi:'ipv6', safi:'unicast'}]},
  {id:'customer-user', kind:'customer-rs-user', families:[{afi:'ipv6', safi:'unicast'}]},
];
const underlay = {enabled:true, underlay:true, overlay:false};
const overlay = {enabled:true, underlay:false, overlay:true};
assert.deepEqual(sessions.filter(s=>bgpSessionVisible(s,underlay)).map(s=>s.id), ['fabric','host-tor']);
assert.deepEqual(sessions.filter(s=>bgpSessionVisible(s,overlay)).map(s=>s.id), ['host-bolt','bolt-ctrl','ctrl-user','border-ctrl','customer-user']);
assert(sessions.every(s=>!bgpSessionVisible(s,{enabled:false,underlay:true,overlay:true})), 'Master switch hides both layers');
assert(sessions.every(s=>!bgpSessionVisible(s,{enabled:true,underlay:false,overlay:false})), 'Both child switches can be disabled');
assert.equal(bgpSessionLayer({...sessions[0], families:[{afi:'l2vpn',safi:'evpn'}]}),'underlay', 'AFI does not change session layer');

const streams = [
  {route:{id:'default'}, steps:[{sessionID:'fabric'},{sessionID:'host-tor'}]},
  {route:{id:'primary'}, steps:[{sessionID:'host-bolt'},{sessionID:'bolt-ctrl'}]},
  {route:{id:'additional'}, steps:[{sessionID:'customer-user'},{sessionID:'ctrl-user'},{sessionID:'bolt-ctrl'},{sessionID:'host-bolt'}]},
  {route:{id:'mixed'}, steps:[{sessionID:'fabric'},{sessionID:'bolt-ctrl'}]},
  {route:{id:'unknown'}, steps:[{sessionID:'missing-session'}]},
];
const before = JSON.stringify({sessions,streams});
assert.deepEqual(filterRouteFlowLayers(streams,sessions,underlay).map(s=>s.route.id),['default']);
assert.deepEqual(filterRouteFlowLayers(streams,sessions,overlay).map(s=>s.route.id),['primary','additional']);
assert.deepEqual(filterRouteFlowLayers(streams,sessions,{enabled:true,underlay:true,overlay:true}).map(s=>s.route.id),['default','primary','additional','mixed']);
assert.equal(filterRouteFlowLayers(streams,sessions,{enabled:false,underlay:true,overlay:true}).length,0);
assert.equal(JSON.stringify({sessions,streams}),before, 'Visibility cannot mutate routing or truncate examples');
console.log('Session role classification and complete flow visibility passed');
