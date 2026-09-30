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
  assert(model.route_state.flow_examples.length>=4);
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
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>!document.querySelector('.dc-route-marker[visibility=visible]'));
  assert(await page.locator('.dc-session.illustrative').count()>0);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#dc-show-route-flow').uncheck();
  assert.equal(await page.locator('.dc-route-marker[visibility=visible]').count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Expected-export fanout, single-prefix waves, grouped/expanded RS, reduced motion and both widths: passed');
}finally{await browser.close();}
