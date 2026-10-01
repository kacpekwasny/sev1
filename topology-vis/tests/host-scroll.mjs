import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const target = process.env.TOPOLOGY_URL || 'http://127.0.0.1:8081/topologie/dc/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390]) for (const language of ['pl', 'en']) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${target}?lang=${language}`);
    await page.locator('.dc-node.host').first().waitFor();
    const dimensions = () => page.locator('.dc-node.host > rect').evaluateAll(rects => rects.map(rect => [rect.getAttribute('width'), rect.getAttribute('height')]));
    const initial = await dimensions();
    assert(initial.every(size => JSON.stringify(size) === JSON.stringify(initial[0])));
    for (const id of ['overlay', 'underlay', 'underlay-bgp']) {
      await page.locator(`#dc-preset-${id}`).click();
      assert.deepEqual(await dimensions(), initial, 'RS placement cannot resize any host');
    }
    await page.locator('#dc-config-open').click();
    await page.locator('#dc-count-form [name="hosts_per_rack"]').fill('1');
    await page.locator('#dc-count-form [name="customer_vms"]').fill('32');
    await page.locator('#dc-count-form button').click();
    await page.waitForFunction(() => document.querySelectorAll('.dc-node.host').length === 4);
    await page.locator('#dc-config-close').click();
    assert((await dimensions()).every(size => JSON.stringify(size) === JSON.stringify(initial[0])));
    const scroller = page.locator('.dc-host-vm-scroll').first();
    await scroller.waitFor();
    const hostID = await scroller.getAttribute('data-host-id');
    const vm = scroller.locator('.dc-vm').last();
    const id = await vm.getAttribute('data-entity-id');
    const label = await vm.locator('.dc-vm-label').textContent();
    assert(await scroller.evaluate(el => el.scrollHeight > el.clientHeight));
    await scroller.scrollIntoViewIfNeeded();
    await scroller.hover();
    const graphScroll = await page.locator('#dc-graph').evaluate(el => [el.scrollLeft, el.scrollTop]);
    await page.mouse.wheel(0, 150);
    await page.waitForFunction(id => document.querySelector(`.dc-host-vm-scroll[data-host-id="${id}"]`).scrollTop > 0, hostID);
    assert.deepEqual(await page.locator('#dc-graph').evaluate(el => [el.scrollLeft, el.scrollTop]), graphScroll, 'Wheel scrolling stays inside the host');
    await scroller.focus();
    await scroller.press('End');
    await page.waitForFunction(id => {
      const el = document.querySelector(`.dc-host-vm-scroll[data-host-id="${id}"]`);
      return el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
    }, hostID);
    await vm.click();
    await page.locator('#dc-inspector').waitFor();
    assert((await page.locator('#dc-details h3').innerText()).includes(label));
    await page.locator('#dc-inspector-close').click();
    const saved = await page.locator(`.dc-host-vm-scroll[data-host-id="${hostID}"]`).evaluate(el => el.scrollTop);
    await page.locator('#dc-show-sessions').uncheck();
    assert.equal(await page.locator(`.dc-host-vm-scroll[data-host-id="${hostID}"]`).evaluate(el => el.scrollTop), saved, 'Graph redraw preserves host scroll');
    await page.screenshot({ path: `/tmp/host-scroll-${language}-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${language}/${width}px: fixed equal hosts, wheel/keyboard scroll, offscreen VM selection and retained scroll passed`);
  }
} finally { await browser.close(); }
