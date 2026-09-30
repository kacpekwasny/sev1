// Uses the external Playwright/Chrome setup documented in README.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const target=process.env.TOPOLOGY_URL||'http://127.0.0.1:8081/topologie/dc/';
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  for(const reducedMotion of ['no-preference','reduce']) {
   const page=await browser.newPage({viewport,reducedMotion}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(target);await page.locator('.dc-node').first().waitFor();
   await page.locator('#dc-speed').selectOption('2');
   const position=()=>page.locator('#dc-packet-marker').evaluate(m=>[Number(m.getAttribute('cx')),Number(m.getAttribute('cy'))]);
   for(const id of ['lokalny-host','miedzy-boltami','do-uplinku']) {
    const response=page.waitForResponse(r=>new URL(r.url()).searchParams.get('traffic')===id);
    await page.locator(`[data-traffic-id="${id}"]`).click();
    const {packet}=await (await response).json();
    assert(packet.reachable);
    await page.waitForFunction(()=>document.querySelector('#dc-play').textContent==='Wstrzymaj pakiet');
    assert.equal(await page.locator(`[data-traffic-id="${id}"]`).evaluate(b=>b.classList.contains('active')),true);
    assert.deepEqual(await page.locator('.dc-packet-track').evaluateAll(lines=>lines.map(l=>[l.dataset.from,l.dataset.to])),packet.display_hop_ids.slice(1).map((id,i)=>[packet.display_hop_ids[i],id]));
    const start=await position();
    await page.waitForFunction(([x,y])=>{const m=document.querySelector('#dc-packet-marker');return Math.hypot(Number(m.getAttribute('cx'))-x,Number(m.getAttribute('cy'))-y)>1;},start);
    await page.locator('#dc-play').click();const paused=await position();
    let queries=0;const count=r=>{if(r.url().includes('/explore?'))queries++;};page.on('request',count);
    await page.locator('#dc-inspect-packet').click();
    assert.deepEqual(await position(),paused,'Inspection must retain the paused packet position');
    assert.equal(queries,0,'Inspection must reuse the played packet and its ECMP path');page.off('request',count);
    await page.keyboard.press('Escape');assert.deepEqual(await position(),paused);
    await page.locator('#dc-play').click();
    await page.waitForFunction(()=>document.querySelector('#dc-play').textContent==='Odtwórz pakiet',null,{timeout:10000});
    const end=await page.locator('.dc-packet-track').last().evaluate(l=>[l.x2.baseVal.value,l.y2.baseVal.value]);
    assert.deepEqual(await position(),end,'Playback must finish on the destination link endpoint');
    await page.locator('#dc-inspect-packet').click();assert.deepEqual(await position(),end);
    await page.locator('#dc-rewind').click();
    const origin=await page.locator('.dc-packet-track').first().evaluate(l=>[l.x1.baseVal.value,l.y1.baseVal.value]);
    assert.deepEqual(await position(),origin);await page.keyboard.press('Escape');
   }
   assert.deepEqual(errors,[]);await page.close();
  }
 }
 console.log('Preset TAP/ECMP playback, complete travel, inspection continuity and reduced motion at both widths: passed');
}finally{await browser.close();}
