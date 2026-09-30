import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const target=process.env.TOPOLOGY_URL||'http://127.0.0.1:8081/topologie/dc/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const page=await browser.newPage({viewport}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(target);await page.locator('.dc-node').first().waitFor();
  const api=new URL(await page.locator('#dc-topology-app').getAttribute('data-api-base'),target).href;
  const model=await (await page.request.get(`${api}/model`)).json();
  assert(model.route_state.flow_examples.length>=6);
  for(const example of model.route_state.flow_examples)for(const s of example.steps)assert(!s.to_id.startsWith("customer-"),"RS User must never export to customer VMs");
  assert.equal(await page.locator('#dc-show-sessions').isChecked(),true);
  assert.equal(await page.locator('#dc-show-route-flow').isChecked(),true);
  assert.equal(await page.locator('#dc-flow-examples').isVisible(),true);
  for(const afi of ['ipv4','ipv6'])assert(model.route_state.flow_examples.some(e=>e.route.origin_kind==='underlay'&&e.route.afi===afi));
  await page.locator('#dc-flow-example').selectOption(model.route_state.flow_examples.find(e=>e.route.safi==='evpn').route.id);
  const isEnd=id=>/^(host-|customer-|border-)/.test(id);
  for(const example of model.route_state.flow_examples) {
   for(const s of example.steps)if(!isEnd(s.to_id))assert(example.steps.some(n=>n.from_id===s.to_id&&n.wave===s.wave+1),'RS branches must continue');
  }
  await page.locator('#dc-show-sessions').check();await page.locator('#dc-show-route-flow').check();
  for(const collapsed of [true,false]) {
   await page.locator('#dc-collapse-rs').setChecked(collapsed);
   await page.waitForFunction(()=>document.querySelectorAll('.dc-route-marker[visibility=visible]').length>1);
   const seen=await page.locator('.dc-route-marker[visibility=visible]').evaluateAll(ms=>ms.map(m=>({...m.dataset,cx:+m.getAttribute('cx'),cy:+m.getAttribute('cy')})));
   assert.equal(new Set(seen.map(m=>m.routeId)).size,1,'Only one advertisement branches at a time');
   const example=model.route_state.flow_examples.find(e=>e.route.id===seen[0].routeId);
   for(const m of seen)assert(example.steps.some(s=>s.from_id===m.from&&s.to_id===m.to&&s.wave===+m.wave),'Every marker must follow an actual expected export');
   const before=seen[0];await page.waitForFunction(({from,to,cx,cy})=>Array.from(document.querySelectorAll('.dc-route-marker[visibility=visible]')).some(m=>m.dataset.from===from&&m.dataset.to===to&&Math.hypot(+m.getAttribute('cx')-cx,+m.getAttribute('cy')-cy)>1),before);
  }

  // Observe a whole example reach its end devices before another prefix begins.
  const prefix=await page.locator('#dc-route-marker').getAttribute('data-route-id');
  const last=Math.max(...model.route_state.flow_examples.find(e=>e.route.id===prefix).steps.map(s=>s.wave));
  await page.waitForFunction(({prefix,last})=>{const ms=Array.from(document.querySelectorAll('.dc-route-marker[visibility=visible]'));return ms.length&&ms.every(m=>m.dataset.routeId===prefix&&+m.dataset.wave===last)}, {prefix,last}, {timeout:20000});
  const terminals=await page.locator('.dc-route-marker[visibility=visible]').evaluateAll(ms=>ms.map(m=>m.dataset.to));assert(terminals.every(isEnd));
  // A custom inspection targeting an RS also continues to end-device deliveries.
  for(const example of model.route_state.flow_examples) {
   await page.locator('#dc-flow-example').selectOption(example.route.id);
   await page.waitForFunction(id=>{const ms=Array.from(document.querySelectorAll('.dc-route-marker[visibility=visible]'));return ms.length&&ms.every(m=>m.dataset.routeId===id&&+m.dataset.wave===0)},example.route.id);
   assert.match(await page.locator('#dc-current-advertisement').textContent(),new RegExp(example.route.prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   assert(await page.locator('.dc-session.is-flow-current').count()>0);
  }
  // Inspection overrides the previous repeat choice.
  await page.locator('#dc-explorer > summary').click();
  await page.locator('#dc-update-form [name="from"]').selectOption('host-b1-h1');
  await page.locator('#dc-update-form [name="to"]').selectOption('rs-ctrl-m1');
  const response=page.waitForResponse(r=>r.url().includes('/explore?kind=update'));
  await page.locator('#dc-update-form button[type=submit]').click();
  const flow=(await (await response).json()).update_flow;assert(flow.reachable);
  assert.equal(await page.locator("#dc-flow-example").inputValue(),"");
  const final=Math.max(...flow.example.steps.map(s=>s.wave));
  await page.waitForFunction(({prefix,last})=>{const ms=Array.from(document.querySelectorAll('.dc-route-marker[visibility=visible]'));return ms.length&&ms.every(m=>m.dataset.routeId===prefix&&+m.dataset.wave===last)}, {prefix:flow.route.id,last:final}, {timeout:20000});
  assert((await page.locator('.dc-route-marker[visibility=visible]').evaluateAll(ms=>ms.map(m=>m.dataset.to))).every(isEnd));
  await page.keyboard.press('Escape');
  await page.waitForFunction(id=>document.querySelector('#dc-route-marker').dataset.routeId===id,model.route_state.flow_examples[0].route.id);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.querySelector('.dc-route-marker[visibility=visible]'));
  assert(await page.locator('.dc-session.illustrative').count()>0);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#dc-show-route-flow').uncheck();
  assert.equal(await page.locator('.dc-route-marker[visibility=visible]').count(),0);
  assert.equal(await page.locator('#dc-flow-examples').isHidden(),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Expected-export fanout, single-prefix waves, grouped/expanded RS, reduced motion and both widths: passed');
}finally{await browser.close();}
