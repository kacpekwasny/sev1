// Run against a disposable local server; this changes the browser’s topology workspace.
// Use the external Playwright setup documented in README; no application dependency.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = new URL(process.env.SEV1_URL || 'http://127.0.0.1:8081/');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Use a disposable local server');
const output = process.env.QA_OUTPUT || '/tmp/sev1-site-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390]) for (const language of ['pl', 'en']) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) errors.push(`${response.status()}: ${response.url()}`); });
    const selectLanguage = async choice => {
      if (await page.locator('#site-language').inputValue() !== choice) {
        await Promise.all([page.waitForNavigation(), page.locator('#site-language').selectOption(choice)]);
      }
      assert.equal(await page.locator('html').getAttribute('lang'), choice);
    };
    await page.goto(new URL('/?qa=1', base).href);
    for (const choice of ['en', 'pl', language]) {
      await selectLanguage(choice);
      assert.equal(new URL(page.url()).searchParams.get('qa'), '1');
    }
    assert.equal(await page.locator('.language-switch button:visible').count(), 0);
    const alignment = await page.locator('.topbar nav').evaluate(nav => {
      const boxes = [...nav.children].filter(el => el.matches('a,form')).map(el => el.getBoundingClientRect());
      return boxes.every(a => boxes.every(b => a.top >= b.bottom || b.top >= a.bottom || Math.abs(a.top + a.height / 2 - b.top - b.height / 2) < 1));
    });
    assert(alignment, 'Header items on each row must be vertically centered');
    await page.screenshot({ path: `${output}/header-${language}-${width}.png`, fullPage: true });

    // Follow every rendered local HTML link, including lecture materials and backlinks.
    const queue = ['/', '/wyklady/', '/live/'], seen = new Set();
    while (queue.length) {
      const path = queue.shift(); if (seen.has(path)) continue; seen.add(path);
      const response = await page.goto(new URL(path, base).href);
      assert.equal(response.status(), 200, path);
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} must fit the viewport`);
      const links = await page.locator('a[href]').evaluateAll(links => links.map(link => link.href));
      for (const href of links) {
        const url = new URL(href);
        if (url.origin === base.origin && !/\/static\/|\/api\/|\/md$|\.zip$|\/language$/.test(url.pathname) && !seen.has(url.pathname)) queue.push(url.pathname);
      }
      if (await page.locator('#graph').count()) await page.waitForFunction(() => /\d+.*\d+/.test(document.querySelector('#graph-hint').textContent));
      while (await page.locator('#hint-slot button').count()) {
        const before = await page.locator('.hint').count();
        await page.locator('#hint-slot button').click();
        await page.waitForFunction(count => document.querySelectorAll('.hint').length > count, before);
        await page.waitForFunction(() => !document.querySelector('.htmx-request, .htmx-swapping, .htmx-settling'));
      }
      if (await page.locator('.topo-views').count()) {
        for (const view of ['adresy', 'routing', 'uproszczone', 'kable']) {
          await page.locator(`.topo-views button[hx-get$="/widok/${view}"]`).click();
          await page.locator(`.topo-views button.on[hx-get$="/widok/${view}"]`).waitFor();
          assert(await page.locator('.topo-svg .node').count() > 0);
        }
      }
    }

    await page.goto(new URL('/topologie/dc/', base).href);
    await page.locator('.dc-node').first().waitFor();
    assert.equal(await page.locator('#dc-preset-underlay-bgp').innerText(), language === 'en' ? 'Show underlay BGP' : 'Pokaż underlay BGP');
    const api = new URL(await page.locator('#dc-topology-app').getAttribute('data-api-base'), base).href;
    const model = await (await context.request.get(`${api}/model`)).json();
    const defaultYAML = await (await context.request.get(`${api}/config.yaml`)).text();
    const nodes = page.locator('.dc-node'), sessions = page.locator('.dc-session'), links = page.locator('.dc-edge');
    await page.locator('#dc-graph').evaluate(graph => { graph.scrollTop = 80; graph.scrollLeft = 40; });
    const frame = () => page.evaluate(() => {
      const bounds = element => { const b = element.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; };
      const graph = document.querySelector('#dc-graph'), svg = graph.querySelector('svg');
      return {
        controls: [...document.querySelectorAll('.dc-toolbar input, .dc-toolbar button')].map(el => [el.id, bounds(el)]),
        viewport: bounds(graph), viewBox: svg.getAttribute('viewBox'), size: [svg.style.width, svg.style.height],
        scroll: [graph.scrollLeft, graph.scrollTop],
        customers: [...graph.querySelectorAll('.dc-vm.customer')].map(el => [el.dataset.entityId, el.getAttribute('transform')]),
      };
    });
    const initialFrame = await frame();
    for (const id of ['underlay', 'overlay', 'underlay-bgp', 'underlay']) {
      await page.locator(`#dc-preset-${id}`).click();
      assert.deepEqual(await frame(), initialFrame, 'Preset changes preserve controls, viewport, zoom, scroll and customer anchors');
    }
    await page.locator('#dc-show-sessions').check();

    for (const [id, locator] of [['dc-show-links', links], ['dc-show-sessions', sessions]]) {
      await page.locator(`#${id}`).uncheck(); assert.equal(await locator.count(), 0);
      await page.locator(`#${id}`).check(); assert(await locator.count() > 0);
    }
    for (const layer of ['underlay', 'overlay']) {
      await page.locator(`#dc-show-${layer}-bgp`).uncheck();
      assert.equal(await page.locator(`.dc-session[data-session-layer="${layer}"]`).count(), 0);
      await page.locator(`#dc-show-${layer}-bgp`).check();
    }
    await page.locator('#dc-show-route-flow').uncheck(); assert(await page.locator('#dc-flow-examples').isHidden());
    await page.locator('#dc-show-route-flow').check(); assert(await page.locator('#dc-flow-examples').isVisible());
    for (const hosted of [false, true]) for (const grouped of [true, false]) {
      await page.locator('#dc-show-infra-hosts').setChecked(hosted);
      await page.locator('#dc-collapse-rs').setChecked(grouped);
      assert.equal(await page.locator('.dc-rs-tier').count(), hosted ? 0 : model.config.topology.bolts + 2);
      assert(await page.locator('.dc-vm').count() > 0);
    }
    await page.locator('#dc-show-underlay').uncheck();
    assert.equal(await page.locator('.dc-node:not(.host):not(.border)').count(), 0);
    await page.locator('#dc-keep-borders').uncheck(); assert.equal(await page.locator('.dc-node.border').count(), 0);
    await page.locator('#dc-keep-borders').check(); assert(await page.locator('.dc-node.border').count() > 0);
    await page.locator('#dc-preset-overlay').click(); assert.equal(await page.locator('#dc-preset-overlay').getAttribute('aria-pressed'), 'true');
    await page.locator('#dc-preset-underlay-bgp').click();
    assert.equal(await page.locator('#dc-preset-underlay-bgp').getAttribute('aria-pressed'), 'true');
    assert.equal(await links.count(), 0);
    assert(await page.locator('.dc-node.spine').count() > 0);
    assert(await page.locator('.dc-session[data-session-layer="underlay"]').count() > 0);
    assert.equal(await page.locator('.dc-session[data-session-layer="overlay"]').count(), 0);
    await page.locator('#dc-preset-underlay').click(); assert.equal(await page.locator('#dc-preset-underlay').getAttribute('aria-pressed'), 'true');
    assert(await links.count() > 0); assert.equal(await sessions.count(), 0);
    await page.locator('#dc-show-sessions').check(); await page.locator('#dc-show-overlay-bgp').check();
    await page.locator('#dc-zoom').fill('135'); assert.equal(await page.locator('#dc-zoom-value').textContent(), '135%');
    await page.locator('#dc-fit').click(); assert.notEqual(await page.locator('#dc-zoom').inputValue(), '135');
    const node = nodes.filter({ has: page.locator('[class="dc-node-label"]') }).first();
    const original = await node.getAttribute('transform');
    await node.press('ArrowRight'); assert.notEqual(await node.getAttribute('transform'), original);
    await page.locator('#dc-layout-reset').click(); assert.equal(await node.getAttribute('transform'), original);

    const host = page.locator('.dc-node.host').first(); await host.locator('.dc-node-label').click();
    if (await page.locator('#dc-device-actions-close').isVisible()) await page.locator('#dc-device-actions-close').click();
    await page.locator('.dc-routing-rib').waitFor({ state: 'attached' });
    await page.locator('#dc-rib-view').selectOption('linux'); assert(await page.locator('#dc-details .dc-terminal').count() > 0);
    await page.locator('#dc-rib-view').selectOption('gui');
    await page.locator('#dc-inspector-close').click(); assert(await page.locator('#dc-inspector').isHidden());
    await links.first().press('Enter'); assert(await page.locator('#dc-inspector').isVisible());
    await page.keyboard.press('Escape');
    await sessions.first().press('Enter'); await page.locator('.dc-session-bootstrap, #dc-details .dc-interface-details').first().waitFor({ state: 'attached' });
    await page.keyboard.press('Escape');
    const flowIDs = await page.locator('[data-traffic-id]').evaluateAll(buttons => buttons.map(button => button.dataset.trafficId));
    for (const id of flowIDs) {
      await page.locator(`[data-traffic-id="${id}"]`).click();
      await page.waitForFunction(() => !document.querySelector('#dc-play').disabled);
      await page.locator('#dc-play').click();
      await page.locator('#dc-speed').selectOption('2'); await page.locator('#dc-rewind').click();
      await page.locator('#dc-inspect-packet').click(); await page.locator('.dc-bit-field').first().click();
      assert(await page.locator('.dc-bit-info').textContent());
      await page.keyboard.press('Escape');
    }
    await page.locator('#dc-explorer > summary').click();
    for (const kind of ['packet', 'update']) {
      const form = page.locator(`#dc-${kind}-form`);
      await form.locator('[name="from"]').selectOption('customer-1');
      await form.locator('[name="to"]').selectOption(kind === 'packet' ? 'customer-3' : 'rs-user-m1');
      if (kind === 'packet') await form.locator('[name="family"]').selectOption('ipv6');
      const reply = page.waitForResponse(response => response.url().includes(`/explore?kind=${kind}`));
      await form.locator('[type="submit"]').click(); assert.equal((await reply).status(), 200);
      await page.keyboard.press('Escape');
    }
    await page.locator('#dc-config-open').click();
    await page.locator('#dc-count-form [name="spines"]').fill('3'); await page.locator('#dc-count-form [type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#dc-editor').value.includes('spines: 3'));
    await page.locator('#dc-editor').fill('invalid: ['); await page.locator('#dc-config-form [type="submit"]').click();
    await page.locator('#dc-config-message.error').waitFor();
    await page.locator('#dc-reset').click();
    await page.waitForFunction(() => !document.querySelector('#dc-config-message').classList.contains('error') && !document.querySelector('#dc-config-form [type="submit"]').disabled);
    const exported = await context.request.get(new URL(await page.locator('#dc-export').getAttribute('href'), base).href);
    assert.equal(exported.status(), 200); assert.match(await exported.text(), /schema_version: 1/);
    await page.locator('#dc-editor').fill(defaultYAML); await page.locator('#dc-config-form [type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#dc-config-form [type="submit"]').disabled);
    await page.locator('#dc-config-close').click();
    await page.screenshot({ path: `${output}/topology-${language}-${width}.png`, fullPage: true });
    assert.deepEqual(errors, [], 'No runtime errors across page navigation and topology interactions');
    console.log(`${language} / ${width}px: ${seen.size} linked pages and topology controls checked`);
    await context.close();
  }
} finally { await browser.close(); }
