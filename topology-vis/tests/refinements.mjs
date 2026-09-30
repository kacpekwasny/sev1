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
  const branches=await page.locator('#dc-details details').evaluateAll(items=>items.every(item=>
    item.children.length===2&&item.firstElementChild.tagName==='SUMMARY'&&item.lastElementChild.classList.contains('dc-disclosure-body')));
  assert.equal(branches,true,'Every disclosure must visibly group its children');
  const handle=page.locator('#dc-inspector-resize');await handle.scrollIntoViewIfNeeded();
  const before=await page.locator('#dc-inspector').boundingBox(),grip=await handle.boundingBox();
  await page.mouse.move(grip.x+grip.width/2,grip.y+grip.height/2);await page.mouse.down();
  await page.mouse.move(grip.x+grip.width/2+(viewport.width>500?80:-30),grip.y+grip.height/2-70,{steps:5});await page.mouse.up();
  const resized=await page.locator('#dc-inspector').boundingBox();
  assert(Math.abs(resized.width-before.width)>20);assert(resized.height<before.height-40);
  await handle.press('Home');
  assert(Math.abs((await page.locator('#dc-inspector').boundingBox()).width-before.width)<2);
  await page.locator('#dc-details summary').filter({hasText:'Sesje BGP ('}).click();
  const session=page.locator('#dc-details [data-session-id]').first();
  const sessionID=await session.getAttribute('data-session-id'),title=await page.locator('#dc-inspector-heading').textContent();
  await session.hover();await page.locator('.dc-session.preview').waitFor();
  assert.equal(await page.locator('.dc-session.preview').getAttribute('data-entity-id'),sessionID);
  assert.equal(await page.locator('#dc-inspector-heading').textContent(),title);
  assert.equal(await page.locator('#dc-show-sessions').isChecked(),false);
  await page.locator('#dc-inspector-grip').hover();
  await page.locator('.dc-session.preview').waitFor({state:'detached'});
  await page.keyboard.press('Escape');
  assert.equal(await (await page.request.get(`${api}/config.yaml`)).text(),yaml);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Topology refinements at desktop and narrow widths: passed');
} finally {await browser.close();}
