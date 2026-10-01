import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {addressInventory,explainAddress}=await import(`data:text/javascript;base64,${(await readFile('web/static/dc-topology/addresses.js')).toString('base64')}`);
const model={config:{route_origins:[{prefix:'198.51.100.0/24',border_id:1,vpc_id:0}]},
 nodes:[{id:'host-1',label:'h1001',kind:'host',ipv4:'10.16.0.1',ipv6:'fd42:1234:2:1:0:1:0:2a'},
  {id:'tor-1',label:'ToR 1',kind:'tor',ipv4:'10.0.0.33',ipv6:'2001:db8:1::21:0:1'},
  {id:'border-1',label:'Border 01',kind:'border',ipv4:'10.0.0.1',ipv6:'2001:db8:1::1:0:1'}],
 vms:[{id:'vm-1',label:'Klient 1',role:'customer',host_id:'host-1',vpc_id:1,addresses:['10.64.0.10','fd42:1234:6::10']},
  {id:'vm-2',label:'Klient 2',role:'customer',host_id:'host-1',vpc_id:2,addresses:['10.64.0.10','fd42:1234:6::10']}],
 interfaces:[{id:'h/tor',node_id:'host-1',peer_node_id:'tor-1',link_id:'link-1',name:'to-tor-1',link_local_ipv6:'fe80::1'},
  {id:'tor/h',node_id:'tor-1',peer_node_id:'host-1',link_id:'link-1',name:'to-host-1',link_local_ipv6:'fe80::2'}],bgp_sessions:[]};
const inventory=addressInventory(model);
assert.deepEqual(explainAddress(inventory,'10.64.0.10',{vpcID:1}).ownerIDs,['vm-1']);
assert.deepEqual(explainAddress(inventory,'10.64.0.10',{vpcID:2}).ownerIDs,['vm-2']);
assert.deepEqual(explainAddress(inventory,'fd42:1234:6::10/128',{vpcID:1}).ownerIDs,['vm-1']);
assert.deepEqual(explainAddress(inventory,'10.64.0.10').ownerIDs,['vm-1','vm-2']);
assert.deepEqual(explainAddress(inventory,'fd42:1234:0002:0001:0000:0001:0000:002a').ownerIDs,['host-1']);
const mapped=explainAddress(inventory,'::ffff:10.16.0.1');
assert.deepEqual(mapped.ownerIDs,['host-1']);assert.match(mapped.title,/VTEP IPv4/);
assert.deepEqual(explainAddress(inventory,'fe80::2',{ownerID:'host-1',after:' dev to-tor-1 weight 1'}).ownerIDs,['tor-1']);
assert.deepEqual(explainAddress(inventory,'fe80::1',{interfaceID:'h/tor'}).ownerIDs,['host-1']);
assert.match(explainAddress(inventory,'198.51.100.1',{vpcID:0}).description,/scenariusza.*Border 01/);
assert.match(explainAddress(inventory,'0.0.0.0/0').description,/domyślnej/);
assert.match(explainAddress(inventory,'203.0.113.42').description,/bez właściciela/);
assert.equal(explainAddress(inventory,'64512:65535'),null);
assert.equal(explainAddress(inventory,'02:00:00:00:00:11'),null);
assert.equal(explainAddress(inventory,'999.1.2.3'),null);
model.vms.push({id:'vm-public',label:'Public VM',role:'customer',vpc_id:0,host_id:'host-1',ipv4:'10.64.0.11',ipv6:'2001:db8:6::11',addresses:['10.64.0.11','2001:db8:6::11'],advertised_prefixes:['10.96.0.11/32','2001:db8:6:100::/56']});
const extra=addressInventory(model);
assert.deepEqual(explainAddress(extra,'10.96.0.11/32',{vpcID:0}).ownerIDs,['vm-public']);
assert.match(explainAddress(extra,'2001:db8:6:120::12',{vpcID:0}).description,/prefiks unicast|nie jest kolejną trasą EVPN/);
assert.deepEqual(explainAddress(extra,'2001:db8:6:120::12',{vpcID:0}).ownerIDs,['vm-public']);
console.log('Address ownership, configured IPv6, VRF overlap, mapped VTEPs and link-local scope: passed');
