// Verify the same expected snapshot in GUI and iproute2-style inspection.
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
  const model=await (await page.request.get(`${api}/model`)).json();
  const vtep=model.nodes.find(node=>node.id==='host-b2-h1').ipv4;
  assert.equal(model.route_state.origins.filter(r=>r.origin_kind==='border-default').length,4);
  assert(model.route_state.origins.filter(r=>r.origin_kind==='underlay'&&r.source_vm_id).every(r=>r.ip_family==='ipv6'));
  await page.locator('.dc-node[data-entity-id="host-b1-h1"] .dc-node-label').click();
  await page.locator('#dc-device-actions-close').click();
  await page.locator('.dc-fib').waitFor({state:'attached'});
  await page.locator('.dc-fib > summary').click();
  assert.equal(await page.locator('.dc-fib [data-fib-group="underlay"]').count(),1);
  assert.equal(await page.locator('.dc-fib [data-fib-group="public"]').count(),1);
  await page.locator('#dc-rib-view').selectOption('linux');
  const fib=page.locator('.dc-fib');
  assert.match(await fib.textContent(),/local 10\.16\.0\.1\/32 dev lo proto kernel scope host/);
  assert.match(await fib.textContent(),/10\.64\.0\.1\/32 dev tap-c1 proto static scope link/);
  assert((await fib.textContent()).includes(`10.64.0.3/32 via ${vtep} dev br3 proto bgp onlink`));
  assert((await fib.textContent()).includes(`2001:db8:6::3:0:1/128 via ::ffff:${vtep} dev br3 proto bgp onlink`));
  assert.match(await fib.textContent(),/nexthop via inet6 fe80::\w+ dev to-tor-[\w-]+ weight 1/);
  assert.equal(await fib.locator('[data-route-id^="default/"]').count(),2);
  const defaults=await fib.locator('[data-route-id^="default/"]').allTextContents();
  assert(defaults.every(line=>line.startsWith('default proto bgp\n')&&line.includes('nexthop via')&&!line.includes('vxlan')));
  assert.match(await fib.textContent(),/bridge fdb show dev vxlan3/);
  assert((await fib.textContent()).includes(`dst ${vtep} self extern_learn`));
  const route=fib.locator('[data-route-id="customer/customer-3/ipv4/10.64.0.3"]').filter({hasText:'proto bgp onlink'});
  await route.hover();await page.locator('.dc-route-propagation-marker').first().waitFor();
  await route.click();assert((await page.locator('.dc-recursive-resolution').textContent()).includes(`VTEP ${vtep}`));
  await page.locator('#dc-inspector-back').click();assert.equal(await page.locator('#dc-rib-view').inputValue(),'linux');
  await page.locator('#dc-rib-view').selectOption('gui');
  const remote=page.locator('.dc-fib [data-route-id="customer/customer-3/ipv4/10.64.0.3"]');
  assert.match(await remote.textContent(),/dev br3.*VXLAN przez vxlan3/);
  await remote.hover();
  await page.screenshot({path:`/tmp/kernel-routes-${viewport.width}.png`});
  await page.keyboard.press('Escape');
  await page.locator('.dc-node[data-entity-id="tor-b1-r1-1"] .dc-node-label').click();
  await page.locator('#dc-device-actions-close').click();await page.locator('.dc-fib').waitFor({state:'attached'});
  await page.locator('.dc-fib > summary').click();await page.locator('#dc-rib-view').selectOption('linux');
  assert.match(await page.locator('.dc-fib').textContent(),/2001:db8:5::1:0:1\/128 proto bgp/);
  assert.doesNotMatch(await page.locator('.dc-fib').textContent(),/10\.64\.0\.[123]\/32/);
  await page.keyboard.press('Escape');
  await page.locator('.dc-node[data-entity-id="border-1"] .dc-node-label').click();
  await page.locator('#dc-device-actions-close').click();
  await page.locator('.dc-originated-routes > summary').click();
  assert.equal(await page.locator('.dc-originated-routes [data-route-id^="default/"]').count(),2);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Resolved kernel routes in GUI/Linux at desktop and narrow widths: passed');
} finally {await browser.close();}
