// YAML IPv6 schemes survive UI load, validation, count rebuild and export.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const target=process.env.TOPOLOGY_URL||'http://127.0.0.1:8081/topologie/dc/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(target);await page.locator('.dc-node[data-entity-id="border-1"]').waitFor();
  const api=new URL(await page.locator('#dc-topology-app').getAttribute('data-api-base'),target).href;
  const get=async path=>context.request.get(`${api}/${path}`);
  const base=await (await get('config.yaml')).text();
  const custom=base.replaceAll('2001:db8:', 'fd42:1234:').replace(/suffix: 1\b/,'suffix: 42');
  await page.locator('#dc-config-open').click();
  assert.match(await page.locator('.dc-config-help').textContent(),/addressing.ipv6/);
  await page.locator('#dc-editor').fill(custom);
  await page.locator('#dc-config-form button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('#dc-config-form button[type="submit"]').disabled&&document.querySelector('#dc-editor').value.includes('fd42:1234:'));
  assert.equal(await page.locator('#dc-config-message.error').count(),0);
  const model=await (await get('model')).json();
  assert(model.nodes.every(node=>node.ipv6.startsWith('fd42:1234:')&&node.ipv6.endsWith(':2a')));
  assert(model.vms.every(vm=>vm.ipv6.startsWith('fd42:1234:')&&vm.ipv6.endsWith(':2a')));
  assert(model.interfaces.every(iface=>iface.link_local_ipv6.startsWith('fe80:')&&!iface.ipv4_address&&!iface.ipv6_address&&!iface.ipv4_prefix&&!iface.ipv6_prefix));
  assert(model.physical_links.every(link=>link.unnumbered));
  const physical=model.bgp_sessions.filter(session=>session.kind==='fabric'||session.kind==='host-tor');
  assert.equal(physical.length,model.physical_links.length);
  assert(physical.every(session=>[session.a,session.b].every(endpoint=>endpoint.address.startsWith('fe80:')&&endpoint.interface_id)));
  const exported=await (await get('config.yaml')).text();
  assert(exported.includes('customer_prefix: fd42:1234:6::/48'));assert(exported.includes('suffix: 42'));
  await page.locator('#dc-editor').fill(exported.replace('fd42:1234:1::/48','fd42:1234:2::/48'));
  await page.locator('#dc-config-form button[type="submit"]').click();
  await page.locator('#dc-config-message.error').waitFor();
  assert.match(await page.locator('#dc-config-message').textContent(),/addressing.ipv6.host_prefix/);
  assert.equal(await (await get('config.yaml')).text(),exported);
  await page.locator('#dc-editor').fill(exported);
  await page.locator('[name="spines"]').fill('5');
  await page.locator('#dc-count-form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.dc-node.spine').length===5);
  await page.waitForFunction(()=>!document.querySelector('#dc-reset').disabled);
  const rebuilt=await (await get('config.yaml')).text();
  assert(rebuilt.includes('host_prefix: fd42:1234:2::/48'));assert(rebuilt.includes('suffix: 42'));
  await page.locator('#dc-config-close').click();
  await page.locator('.dc-node[data-entity-id="host-b1-h1"] .dc-node-label').click();
  await page.locator('#dc-device-actions-close').click();
  await page.locator('.dc-fib').waitFor({state:'attached'});
  await page.locator('.dc-fib > summary').click();await page.locator('#dc-rib-view').selectOption('linux');
  assert.match(await page.locator('.dc-fib').textContent(),/fd42:1234:6::3:0:2a\/128 via ::ffff:10\.16\.0\.17 dev br3/);
  assert.match(await page.locator('.dc-fib').textContent(),/via inet6 fe80::\w+ dev to-tor-/);
  await page.screenshot({path:`/tmp/addressing-${viewport.width}.png`});
  await page.keyboard.press('Escape');
  await page.locator('#dc-config-open').click();await page.locator('#dc-reset').click();
  await page.waitForFunction(()=>document.querySelectorAll('.dc-node.spine').length===4);
  await page.waitForFunction(()=>!document.querySelector('#dc-reset').disabled);
  assert.equal(await (await get('config.yaml')).text(),base);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('YAML IPv6 schemes and link-local fabric at desktop/narrow widths: passed');
} finally {await browser.close();}
