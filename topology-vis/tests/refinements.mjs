// Use the external Playwright setup documented in README; no frontend build.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const target=process.env.TOPOLOGY_URL||'http://127.0.0.1:8081/topologie/dc/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const page=await browser.newPage({viewport});const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(target);await page.locator('.dc-node').first().waitFor();
  const api=new URL(await page.locator('#dc-topology-app').getAttribute('data-api-base'),target).href;
  const yaml=await (await page.request.get(`${api}/config.yaml`)).text();
  const initial=await page.locator('.dc-node').count();
  await page.locator('#dc-show-underlay').uncheck();
  assert.equal(await page.locator('.dc-node:not(.host)').count(),0);
  assert.equal(await page.locator('.dc-node.host').count(),8);
  assert.equal(await page.locator('.dc-vm').count(),19);
  assert.equal(await page.locator('.dc-edge').count(),0);
  await page.locator('#dc-show-underlay').check();
  assert.equal(await page.locator('.dc-node').count(),initial);
  await page.locator('.dc-node[data-entity-id="host-b1-h1"] .dc-node-label').click();
  assert.equal(await page.locator('#dc-device-actions').isVisible(),true);
  await page.locator('#dc-action-family').selectOption('ipv6');
  assert.equal(await page.locator('#dc-device-actions').isVisible(),true);
  await page.locator('#dc-inspector-grip').click();
  assert.equal(await page.locator('#dc-device-actions').isHidden(),true);
  await page.keyboard.press('Escape');
  assert.equal(await (await page.request.get(`${api}/config.yaml`)).text(),yaml);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Topology refinements at desktop and narrow widths: passed');
} finally {await browser.close();}
