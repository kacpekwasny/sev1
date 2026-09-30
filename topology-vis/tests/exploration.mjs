// Run with the same external Playwright setup as browser.mjs.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const target = process.env.TOPOLOGY_URL || "http://127.0.0.1:8081/topologie/dc/";
const output = process.env.TOPOLOGY_SCREENSHOTS || "/tmp/dc-topology-browser";
await mkdir(output, {recursive:true});
const browser = await chromium.launch({channel:"chrome",headless:true});
try {
 const context = await browser.newContext({viewport:{width:1280,height:900}});
 const page = await context.newPage(), errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 page.on("console",message=>{if(message.type()==="error"&&!message.text().includes("400 (Bad Request)"))errors.push(message.text());});
 await page.goto(target); await page.locator('.dc-node').first().waitFor();
 const api = new URL(await page.locator('#dc-topology-app').getAttribute('data-api-base') || '/api',target).href;
 const yaml = await (await context.request.get(`${api}/config.yaml`)).text();
 const model = await (await context.request.get(`${api}/model`)).json();
 assert.equal(model.local_links.length,19); assert.equal(model.local_interfaces.length,38);
 const choose=async(kind,from,to,family)=>{
   if(!(await page.locator('#dc-explorer').evaluate(d=>d.open)))await page.locator('#dc-explorer > summary').click();
   await page.locator(`#dc-${kind}-form [name="from"]`).selectOption(from);
   await page.locator(`#dc-${kind}-form [name="to"]`).selectOption(to);
   if(family)await page.locator(`#dc-${kind}-form [name="family"]`).selectOption(family);
   await page.locator(`#dc-${kind}-form button[type=submit]`).click();
   await page.waitForFunction((kind)=>!document.querySelector(`#dc-${kind}-form button[type=submit]`).disabled,kind);
 };
 const assertPacketVisible=async()=>{
   const view=await page.evaluate(()=>{
     const wire=document.querySelector('#dc-details .dc-wire'),heading=wire.querySelector('h4');
     const firstField=wire.querySelector('.dc-bit-field').getBoundingClientRect();
     const topbar=document.querySelector('.topbar')?.getBoundingClientRect().bottom??0;
     const details=document.querySelector('#dc-details').getBoundingClientRect();
     const headingBox=heading.getBoundingClientRect();
     return {focused:document.activeElement===heading,scrolled:document.querySelector('#dc-details').scrollTop>0,
       visible:headingBox.top>=Math.max(topbar,details.top)&&firstField.bottom<=Math.min(innerHeight,details.bottom)};
   });
   assert.equal(view.focused,true,'Inspect packet must focus the packet heading');
   assert.equal(view.scrolled,true,'Inspect packet must scroll the popup body to packet fields');
   assert.equal(view.visible,true,'Packet heading and first fields must be on screen below sticky navigation');
 };
 // Primary traffic UI is beside a clicked device; advanced forms start closed.
 assert.equal(await page.locator('#dc-explorer').evaluate(d=>d.open),false);
 await page.locator('.dc-vm[data-entity-id="customer-1"]').click();
 await page.locator('#dc-device-actions').waitFor({state:'visible'});
 const action=await page.locator('#dc-device-actions').boundingBox(),canvasActions=await page.locator('.dc-workspace').boundingBox();
 assert(action.x>=canvasActions.x&&action.x+action.width<=canvasActions.x+canvasActions.width+1);
 await page.screenshot({path:`${output}/device-send-action.png`,fullPage:true,animations:'disabled'});
 await page.locator('#dc-action-family').selectOption('ipv6');await page.locator('#dc-send-to').click();
 await page.locator('.dc-vm[data-entity-id="customer-3"]').click();
 await page.waitForFunction(()=>!document.querySelector('#dc-packet-form button[type=submit]').disabled);
 assert.match(await page.locator('#dc-details').textContent(),/ICMPv6/);
 // Explicit playback must move custom-endpoint packets even with reduced motion.
 // The decorative route stream remains disabled by that preference.
 await page.emulateMedia({reducedMotion:'reduce'});
 const sourceMarker=await page.locator('#dc-packet-marker').evaluate(m=>[Number(m.getAttribute('cx')),Number(m.getAttribute('cy'))]);
 await page.locator('#dc-play').click();
 await page.waitForFunction(([x,y])=>{
   const m=document.querySelector('#dc-packet-marker');
   return Math.hypot(Number(m.getAttribute('cx'))-x,Number(m.getAttribute('cy'))-y)>1;
 },sourceMarker,{timeout:3000});
 assert.equal(await page.locator('#dc-play').textContent(),'Wstrzymaj pakiet');
 await page.locator('#dc-play').click();
 const pausedMarker=await page.locator('#dc-packet-marker').getAttribute('cy');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('#dc-packet-marker').getAttribute('cy'),pausedMarker);
 await page.locator('#dc-rewind').click();
 assert.deepEqual(await page.locator('#dc-packet-marker').evaluate(m=>[Number(m.getAttribute('cx')),Number(m.getAttribute('cy'))]),sourceMarker);
 await page.locator('#dc-play').click();
 await page.locator('#dc-show-links').uncheck();
 assert.equal(await page.locator('#dc-play').textContent(),'Odtwórz pakiet');
 assert.equal(await page.locator('#dc-packet-marker').getAttribute('visibility'),'hidden');
 await page.locator('#dc-show-links').check();
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.keyboard.press('Escape');
 await page.locator('#dc-explorer > summary').click();
 await page.locator('#dc-packet-form [name="family"]').selectOption('ipv4');
 // Placement policies and click-selected packet endpoints.
 for(const vm of model.vms.filter(v=>v.role==='rs_bolt'))assert.equal(vm.host_bolt_id,vm.served_bolt);
 assert.deepEqual([...new Set(model.vms.filter(v=>v.role==='rs_ctrl').map(v=>v.host_bolt_id))].sort(),[1,2]);
 await page.locator('[data-pick-endpoint="pair"]').click();
 await page.locator('.dc-vm[data-entity-id="customer-1"]').click();
 assert.match(await page.locator('#dc-pick-banner').textContent(),/docelowe/);
 await page.locator('.dc-vm[data-entity-id="customer-3"]').click();
 await page.waitForFunction(()=>!document.querySelector('#dc-packet-form button[type=submit]').disabled);
 assert.equal(await page.locator('#dc-pick-banner').isHidden(),true);
 assert.equal(await page.locator('#dc-packet-form [name="from"]').inputValue(),'customer-1');
 assert.equal(await page.locator('#dc-packet-form [name="to"]').inputValue(),'customer-3');
 const vni=page.locator('.dc-bit-field[data-field="VNI"]').first();await vni.click();
 assert.match(await page.locator('.dc-bit-info').textContent(),/24 bitów · 10001/);
 await page.locator('.dc-bit-field[data-layer="UDP"][data-field="Destination Port"]').click();
 assert.match(await page.locator('.dc-bit-info').textContent(),/16 bitów · 4789/);
 await page.screenshot({path:`${output}/packet-bits.png`,fullPage:true,animations:'disabled'});
 // A popup can be moved without dragging any topology device.
 const before=await page.locator('#dc-inspector').boundingBox();
 const grip=await page.locator('#dc-inspector-grip').boundingBox();
 await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
 await page.mouse.move(grip.x+grip.width/2-180,grip.y+grip.height/2+10,{steps:6});await page.mouse.up();
 const after=await page.locator('#dc-inspector').boundingBox();assert(before.x-after.x>150);
 await page.locator('#dc-inspector-grip').press('Home');
 await page.keyboard.press('Escape');
 // GUI and terminal rows retain the inspected speaker and allow going back.
 await page.locator('.dc-node[data-entity-id="host-b1-h1"] .dc-node-label').click();
 const localOrigins=model.route_state.origins.filter(r=>r.origin_id==='host-b1-h1');
 assert.equal(await page.locator('[data-origin-speaker="host-b1-h1"] .dc-route-row').count(),localOrigins.length);
 await page.locator('[data-origin-speaker="host-b1-h1"] > summary').click();
 assert.match(await page.locator('[data-origin-speaker="host-b1-h1"]').textContent(),/10\.16\.0\.1/);

 const remote='vm/customer-3/ipv4/10.64.0.3';
 const guiRoute=page.locator(`[data-family="l2vpn"] .dc-route-row[data-route-id="${remote}"]`).first();
 const beforeHover=await page.locator('#dc-inspector-heading').textContent();
 let hoverRequests=0;
 const countHover=request=>{if(request.url().includes('/inspector?kind=route'))hoverRequests++;};
 page.on('request',countHover);
 await guiRoute.hover();
 await page.waitForFunction(()=>document.querySelectorAll('.dc-route-learned').length>0);
 assert.equal(await page.locator('.dc-route-learned').last().getAttribute('data-to'),'host-b1-h1');
 assert.equal(await page.locator('.dc-route-points-to').last().getAttribute('data-to'),'customer-3');
 assert.equal(await page.locator('#dc-inspector-heading').textContent(),beforeHover);
 assert.equal(hoverRequests,0,'Hover must not fetch route details or change tables');
 const routeMarker=page.locator('.dc-route-propagation-marker');
 assert.equal(await routeMarker.count(),1);
 assert.equal(await routeMarker.getAttribute('data-from'),await page.locator('.dc-route-learned').first().getAttribute('data-from'));
 assert.equal(await routeMarker.getAttribute('data-to'),'host-b1-h1');
 const routeStart=await routeMarker.evaluate(marker=>{const t=marker.getCTM();return [t.e,t.f];});
 await page.waitForFunction(([x,y])=>{const t=document.querySelector('.dc-route-propagation-marker')?.getCTM();return t&&Math.hypot(t.e-x,t.f-y)>1;},routeStart);
 await page.locator('#dc-inspector-grip').hover();
 await page.waitForFunction(()=>document.querySelectorAll('.dc-route-learned').length===0);
 assert.equal(await page.locator('.dc-route-points-to').count(),0);
 assert.equal(await routeMarker.count(),0);
 await guiRoute.focus();
 await page.waitForFunction(()=>document.querySelectorAll('.dc-route-learned').length>0);
 assert.equal(await page.locator('#dc-inspector-heading').textContent(),beforeHover);
 await page.locator('#dc-inspector-grip').focus();
 await page.waitForFunction(()=>document.querySelectorAll('.dc-route-learned').length===0);
 assert.equal(hoverRequests,0,'Keyboard preview must also use cached metadata');
 page.off('request',countHover);
 await page.locator(`[data-family="l2vpn"] .dc-route-row[data-route-id="${remote}"]`).first().click();
 // The replacement export list can appear beneath the stationary mouse. Check
 // the pinned route with the pointer away from those independently hoverable rows.
 await page.locator('#dc-inspector-grip').hover();
 await page.waitForFunction(()=>document.querySelectorAll('.dc-route-learned').length>0);
 assert.equal(await page.locator('.dc-route-learned').last().getAttribute('data-to'),'host-b1-h1');
 assert.equal(await page.locator('.dc-route-points-to').last().getAttribute('data-to'),'customer-3');
 assert.match(await page.locator('.dc-route-provenance').textContent(),/RIB h1001/);
 assert.equal(await routeMarker.count(),1,'The inspected route keeps its directional flow');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.querySelector('.dc-route-propagation-marker')&&!document.querySelector('.dc-route-propagation-marker animateMotion'));
 assert.match(await routeMarker.getAttribute('transform'),/rotate/);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.dc-route-propagation-marker animateMotion').waitFor({state:'attached'});
 await page.screenshot({path:`${output}/route-provenance.png`,fullPage:true,animations:'disabled'});
 await page.locator('#dc-inspector-back').click();
 assert.match(await page.locator('#dc-inspector-heading').textContent(),/h1001/);
 assert.equal(await page.locator('.dc-rib-family').count(),3);
 assert.equal(await page.locator('.dc-route-learned').count(),0);
 await page.locator('#dc-rib-view').selectOption('linux');
 const cliRoute=page.locator(`[data-family="l2vpn"] .dc-cli-route[data-route-id="${remote}"]`);
 await cliRoute.hover();await page.waitForFunction(()=>document.querySelectorAll('.dc-route-learned').length>0);
 assert.match(await page.locator('#dc-inspector-heading').textContent(),/h1001/);
 await page.locator('#dc-inspector-grip').hover();
 await page.waitForFunction(()=>document.querySelectorAll('.dc-route-learned').length===0);
 await page.locator(`[data-family="l2vpn"] .dc-cli-route[data-route-id="${remote}"]`).click();
 assert((await page.locator('.dc-route-learned').count())>0);
 await page.locator('#dc-inspector-back').click();
 assert.equal(await page.locator('#dc-rib-view').inputValue(),'linux');
 assert.equal(await page.locator('#dc-inspector-back').isDisabled(),true);
 await page.locator('#dc-rib-view').selectOption('gui');await page.keyboard.press('Escape');
 await page.locator('.dc-vm[data-entity-id="rs-ctrl-m1"]').click();
 assert.match(await page.locator('[data-origin-speaker="rs-ctrl-m1"]').textContent(),/nie inicjuje tras BGP/);
 await page.keyboard.press('Escape');
 await page.locator('.dc-vm[data-entity-id="customer-1"]').click();
 assert.equal(await page.locator('[data-origin-speaker="customer-1"] .dc-route-row').count(),2);
 await page.keyboard.press('Escape');

 await choose('update','host-b1-h1','host-b2-h1');
 assert.equal(await page.locator('.dc-update-step').count(),4);
 assert((await page.locator('.dc-session.illustrative').count())>=4);
 assert.match(await page.locator('#dc-details').textContent(),/MP_REACH_NLRI/);
 assert.match(await page.locator('#dc-details').textContent(),/nie jest atrybutem przesyłanym przez eBGP/);
 assert((await page.locator('#dc-update-form [name="route"] option').count())>1);
 await page.screenshot({path:`${output}/update-inspector.png`,fullPage:true,animations:'disabled'});
 await page.keyboard.press('Escape');
 await page.locator('#dc-show-infra-hosts').uncheck(); await page.locator('#dc-collapse-rs').check();
 assert((await page.locator('.dc-session.illustrative').count())>=4);
 await choose('update','host-b2-h1','host-b1-h1');
 const remoteRoute='vm/customer-1/ipv4/10.64.0.1';
 // Server rejects an invented export rather than reversing the visible arrows.
 const blocked = await (await context.request.get(`${api}/explore?kind=update&from=host-b2-h1&to=host-b1-h1&route=${encodeURIComponent(remoteRoute)}`)).json();
 assert.equal(blocked.update_flow.reachable,false);
 await page.keyboard.press('Escape'); await page.locator('#dc-show-route-flow').uncheck();
 await page.locator('#dc-show-sessions').uncheck();await page.locator('#dc-show-infra-hosts').check();await page.locator('#dc-collapse-rs').uncheck();

 await choose('packet','customer-1','customer-3','ipv4');
 assert.match(await page.locator('#dc-details').textContent(),/49152 \/ 4789/);
 assert.match(await page.locator('#dc-details').textContent(),/VNI10001/);
 assert.match(await page.locator('#dc-details').textContent(),/tap-c1/);
 assert.match(await page.locator('#dc-details').textContent(),/tap-c3/);
 assert((await page.locator('.dc-edge.flow-path').count())>0);
 await page.screenshot({path:`${output}/packet-inspector.png`,fullPage:true,animations:'disabled'});
 await page.keyboard.press('Escape'); await page.locator('#dc-play').click();
 await page.waitForFunction(()=>document.querySelector('#dc-packet-marker').getAttribute('visibility')==='visible');
 await page.locator('#dc-inspect-packet').click(); assert.match(await page.locator('#dc-inspector-heading').textContent(),/Pakiet/);
 await assertPacketVisible();
 await page.locator('#dc-details').evaluate(d=>d.scrollTop=d.scrollHeight);
 await page.locator('#dc-inspect-packet').click();await assertPacketVisible();
 await page.keyboard.press('Escape');
 await page.locator('.dc-node[data-entity-id="border-1"]').click();
 await page.locator('#dc-inspect-packet').click();
 assert.match(await page.locator('#dc-details').textContent(),/49152 \/ 4789/);
 await assertPacketVisible();
 await page.keyboard.press('Escape');
 // Inspecting a preset fetches a new packet; reveal waits for that response.
 let releasePacket;
 const packetGate=new Promise(resolve=>{releasePacket=resolve;});
 await page.route('**/explore?**',async route=>{await packetGate;await route.continue();});
 await page.locator('[data-traffic-id="miedzy-boltami"]').click();
 await page.locator('#dc-inspect-packet').click();
 assert.match(await page.locator('#dc-details').textContent(),/Wczytuję drogę pakietu/);
 releasePacket();
 await page.waitForFunction(()=>document.activeElement?.matches('#dc-details .dc-wire h4'));
 await assertPacketVisible();
 await page.unroute('**/explore?**');await page.keyboard.press('Escape');
 await choose('packet','customer-1','customer-2','ipv4');
 assert.equal(await page.locator('.dc-local-path').count(),2);
 assert.equal(await page.locator('.dc-packet-hop').count(),3);
 assert.equal(await page.locator('.dc-edge.flow-path').count(),0);
 assert.equal(await page.locator('#dc-play').isDisabled(),false);
 await page.keyboard.press('Escape');
 await choose('packet','border-1','leaf-b1-1','ipv6');
 assert.match(await page.locator('#dc-details').textContent(),/ICMPv6/);
 assert.equal(await page.locator('#dc-details').getByText('Enkapsulacja:',{exact:false}).count(),0);
 // A wrapped field is one selectable value, including all four IPv6 rows.
 for(const [layer,field,parts] of [['IP','Source Address',4],['IP','Destination Address',4],['Ethernet','Destination MAC',2],['ICMPv6 Echo Request','Payload',null]]) {
   const fragments=page.locator(`.dc-bit-field[data-layer="${layer}"][data-field="${field}"]`);
   const count=await fragments.count();if(parts)assert.equal(count,parts);else assert(count>1);
   await fragments.last().hover();
   assert.equal(await page.locator('.dc-bit-field.hovered').count(),count,'Hover must highlight every fragment and only that field');
   assert.equal(await fragments.evaluateAll(cells=>new Set(cells.map(cell=>getComputedStyle(cell).backgroundColor)).size),1);
   await page.locator('#dc-inspector-grip').hover();
   assert.equal(await page.locator('.dc-bit-field.hovered').count(),0);
   await fragments.first().focus();
   assert.equal(await page.locator('.dc-bit-field.field-focus').count(),count,'Keyboard focus must highlight the complete field');
   await page.locator('#dc-inspector-grip').focus();
   assert.equal(await page.locator('.dc-bit-field.field-focus').count(),0);
 }
 const sourceField=page.locator('.dc-bit-field[data-layer="IP"][data-field="Source Address"]');
 await sourceField.first().click();
 await page.locator('.dc-bit-field[data-layer="IP"][data-field="Destination Address"]').first().hover();
 assert.equal(await sourceField.evaluateAll(cells=>cells.every(cell=>cell.classList.contains('active'))),true);
 assert.match(await page.locator('.dc-bit-info').textContent(),/Source Address · 128 bitów/);
 await page.screenshot({path:`${output}/ipv6-wrapped-field-hover.png`,animations:'disabled'});
 await page.keyboard.press('Escape');

 // Rapid changes must not let an old result replace the current packet.
 let release;
 const gate = new Promise(resolve=>{release=resolve;});
 await page.route('**/explore?**',async route=>{
   const q=new URL(route.request().url()).searchParams;
   if(q.get('kind')==='packet'&&q.get('to')==='customer-3'&&q.get('family')==='ipv4')await gate;
   await route.continue();
 });
 await page.locator('#dc-packet-form [name="from"]').selectOption('customer-1');
 await page.locator('#dc-packet-form [name="to"]').selectOption('customer-3');
 await page.locator('#dc-packet-form [name="family"]').selectOption('ipv4');
 await page.locator('#dc-packet-form button[type=submit]').click();
 await page.locator('#dc-packet-form [name="family"]').selectOption('ipv6');
 await page.locator('#dc-packet-form button[type=submit]').click();
 await page.waitForFunction(()=>!document.querySelector('#dc-packet-form button[type=submit]').disabled);
 assert.match(await page.locator('#dc-details').textContent(),/ICMPv6/);
 const delayed=page.waitForResponse(response=>response.url().includes('/explore?')&&response.url().includes('family=ipv4'));
 release();await delayed;
 assert.match(await page.locator('#dc-details').textContent(),/ICMPv6/);
 await page.unroute('**/explore?**');await page.keyboard.press('Escape');

 // A session export opens its exact directed UPDATE, not only the origin route.
 await page.locator('.dc-node[data-entity-id="border-1"]').click();
 await page.locator('#dc-details summary').filter({hasText:'Sesje BGP ('}).click();
 let releaseSession;
 const sessionGate=new Promise(resolve=>{releaseSession=resolve;});
 await page.route('**/inspector?**',async route=>{
   if(new URL(route.request().url()).searchParams.get('kind')==='session')await sessionGate;
   await route.continue();
 });
 await page.locator('#dc-details [data-session-id]').first().click();
 await page.locator('#dc-inspect-packet').click();
 assert.equal(await page.locator('#dc-inspector-heading').textContent(),'Sesja BGP');
 assert.match(await page.locator('#dc-details').textContent(),/TCP 49152 → 179/);
 await assertPacketVisible();
 releaseSession();await page.locator('.dc-update-inspect').first().waitFor({state:'attached'});
 await assertPacketVisible();
 await page.unroute('**/inspector?**');
 // Border exports are empty; open the incoming direction that has actual NLRI.
 const incoming=page.locator('#dc-details > .dc-interface-details').filter({has:page.locator('.dc-update-inspect')}).first();
 await incoming.locator(':scope > summary').click();
 await page.locator('.dc-update-inspect:visible').first().click();
 await page.waitForFunction(()=>!document.querySelector('#dc-update-form button[type=submit]').disabled);
 assert.equal(await page.locator('.dc-update-step').count(),1);
 await page.keyboard.press('Escape');

 await page.setViewportSize({width:390,height:844});
 await choose('packet','customer-1','customer-3','ipv6');
 await page.keyboard.press('Escape');await page.locator('#dc-inspect-packet').click();
 await assertPacketVisible();
 await page.screenshot({path:`${output}/mobile-inspect-packet-visible.png`,animations:'disabled'});
 await page.locator('.dc-bit-field[data-field="VNI"]').first().click();
 assert.match(await page.locator('.dc-bit-info').textContent(),/10001/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 const box=await page.locator('#dc-inspector').boundingBox(), canvas=await page.locator('#dc-graph').boundingBox();
 assert(box.x>=canvas.x&&box.x+box.width<=canvas.x+canvas.width+1);
 const close=await page.locator('#dc-inspector-close').boundingBox();
 assert(close.y>=150&&close.y+close.height<844,'Close control must remain below the sticky navigation');
 await page.screenshot({path:`${output}/mobile-packet.png`,fullPage:true,animations:'disabled'});
 await page.keyboard.press('Escape');
 await choose('update','host-b1-h1','host-b2-h1');
 await page.screenshot({path:`${output}/mobile-update.png`,fullPage:true,animations:'disabled'});
 assert.equal(await (await context.request.get(`${api}/config.yaml`)).text(),yaml);
 // Real touch input moves the common inspector handle; cancellation restores it.
 const touchContext=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});
 const touchPage=await touchContext.newPage();touchPage.on('pageerror',error=>errors.push(error.message));
 await touchPage.goto(target);await touchPage.locator('.dc-node').first().waitFor();
 await touchPage.locator('.dc-vm[data-entity-id="customer-1"]').click();
 await touchPage.locator('#dc-send-to').click();
 await touchPage.locator('.dc-vm[data-entity-id="customer-3"]').click();
 await touchPage.waitForFunction(()=>!document.querySelector('#dc-packet-form button[type=submit]').disabled);
 const touchPopup=await touchPage.locator('#dc-inspector').boundingBox();
 const tg=await touchPage.locator('#dc-inspector-grip').boundingBox();
 const cdp=await touchContext.newCDPSession(touchPage), tx=tg.x+tg.width/2,ty=tg.y+tg.height/2;
 const moveTouch=async(end)=>{
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-130,y:ty+10}]});
  await cdp.send('Input.dispatchTouchEvent',{type:end,touchPoints:[]});
 };
 await moveTouch('touchCancel');
 assert(Math.abs((await touchPage.locator('#dc-inspector').boundingBox()).x-touchPopup.x)<2);
 await moveTouch('touchEnd');assert(touchPopup.x-(await touchPage.locator('#dc-inspector').boundingBox()).x>100);
 await touchPage.setViewportSize({width:390,height:844});
 const resized=await touchPage.locator('#dc-inspector').boundingBox(), workspace=await touchPage.locator('.dc-workspace').boundingBox();
 assert(resized.x>=workspace.x&&resized.x+resized.width<=workspace.x+workspace.width+1);
 await touchContext.close();
 assert.deepEqual(errors,[]);
 console.log('Endpoint UPDATE/packet inspection, TAP paths, stale results, and narrow layouts: passed');
} finally {await browser.close();}
