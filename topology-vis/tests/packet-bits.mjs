import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Browser ES modules loaded without installing a frontend build stack.
const bits=await import(new URL("../../web/static/dc-topology/packet-bits.js", import.meta.url));
const paths=await import(`data:text/javascript;base64,${(await readFile('web/static/dc-topology/route-paths.js')).toString('base64')}`);
const flatten=(layers)=>Uint8Array.from(layers.flatMap(l=>[...l.bytes]));
const word=(bytes,i)=>(bytes[i]<<8)|bytes[i+1];
const pseudo=(src,dst,protocol,size)=>Uint8Array.from([...bits.addressBytes(src),...bits.addressBytes(dst),...(src.includes(':')?[0,0,size>>8,size&255,0,0,0,protocol]:[0,protocol,size>>8,size&255])]);
const packet={from_id:'customer-1',to_id:'customer-3',family:'ipv4',source:'10.64.0.1',destination:'10.64.0.3',payload:'SEV1: pakiet żółty',ttl:64,vxlan:true,vni:10001,outer_source:'10.0.0.1',outer_destination:'10.0.0.2',udp_source_port:49152,udp_destination_port:4789,physical_node_ids:['host-b1-h1','tor-b1-r1-a']};
for(const family of ['ipv4','ipv6']) for(const vxlan of [false,true]) {
 const p={...packet,family,vxlan,...(family==='ipv6'?{source:'2001:db8:6::1',destination:'2001:db8:6::3'}:{})};
 const layers=bits.encodePacket(p);
 for(const l of layers) {
   assert.equal(l.fields.reduce((sum,f)=>sum+f.width,0),l.bytes.length*8);
   assert.equal(l.fields.map(f=>f.bits).join(''),[...l.bytes].map(b=>b.toString(2).padStart(8,'0')).join(''),l.name);
   let offset=0;for(const f of l.fields){assert.equal(f.offset,offset);offset+=f.width;}
 }
 const ip=layers.find(l=>l.name===(vxlan?'Wewnętrzny IP':'IP'));
 const icmp=layers.at(-1).bytes;
 if(family==='ipv4'){assert.equal(bits.checksum(ip.bytes),0);assert.equal(word(ip.bytes,2),20+icmp.length);assert.equal(bits.checksum(icmp),0);}
 else {assert.equal(word(ip.bytes,4),icmp.length);assert.equal(bits.checksum(Uint8Array.from([...pseudo(p.source,p.destination,58,icmp.length),...icmp])),0);}
 if(vxlan) {
   const outer=layers[1],udp=flatten(layers.slice(2));
   assert.equal(bits.checksum(outer.bytes),0);assert.equal(word(outer.bytes,2),20+udp.length);
   assert.equal(word(udp,4),udp.length);assert.equal(word(udp,2),4789);
   assert.equal(bits.checksum(Uint8Array.from([...pseudo(p.outer_source,p.outer_destination,17,udp.length),...udp])),0);
   assert.deepEqual([...layers[3].bytes],[8,0,0,0,0,39,17,0]);
 }
}
const model={nodes:[{id:'a',kind:'host'},{id:'b',kind:'host'},{id:'t1',kind:'tor'},{id:'t2',kind:'tor'},{id:'leaf',kind:'leaf'}],vms:[{id:'vm-b',host_id:'b'}],physical_links:[{a_node_id:'a',b_node_id:'t1'},{a_node_id:'a',b_node_id:'t2'},{a_node_id:'t1',b_node_id:'leaf'},{a_node_id:'leaf',b_node_id:'t2'},{a_node_id:'t2',b_node_id:'b'}],route_state:{origins:[{id:'route',next_hop_node_id:'b',source_vm_id:'vm-b'}]}};
const result=paths.routePaths(model,{type:'route',id:'route',ownerID:'a',candidate:{path:['b','rs','a'],next_hop_node_id:'b',next_hop:'10.0.0.2'}});
assert.deepEqual(result.learned,['b','rs','a']);assert.deepEqual(result.pointsTo,['a','t2','b','vm-b']);
const towardTOR=paths.routePaths(model,{type:'route',id:'route',ownerID:'t1',candidate:{path:['b','t2','leaf','t1'],next_hop_node_id:'t2'}});
assert.deepEqual(towardTOR.pointsTo,['t1','leaf','t2']);
console.log('Wire field coverage, IPv4/IPv6 lengths/checksums, VXLAN encoding and route provenance: passed');
