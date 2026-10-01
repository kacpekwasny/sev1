import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const target=process.env.TOPOLOGY_URL||'http://127.0.0.1:8081/topologie/dc/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const page=await browser.newPage({viewport});const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(target);await page.locator('.dc-node[data-entity-id="host-b1-h1"]').waitFor();
  await page.locator('.dc-node[data-entity-id="host-b1-h1"] .dc-node-label').click();
  await page.locator('#dc-device-actions-close').click();await page.locator('.dc-routing-rib').waitFor();
  const tooltip=page.locator('.dc-address-tooltip:not([hidden])');
  const identity=page.locator('.dc-inspector-list [data-address="10.16.0.1"]');
  await identity.hover();await tooltip.waitFor();assert.match(await tooltip.textContent(),/h1001.*VTEP/s);
  await page.locator('.dc-node[data-entity-id="host-b1-h1"].address-preview').waitFor({state:'attached'});
  await identity.focus();assert.equal(await identity.getAttribute('aria-describedby')!==null,true);
  const remote=page.locator('.dc-routing-rib [data-route-id="vm/customer-3/ipv6/2001:db8:6::3:0:1"]');
  await remote.locator('[data-address="::ffff:10.16.0.17"]').hover();
  assert.match(await tooltip.textContent(),/mapowany na VTEP IPv4.*h2001/s);
  await page.locator('.dc-node[data-entity-id="host-b2-h1"].address-preview').waitFor({state:'attached'});
  await remote.locator('[data-address="2001:db8:6::3:0:1/128"]').hover();
  assert.match(await tooltip.textContent(),/VM klienta 3.*h2001.*VNI 3/s);
  await page.locator('.dc-vm[data-entity-id="customer-3"].address-preview').waitFor({state:'attached'});
  await page.screenshot({path:`/tmp/address-hints-${viewport.width}.png`});
  const box=await tooltip.boundingBox();assert(box.x>=0&&box.x+box.width<=viewport.width&&box.y>=0&&box.y+box.height<=viewport.height);
  await page.locator('#dc-rib-view').selectOption('linux');
  await page.locator('.dc-fib > summary').click();
  const nextHop=page.locator('.dc-fib [data-route-id="default/border-1/ipv4"] [data-address="fe80::2"]').first();
  await nextHop.hover();assert.match(await tooltip.textContent(),/link-local.*ToR.*to-host-b1-h1/s);
  await page.keyboard.press('Escape');assert.equal(await tooltip.count(),0);
  assert.equal(await page.locator('.address-preview').count(),0);
  // Addresses inserted when decoding a bit field receive the same scoped hints.
  await page.locator('.dc-vm[data-entity-id="customer-1"]').click();
  await page.locator('#dc-action-family').selectOption('ipv6');await page.locator('#dc-send-to').click();
  await page.locator('.dc-vm[data-entity-id="customer-3"]').click();
  const source=page.locator('.dc-bit-field[data-layer="Wewnętrzny IP"][data-field="Source Address"]').first();
  await source.click();
  await page.locator('.dc-bit-info [data-address="2001:db8:6::1:0:1"]').hover();
  assert.match(await tooltip.textContent(),/VM klienta 1.*h1001.*VNI 3/s);
  assert.equal(await page.locator('.dc-bit-field[data-layer="Wewnętrzny IP"][data-field="Source Address"].active').count(),4);
  await page.keyboard.press('Escape');assert.equal(await tooltip.count(),0);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Address purpose, ownership, owner highlights and tooltip bounds at both widths: passed');
} finally {await browser.close();}
