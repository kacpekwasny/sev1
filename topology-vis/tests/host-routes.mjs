import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const target=process.env.TOPOLOGY_URL||'http://127.0.0.1:8081/topologie/dc/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const page=await browser.newPage({viewport});const errors=[];let requests=0;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/'))requests++;});
  await page.goto(target);await page.locator('.dc-node[data-entity-id="host-b2-h1"]').waitFor();
  await page.locator('#dc-show-route-flow').uncheck();await page.locator('#dc-show-sessions').uncheck();
  await page.locator('.dc-node[data-entity-id="host-b2-h1"] .dc-node-label').click();
  await page.locator('#dc-device-actions-close').click();
  await page.locator('.dc-originated-routes > summary').click();
  const routeID='vm/customer-3/ipv4/10.64.0.3';
  for(const mode of ['gui','linux']) {
   await page.locator('#dc-rib-view').selectOption(mode);
   const route=page.locator(`.dc-originated-routes [data-route-id="${routeID}"]`);
   const before=requests;await route.hover();
   await page.locator('.dc-route-marker[visibility="visible"]').first().waitFor();
   assert.match(await page.locator('#dc-flow-note').textContent(),/Redystrybucja/);
   assert.equal(await page.locator('.dc-session.illustrative').count()>7,true);
   assert.equal(requests,before,'hover should use the fetched snapshot');
   const label=page.locator('.dc-originated-routes > summary');await label.hover();
   await page.waitForFunction(()=>document.querySelectorAll('.dc-route-marker[visibility="visible"]').length===0);
   await route.focus();await page.locator('.dc-route-marker[visibility="visible"]').first().waitFor();
   await route.click();assert.match(await page.locator('#dc-flow-note').textContent(),/Redystrybucja/);
   await page.locator('#dc-inspector-back').click();
  }
  await page.keyboard.press('Escape');
  await page.locator('.dc-node[data-entity-id="host-b1-h1"] .dc-node-label').click();
  await page.locator('#dc-device-actions-close').click();
  await page.locator('.dc-routing-rib').waitFor();
  for(const mode of ['gui','linux']) {
   await page.locator('#dc-rib-view').selectOption(mode);
   const remote=page.locator('.dc-routing-rib [data-route-id="customer/customer-3/ipv4/10.64.0.3"]');
   assert.equal(await remote.count(),1);
   assert.match(await remote.textContent(),/VXLAN|vxlan3/);
   assert.match(await remote.textContent(),/br3/);
   const local=page.locator('.dc-routing-rib [data-route-id="customer/customer-1/ipv4/10.64.0.1"]');
   assert.match(await local.textContent(),/tap-c1/);
   await remote.hover();await page.locator('.dc-route-propagation-marker').waitFor();
   await remote.click();await page.locator('#dc-inspector-back').click();
   assert.equal(await page.locator('#dc-rib-view').inputValue(),mode);
  }
  await page.screenshot({path:`/tmp/host-routes-${viewport.width}.png`});
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Host originated-route redistribution in GUI/Linux at both widths: passed');
} finally {await browser.close();}
