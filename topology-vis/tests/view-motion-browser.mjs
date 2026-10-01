import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const target = process.env.TOPOLOGY_URL || 'http://127.0.0.1:8081/topologie/dc/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390]) for (const language of ['pl', 'en']) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${target}?lang=${language}`);
    await page.locator('.dc-node').first().waitFor();
    const settled = () => page.waitForFunction(() => !document.querySelector('[data-motion-active]'));
    const anchors = () => page.locator('.dc-node.host').evaluateAll(nodes => nodes.map(node => [node.dataset.entityId, node.getAttribute('transform'), node.querySelector('rect').getAttribute('height')]));
    const initial = await anchors();
    await page.locator('#dc-motion-open').click();
    assert.equal(await page.locator('#dc-motion-title').innerText(), language === 'en' ? 'View animations' : 'Animacje widoku');
    await page.locator('#dc-motion-duration').selectOption('800');
    await page.screenshot({ path: `/tmp/view-motion-settings-${language}-${width}.png` });
    await page.locator('#dc-motion-close').click();

    await page.locator('#dc-show-underlay').uncheck();
    assert(await page.locator('.dc-motion-entity[data-motion-type="visibility"]').count() > 0);
    assert.equal(await page.locator('.dc-motion-layer [role], .dc-motion-layer [tabindex], .dc-motion-layer [data-entity-id]').count(), 0, 'Fading copies cannot intercept input or duplicate accessible devices');
    assert.deepEqual(await anchors(), initial);
    await settled();
    await page.locator('#dc-show-underlay').check();
    assert(await page.locator('.dc-node[data-motion-type="visibility"]').count() > 0);
    await settled();

    await page.locator('#dc-show-infra-hosts').uncheck();
    const moving = page.locator('.dc-motion-entity[data-motion-type="placement"]').first();
    await moving.waitFor();
    const first = await moving.getAttribute('transform');
    await page.waitForFunction(before => document.querySelector('.dc-motion-entity[data-motion-type="placement"]')?.getAttribute('transform') !== before, first);
    await page.waitForFunction(() => {
      const progress = Number(document.querySelector('[data-motion-active]')?.dataset.motionProgress);
      return progress > .2 && progress < .75;
    });
    assert.deepEqual(await anchors(), initial);
    await page.screenshot({ path: `/tmp/view-motion-moving-${language}-${width}.png`, fullPage: true });
    await settled();
    assert.equal(await page.locator('.dc-rs-tier').count(), 4);
    await page.locator('#dc-collapse-rs').check();
    assert(await page.locator('.dc-motion-entity[data-motion-type="grouping"]').count() > 4);
    await settled();
    assert.equal(await page.locator('.dc-vm.cluster').count(), 4);
    await page.locator('#dc-collapse-rs').uncheck();
    assert(await page.locator('.dc-motion-entity[data-motion-type="grouping"]').count() > 4);
    await settled();
    await page.locator('#dc-show-infra-hosts').check();
    await moving.waitFor(); await settled();

    // Interrupt transitions repeatedly: only the latest view can leave visual copies.
    for (const checked of [false, true, false, true]) await page.locator('#dc-show-infra-hosts').setChecked(checked);
    await settled();
    assert.equal(await page.locator('.dc-motion-layer').count(), 0);
    assert.equal(await page.locator('.dc-vm[style*="opacity: 0"]').count(), 0);
    assert.deepEqual(await anchors(), initial);
    await page.locator('#dc-motion-open').click();
    for (const key of ['visibility', 'grouping', 'placement']) await page.locator(`#dc-motion-${key}`).uncheck();
    await page.locator('#dc-motion-close').click();
    await page.locator('#dc-preset-overlay').click();
    assert.equal(await page.locator('[data-motion-active]').count(), 0, 'Each effect can be disabled independently');
    await page.locator('#dc-preset-underlay').click();
    await page.locator('#dc-motion-open').click();
    for (const key of ['visibility', 'grouping', 'placement']) await page.locator(`#dc-motion-${key}`).check();
    await page.locator('#dc-motion-enabled').uncheck();
    assert(await page.locator('#dc-motion-duration').isDisabled());
    await page.locator('#dc-motion-close').click();
    await page.reload(); await page.locator('.dc-node').first().waitFor();
    await page.locator('#dc-motion-open').click();
    assert.equal(await page.locator('#dc-motion-enabled').isChecked(), false);
    assert.equal(await page.locator('#dc-motion-duration').inputValue(), '800');
    await page.locator('#dc-motion-enabled').check();
    await page.locator('#dc-motion-close').click();
    await page.locator('#dc-preset-overlay').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await settled();
    await page.locator('#dc-preset-underlay').click();
    assert.equal(await page.locator('[data-motion-active]').count(), 0);
    await page.locator('#dc-motion-open').click();
    assert(await page.locator('#dc-motion-reduced').isVisible());
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${language}/${width}px: appear/disappear, RS movement, merge/split, interruption, preferences and reduced motion passed`);
  }
} finally { await browser.close(); }
