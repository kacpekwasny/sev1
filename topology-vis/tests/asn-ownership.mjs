import assert from 'node:assert/strict';
import { addressInventory, explainASN, asnTextMatches } from '../../web/static/dc-topology/addresses.js';

const model={config:{},interfaces:[],nodes:[
  {id:'host-1',kind:'host',host_id:1,label:'h1001',asn:64576,ipv4:'10.16.0.1',ipv6:'2001:db8::1'},
  {id:'border-1',kind:'border',label:'Border 01',asn:64512,ipv4:'10.0.0.1',ipv6:'2001:db8::2'},
],vms:[
  {id:'rs-ctrl-m1',role:'rs_ctrl',label:'rsctrl1',asn:64656,host_id:'host-1',ipv4:'10.32.0.17',ipv6:'2001:db8::3'},
  {id:'customer-1',role:'customer',label:'Klient 1',asn:64664,host_id:'host-1',vpc_id:2,ipv4:'10.64.0.1',ipv6:'2001:db8::4'},
  {id:'customer-2',role:'customer',label:'Klient 2',asn:64664,host_id:'host-1',vpc_id:0,ipv4:'10.64.0.2',ipv6:'2001:db8::5'},
]};
const inventory=addressInventory(model);
assert.deepEqual(explainASN(inventory,'64576').ownerIDs,['host-1']);
assert.match(explainASN(inventory,64576).description,/h1001.*Host.*10\.16\.0\.1/);
assert.doesNotMatch(explainASN(inventory,64576).description,/Host 1/,'A physical host number is not a VM host reference');
assert.deepEqual(explainASN(inventory,64656).ownerIDs,['rs-ctrl-m1']);
assert.match(explainASN(inventory,64656).description,/rsctrl1.*RS Ctrl.*Host h1001/);
assert.deepEqual(explainASN(inventory,64664).ownerIDs,['customer-1','customer-2'],'Shared ASNs identify every real owner across VRFs');
assert.match(explainASN(inventory,64664).description,/VPC 2.*\ndefault|VPC 2[\s\S]*default\/public VRF/);
assert.deepEqual(explainASN(inventory,4294967295).ownerIDs,[]);
assert.match(explainASN(inventory,4294967295).description,/bez właściciela/);
for(const value of [0,-1,4294967296,1.5,'64512:0','10.16.0.1','1.10','abc'])assert.equal(explainASN(inventory,value),null);
const tokens=(value,path=false)=>asnTextMatches(value,path).map(match=>({value:match[0],index:match.index}));
assert.deepEqual(tokens('ASN: 64576 · AS 64656'),[{value:'64576',index:5},{value:'64656',index:16}]);
assert.deepEqual(tokens('AS_PATH 64656 64576 · VNI 64576').map(token=>token.value),['64656','64576']);
assert.deepEqual(tokens('64656 64576',true).map(token=>token.value),['64656','64576']);
for(const value of ['VNI 64576 · MED 64576 · LP 64576','target:64512:0','RD 64576:1','AS 64512:0','AS_PATH 10.16.0.1','asn=64576','customer-64576'])assert.deepEqual(tokens(value),[],value);
for(const value of ['10.16.0.1','64512:0','customer-64576'])assert.deepEqual(tokens(value,true),[],value);
const full='IPv4 10.16.0.1 · AS_PATH 64656 64576 · IPv6 2001:db8::1';
for(const token of tokens(full))assert.equal(full.slice(token.index,token.index+token.value.length),token.value);
model.nodes[0]={...model.nodes[0],asn:4200000001};
assert.deepEqual(explainASN(addressInventory(model),4200000001).ownerIDs,['host-1'],'Rebuilt models refresh 32-bit ASN ownership');
console.log('ASN owners, VM placement, shared ASNs, 32-bit values and safe AS_PATH token boundaries: passed');
