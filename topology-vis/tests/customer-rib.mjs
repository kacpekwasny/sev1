import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {routingEntries,zebraRouteLine,kernelRouteLine}=await import(`data:text/javascript;base64,${(await readFile('web/static/dc-topology/tables.js')).toString('base64')}`);
const host='host-b1-h1',remote='host-b2-h1';
const primary={id:'vm/customer-3/ipv4/10.64.0.3',prefix:'10.64.0.3/32',safi:'evpn'};
const extra={id:'customer/customer-3/ipv4/10.96.0.3/32',prefix:'10.96.0.3/32',safi:'unicast'};
const dataplane={owner_id:host,protocol:'bgp',vpc_id:0,vrf:'default',kernel_table:'main',vni:3,
 next_hop_node_id:remote,encapsulate_vxlan:true,kernel_device:'br3',tunnel_device:'vxlan3',kernel_next_hop:'10.16.0.17'};
const model={nodes:[],interfaces:[],route_state:{origins:[primary,extra],forwarding:[
 {...dataplane,route_id:primary.id,prefix:primary.prefix,next_hop:'10.16.0.17',route_type:5},
 {...dataplane,route_id:extra.id,prefix:extra.prefix,next_hop:'10.64.0.3',route_type:0,resolved_route_id:primary.id,resolved_next_hop:'10.16.0.17'},
 {...dataplane,route_id:extra.id+'-local',prefix:extra.prefix,next_hop:'10.64.0.3',route_type:0,resolved_route_id:primary.id,resolved_next_hop:'10.16.0.17',encapsulate_vxlan:false,kernel_device:'tap-c3',kernel_next_hop:'10.64.0.3'}]}};
const [vm,unicast,local]=routingEntries(model,host);
assert.equal(vm.rib_source,'evpn-import');
assert.match(zebraRouteLine(model,vm),/via 10\.16\.0\.17.*br3/s);
for(const route of [unicast,local]) {
 assert.equal(route.rib_source,'recursive');
 const line=zebraRouteLine(model,route);
 assert.match(line,/B>\* 10\.96\.0\.3\/32 \[20\/0\] via 10\.64\.0\.3 \(recursive\)/);
 assert.doesNotMatch(line,/via 10\.16\.0\.17|import EVPN|directly connected/);
 assert.match(line,/IPv4 unicast; next hop to podstawowy IP VM/);
}
// A resolved kernel nexthop describes actual delivery; it does not change NLRI.
assert.match(kernelRouteLine(model,unicast),/10\.96\.0\.3\/32 via 10\.16\.0\.17 dev br3 proto bgp onlink/);
assert.match(kernelRouteLine(model,unicast),/# RIB: via 10\.64\.0\.3; rekursja EVPN/);
for(const prefix of ['2001:db8:6:500::/56','2001:db8:6:500::/64','2001:db8:6:500::3/128']) {
 const route={...dataplane,route_id:'additional/v6/'+prefix,prefix,next_hop:'2001:db8:6::3:0:1',resolved_route_id:'vm/customer-3/ipv6/2001:db8:6::3:0:1',resolved_next_hop:'10.16.0.17',kernel_next_hop:'::ffff:10.16.0.17'};
 model.route_state.forwarding.push(route);
 const selected=routingEntries(model,host).at(-1),line=zebraRouteLine(model,selected);
 assert.equal(selected.rib_source,'recursive');
 assert.match(line,/via 2001:db8:6::3:0:1 \(recursive\)/);
 assert.match(line,/IPv6 unicast/);
 assert.doesNotMatch(line,/via ::ffff:/);
 assert.match(kernelRouteLine(model,selected),/via ::ffff:10\.16\.0\.17 dev br3/);
}
console.log('Primary EVPN imports, additional unicast RIB next hops and distinct resolved kernel output: passed');
