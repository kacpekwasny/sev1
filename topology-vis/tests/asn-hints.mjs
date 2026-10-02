import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const target=process.env.TOPOLOGY_URL||'http://127.0.0.1:8081/topologie/dc/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const language of ['pl','en'])for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${target}?lang=${language}`);
    await page.locator('.dc-node[data-entity-id="border-1"]').waitFor();
    const api=new URL(await page.locator('#dc-topology-app').getAttribute('data-api-base'),target).href;
    const model=await (await page.request.get(`${api}/model`)).json();
    const entities=[...model.nodes,...model.vms];
    const tooltip=page.locator('.dc-address-tooltip:not([hidden])');
    const preview=async(element,expectedIDs)=>{
      const asn=Number(await element.getAttribute('data-asn'));
      await element.hover();await tooltip.waitFor();
      assert.match(await tooltip.textContent(),new RegExp(`ASN ${asn}`));
      if(language==='en')assert.match(await tooltip.textContent(),/autonomous system number/);
      const expected=expectedIDs??entities.filter(owner=>owner.asn===asn).map(owner=>owner.id);
      const shown=await page.locator('.address-preview').evaluateAll(elements=>elements.map(element=>element.dataset.entityId).sort());
      assert.deepEqual(shown,expected.sort());
      const box=await tooltip.boundingBox();
      assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=900+1);
      await element.focus();assert(await element.getAttribute('aria-describedby'));
    };
    // AS labels on the diagram participate in the same delegated tooltip behavior.
    await preview(page.locator('.dc-node[data-entity-id="border-1"] [data-asn]'));
    await page.mouse.move(0,0);await page.keyboard.press('Escape');
    assert.equal(await page.locator('.address-preview').count(),0);

    await page.locator('.dc-node[data-entity-id="host-b1-h1"] .dc-node-label').click();
    await page.locator('#dc-device-actions-close').click();
    await page.locator('.dc-routing-rib').waitFor();
    await preview(page.locator('.dc-inspector-list [data-asn="64576"]'));
    await page.screenshot({path:`/tmp/asn-hints-${language}-${width}.png`});
    // GUI path values are individually decorated, while RD/RT stay untouched.
    const guiPaths=page.locator('.dc-rib-family[data-family="l2vpn"] [data-asn]:visible');
    assert(await guiPaths.count()>0);await preview(guiPaths.first());
    assert.equal(await page.locator('[data-asn][data-address]').count(),0);
    const selectedRoute=guiPaths.first().locator('xpath=ancestor::button');
    const routeID=await selectedRoute.getAttribute('data-route-id');
    await selectedRoute.click();
    await page.locator('.dc-details > code').filter({hasText:routeID}).waitFor();
    const routeASNs=page.locator('.dc-details > p [data-asn]');
    assert(await routeASNs.count()>0,'Selecting a BGP route must keep its ASN hints');
    for(const asn of await routeASNs.all())await preview(asn);
    await page.screenshot({path:`/tmp/asn-route-hints-${language}-${width}.png`});
    await page.locator('#dc-inspector-back').click();
    await page.locator('.dc-routing-rib').waitFor();
    await page.locator('#dc-rib-view').selectOption('linux');
    const cliPaths=page.locator('.dc-rib-family[data-family="l2vpn"] [data-as-path]');
    assert(await cliPaths.count()>0);
    const cli=cliPaths.first();
    const candidate=JSON.parse(await cli.locator('..').getAttribute('data-route-candidate'));
    assert.equal(await cli.textContent(),candidate.as_path.join(' '),'FRR output must retain its exact path text');
    await preview(cli.locator('[data-asn]').first());
    // IP lookup still works alongside ASN hints in the same inspector.
    await page.locator('.dc-inspector-list [data-address="10.16.0.1"]').hover();
    assert.match(await tooltip.textContent(),/h1001.*VTEP/s);
    await page.keyboard.press('Escape');assert.equal(await tooltip.count(),0);
    assert.equal(await page.locator('.address-preview').count(),0);

    // Both BGP session endpoint ASNs resolve to their respective devices.
    await page.locator('.dc-node[data-entity-id="host-b1-h1"] .dc-node-label').click();
    await page.locator('#dc-device-actions-close').click();
    const sessions=page.locator('.dc-details [data-session-id]');
    assert(await sessions.count()>0);
    const sessionID=await sessions.first().getAttribute('data-session-id');
    await sessions.first().evaluate(element=>{for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});
    await sessions.first().click();
    const session=model.bgp_sessions.find(item=>item.id===sessionID);
    for(const endpoint of [session.a,session.b])await preview(page.locator(`.dc-details > p [data-asn="${endpoint.asn}"]`));
    await page.keyboard.press('Escape');

    // A clustered RS highlights its aggregate badge, while the tooltip names the real member and host.
    await page.locator('#dc-preset-overlay').click();
    await page.locator('.dc-vm[data-entity-id="rs-ctrl"]').click();
    await page.locator('#dc-device-actions-close').click();
    const member=page.locator('.dc-details [data-asn="64656"]');
    await member.evaluate(element=>{for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});
    await preview(member,['rs-ctrl']);
    assert.match(await tooltip.textContent(),/rsctrl1.*Host h/s);
    await page.keyboard.press('Escape');

    // Decoded UPDATE fields have path context even though their numeric value is separate from its label.
    await page.locator('#dc-explorer > summary').click();
    await page.locator('#dc-update-form [name="from"]').selectOption('host-b1-h1');
    await page.locator('#dc-update-form [name="to"]').selectOption('rs-ctrl-m1');
    await page.locator('#dc-update-form button[type=submit]').click();
    const decoded=page.locator('.dc-update-step[open] [data-as-path] [data-asn]');
    await decoded.first().waitFor();
    await preview(decoded.first());
    await page.keyboard.press('Escape');assert.equal(await tooltip.count(),0);
    assert.deepEqual(errors,[]);
    console.log(`${language} ${width}px: diagram, identities, sessions, GUI/FRR paths, clustered RS, decoded UPDATE, focus and IP regression passed`);
    await page.close();
  }
} finally {await browser.close();}
