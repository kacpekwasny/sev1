// Use a disposable local server: these checks change its in-memory live state.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const base = new URL(process.env.SEV1_URL || 'http://127.0.0.1:8081/');
assert(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname));
const output = process.env.QA_OUTPUT || '/tmp/sev1-site-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1280, 390]) {
    const run = Date.now().toString().slice(-6);
    const authorNick = `QA author ${width} ${run}`;
    const contexts = await Promise.all([1, 2, 3].map(() => browser.newContext({ viewport: { width, height: 900 } })));
    const [panel, author, audience] = await Promise.all(contexts.map(context => context.newPage()));
    const errors = [];
    for (const page of [panel, author, audience]) page.on('pageerror', error => errors.push(error.message));
    const waitText = (page, selector, text) => page.locator(selector).filter({ hasText: text }).waitFor();
    const settled = page => page.waitForFunction(() => !document.querySelector('.htmx-request, .htmx-swapping, .htmx-settling'));
    await panel.goto(new URL('/panel?token=sev1&lang=en', base).href);
    await author.goto(new URL('/live/?lang=pl', base).href);
    await audience.goto(new URL('/live/?lang=en', base).href);
    if (await panel.locator('[hx-post="/panel/nazywo"][hx-vals*="nie"]').count()) {
      await panel.locator('[hx-post="/panel/nazywo"]').click();
      await panel.locator('[hx-post="/panel/nazywo"][hx-vals*="tak"]').waitFor();
      await settled(panel);
    }
    await panel.locator('[hx-post="/panel/nazywo"]').click();
    await panel.locator('[hx-post="/panel/nazywo"][hx-vals*="nie"]').waitFor();
    await settled(panel);
    await author.locator('#ask textarea').waitFor();
    await audience.locator('#ask textarea').waitFor();
    for (const [page, nick] of [[author, authorNick], [audience, `QA reader ${width} ${run}`]]) {
      await page.locator('#nick').fill(nick);
      await page.locator('#whoami button').click();
      await page.locator('#whoami .sent').waitFor();
    }
    await panel.locator('.polllist button').first().click();
    await panel.locator('.panel-buttons [hx-vals*="reset"]').click();
    await author.locator('#vote .option').first().waitFor();
    await audience.locator('#vote .option').first().waitFor();
    assert.notEqual(await author.locator('#vote h2').innerText(), await audience.locator('#vote h2').innerText());
    await author.locator('#vote .option').first().click();
    await waitText(panel, '#results', /votes: 1/);
    await audience.locator('#vote .option').last().click();
    await waitText(panel, '#results', /votes: 2/);
    await panel.locator('.panel-buttons [hx-vals*="close"]').click();
    await waitText(audience, '#vote', 'Voting closed.');
    await settled(panel);
    await panel.locator('.panel-buttons [hx-vals*="show"]').click();
    await audience.locator('#vote .option').first().waitFor();

    const question = `QA ${width} ${run}: <script>window.qaInjected=true</script> routing?`;
    await author.locator('#ask textarea').fill(question);
    await author.locator('#ask button').click();
    await waitText(audience, '#questions .qtext', question);
    assert.equal(await audience.evaluate(() => window.qaInjected), undefined);
    const questionIn = page => page.locator('#questions > ul > li').filter({ hasText: question });
    assert.equal(await questionIn(audience).locator('.owner-actions').count(), 0);
    await questionIn(audience).locator('[hx-get*="pytanie="]').click();
    await audience.locator('#answer-box textarea').fill('QA answer draft');
    await audience.locator('#ask textarea').fill('QA question draft');
    await audience.locator('#nick').fill('QA nickname draft');
    await questionIn(author).locator(':scope > .upvote').click();
    await author.locator('#mood button').first().click();
    await waitText(panel, '#panel-mood', /1/);
    await questionIn(audience).locator(':scope > .upvote').filter({ hasText: /1/ }).waitFor();
    assert.equal(await audience.locator('#answer-box textarea').inputValue(), 'QA answer draft');
    assert.equal(await audience.locator('#ask textarea').inputValue(), 'QA question draft');
    assert.equal(await audience.locator('#nick').inputValue(), 'QA nickname draft');
    await audience.locator('#answer-box button[type="submit"]').click();
    await questionIn(author).locator('.answers').filter({ hasText: 'QA answer draft' }).waitFor();
    await questionIn(author).locator('.answers .upvote').click();
    await questionIn(audience).locator('.answers .upvote').filter({ hasText: /1/ }).waitFor();
    await questionIn(author).locator('.owner-actions [hx-post$="odpowiedziane"]').click();
    await questionIn(audience).locator('.chip.done').waitFor();

    // Writing restrictions leave votes enabled. Shadow visibility remains viewer-specific.
    await panel.locator('#panel-moderation [name="locked"]').click();
    await audience.locator('#ask .warn').waitFor();
    await settled(panel);
    assert.equal(await audience.locator('#ask textarea').count(), 0);
    await audience.locator('#vote .option').first().click();
    await audience.locator('#vote .option.chosen').first().waitFor();
    await panel.locator('#panel-moderation [name="locked"]').click();
    await author.locator('#ask textarea').waitFor();
    const person = panel.locator('#panel-moderation tbody tr').filter({ hasText: authorNick });
    await person.locator('[hx-post$="/cien"]').click();
    await person.locator('[hx-post$="/pokaz"]').waitFor();
    await author.locator('#questions .qtext').filter({ hasText: question }).waitFor();
    await audience.locator('#questions .qtext').filter({ hasText: question }).waitFor({ state: 'hidden' });
    await panel.locator('#panel-questions li.shadow').filter({ hasText: question }).waitFor();
    await person.locator('[hx-post$="/pokaz"]').click();
    await waitText(audience, '#questions .qtext', question);
    assert.equal(await audience.locator('.people, .ip, #panel-moderation').count(), 0);

    for (const [page, name] of [[author, 'live-pl'], [audience, 'live-en'], [panel, 'panel-en']]) {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} must fit the viewport`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
    }
    author.once('dialog', dialog => dialog.accept());
    await questionIn(author).locator('.owner-actions [hx-post$="/usun"]').click();
    await audience.locator('#questions .qtext').filter({ hasText: question }).waitFor({ state: 'hidden' });
    await panel.locator('.panel-buttons [hx-vals*="reset"]').click();
    await waitText(audience, '#results', /votes: 0/);
    await settled(panel);
    await panel.locator('.panel-buttons [hx-vals*="hide"]').click();
    await audience.locator('#vote .waiting').waitFor();
    await panel.locator('[hx-post="/panel/nazywo"]').click();
    await audience.locator('#ask .warn').waitFor();
    assert.deepEqual(errors, []);
    await Promise.all(contexts.map(context => context.close()));
    console.log(`Live audience/presenter QA passed at ${width}px (Polish + English, SSE drafts, moderation, voting).`);
  }
} finally { await browser.close(); }
