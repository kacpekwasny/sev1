import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {packetTraversal,packetPosition}=await import(`data:text/javascript;base64,${(await readFile('web/static/dc-topology/packet-path.js')).toString('base64')}`);
const links=[{from:'vm',to:'host',points:[{x:10,y:0},{x:10,y:20}],hopIndex:0},{from:'host',to:'tor',points:[{x:10,y:-40},{x:10,y:-100}],hopIndex:1},{from:'tor',to:'leaf',points:[{x:10,y:-148},{x:50,y:-250}],hopIndex:2}];
const traversal=packetTraversal(links);
assert.equal(traversal.filter(s=>s.internal).length,2);
assert.deepEqual(traversal[1].points,[links[0].points[1],links[1].points[0]]);
assert.deepEqual(packetPosition(traversal,-1),{...links[0].points[0],hopIndex:0,internal:false});
let elapsed=0;
for(let i=0;i<traversal.length;i++) {
 const s=traversal[i];
 if(i)assert.deepEqual(traversal[i-1].points[1],s.points[0]);
 const midpoint=packetPosition(traversal,elapsed+s.duration/2);
 assert.equal(midpoint.x,(s.points[0].x+s.points[1].x)/2);assert.equal(midpoint.y,(s.points[0].y+s.points[1].y)/2);
 if(s.internal)assert.equal(midpoint.hopIndex,s.hopIndex);
 elapsed+=s.duration;
 const before=packetPosition(traversal,elapsed-.001),after=packetPosition(traversal,elapsed+.001);
 assert(Math.hypot(before.x-after.x,before.y-after.y)<.01,'No teleport at link/node contact');
}
assert.deepEqual(packetPosition(traversal,elapsed+100),{...links.at(-1).points[1],hopIndex:3,internal:false});
assert.equal(packetPosition([],0),null);
assert.equal(packetTraversal([{...links[0]}, {...links[1],points:[links[0].points[1],links[1].points[1]]}]).length,2,'Shared contact needs no zero-length traversal');
console.log('Continuous node contacts, interior midpoint, boundary clocks, negative first frame and final arrival: passed');
