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
  const model=await (await page.request.get(`${api}/model`)).json();
  assert.equal(model.vms.find(vm=>vm.id==='rs-bolt-b1-m1').label,'rs1001');
  assert.equal(model.vms.find(vm=>vm.id==='rs-ctrl-m4').label,'rsctrl4');
  assert.equal(model.vms.find(vm=>vm.id==='rs-user-m3').label,'rsuser3');
  for(const vm of model.vms.filter(vm=>vm.role==='customer')) {
    const reply=await (await page.request.get(`${api}/explore?kind=update&from=${vm.id}&to=rs-user-m1`)).json();
    assert.equal(reply.update_flow.reachable,true);
    assert.equal(reply.update_flow.steps[0].from_id,vm.id);
    assert.equal(reply.update_flow.steps[0].to_id,'rs-user-m1');
  }
  const {routeFlowStreams}=await page.evaluate(async()=>{
    const {routeFlowStreams}=await import('/static/dc-topology/route-flow.js');
    return {routeFlowStreams:routeFlowStreams(await (await fetch(document.querySelector('#dc-topology-app').dataset.apiBase+'/model')).json())};
  });
  assert(routeFlowStreams.some(stream=>stream.steps[0].fromID==='customer-1'&&stream.steps[0].toID.startsWith('rs-user-')));
  const initial=await page.locator('.dc-node').count();
  assert.equal(await page.locator('#dc-border-option').isHidden(),true);
  await page.locator('#dc-show-underlay').uncheck();
  assert.equal(await page.locator('#dc-border-option').isVisible(),true);
  assert.equal(await page.locator('#dc-keep-borders').isChecked(),true);
  assert.equal(await page.locator('.dc-node.border').count(),model.nodes.filter(n=>n.kind==='border').length);
  assert.equal(await page.locator('.dc-node:not(.host):not(.border)').count(),0);
  await page.locator('#dc-show-sessions').check();
  const borderSessions=model.bgp_sessions.filter(s=>[s.a.entity_id,s.b.entity_id].some(id=>id.startsWith('border-'))&&[s.a.entity_id,s.b.entity_id].some(id=>id.startsWith('rs-ctrl-')));
  assert.equal(borderSessions.length,8);
  for(const session of borderSessions)assert.equal(await page.locator(`.dc-session[data-entity-id="${session.id}"]`).count(),1);
  await page.locator('#dc-keep-borders').uncheck();
  for(const session of borderSessions)assert.equal(await page.locator(`.dc-session[data-entity-id="${session.id}"]`).count(),0);
  assert.equal(await page.locator('.dc-node:not(.host)').count(),0);
  assert.equal(await page.locator('.dc-node.host').count(),8);
  assert.equal(await page.locator('.dc-vm').count(),19);
  assert.equal(await page.locator('.dc-edge').count(),0);
  await page.locator('#dc-show-underlay').check();
  assert.equal(await page.locator('#dc-border-option').isHidden(),true);
  assert.equal(await page.locator('.dc-node').count(),initial);
  await page.locator('#dc-show-underlay').uncheck();
  await page.locator('#dc-keep-borders').check();
  for(const session of borderSessions)assert.equal(await page.locator(`.dc-session[data-entity-id="${session.id}"]`).count(),1);
  await page.locator('#dc-show-underlay').check();
  await page.locator('#dc-show-sessions').uncheck();
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
  await page.mouse.move(grip.x+grip.width/2+(viewport.width>500?-50:-30),grip.y+grip.height/2-70,{steps:5});await page.mouse.up();
  const resized=await page.locator('#dc-inspector').boundingBox();
  assert(Math.abs(resized.width-before.width)>20);assert(resized.height<before.height-40);
  await handle.press('Home');
  assert(Math.abs((await page.locator('#dc-inspector').boundingBox()).width-before.width)<2);
  for(const [edge,dx,dy] of [['e',-24,0],['w',24,0],['n',0,24],['s',0,-24],['nw',24,24]]) {
    const edgeHandle=page.locator(`.dc-popup-edge[data-resize="${edge}"]`);await edgeHandle.scrollIntoViewIfNeeded();
    const start=await page.locator('#dc-inspector').boundingBox(),border=await edgeHandle.boundingBox();
    await page.mouse.move(border.x+border.width/2,border.y+border.height/2);await page.mouse.down();
    await page.mouse.move(border.x+border.width/2+dx,border.y+border.height/2+dy,{steps:4});await page.mouse.up();
    const end=await page.locator('#dc-inspector').boundingBox();
    assert(Math.abs(start.width-end.width-(dx?24:0))<2);
    assert(Math.abs(start.height-end.height-(dy?24:0))<2,JSON.stringify({viewport,edge,start,end}));
    if(edge.includes('w'))assert(Math.abs(start.x+start.width-end.x-end.width)<2,'West resizing keeps the east edge anchored');
    if(edge.includes('n'))assert(Math.abs(start.y+start.height-end.y-end.height)<2,'North resizing keeps the south edge anchored');
    await handle.press('Home');
  }
  const touch=await page.context().newCDPSession(page);
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const touchStart=await page.locator('#dc-inspector').boundingBox(),west=await page.locator('.dc-popup-edge[data-resize="w"]').boundingBox();
  const point={x:west.x+west.width/2,y:west.y+west.height/2};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+24,y:point.y}]});
  assert(Math.abs((await page.locator('#dc-inspector').boundingBox()).width-touchStart.width)>20);
  await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert(Math.abs((await page.locator('#dc-inspector').boundingBox()).width-touchStart.width)<2,'Cancelled touch resize restores the original dimensions');
  await touch.send('Emulation.setTouchEmulationEnabled',{enabled:false});await touch.detach();
  await page.locator('#dc-details summary').filter({hasText:'Maszyny wirtualne ('}).click();
  const hostTitle=await page.locator('#dc-inspector-heading').textContent();
  const hostedVMs=model.vms.filter(vm=>vm.host_id==='host-b1-h1');
  for(const onHost of [false,true])for(const grouped of [false,true]) {
    await page.locator('#dc-show-infra-hosts').setChecked(onHost);
    await page.locator('#dc-collapse-rs').setChecked(grouped);
    await page.locator('#dc-graph svg').evaluate(svg=>svg.dataset.hoverCheck='unchanged');
    for(const vm of hostedVMs) {
      const row=page.locator(`#dc-details [data-vm-id="${vm.id}"]`);
      await row.hover();
      const badge=page.locator('.dc-vm.preview');await badge.waitFor();
      assert.equal(await badge.count(),1,'Only the hovered VM projection is highlighted');
      assert.equal(await badge.getAttribute('data-entity-id'),grouped&&vm.role!=='customer'?vm.cluster_id:vm.id);
      assert.equal(await page.locator('#dc-inspector-heading').textContent(),hostTitle);
      assert.equal(await page.locator('#dc-graph svg').getAttribute('data-hover-check'),'unchanged','Hover must preserve the graph and running playback');
    }
    await page.locator('#dc-inspector-grip').hover();
    await page.locator('.dc-vm.preview').waitFor({state:'detached'});
    const row=page.locator(`#dc-details [data-vm-id="${hostedVMs[0].id}"]`);
    await row.focus();await page.locator('.dc-vm.preview').waitFor();
    await row.press('Tab');await page.locator('.dc-vm.preview').waitFor();
    await page.locator('#dc-details summary').filter({hasText:'Maszyny wirtualne ('}).focus();
    await page.locator('.dc-vm.preview').waitFor({state:'detached'});
  }
  await page.locator('#dc-show-infra-hosts').check();
  await page.locator('#dc-collapse-rs').uncheck();
  await page.locator('#dc-details summary').filter({hasText:'Maszyny wirtualne ('}).click();
  await page.locator('#dc-details summary').filter({hasText:'Sesje BGP ('}).click();
  const session=page.locator('#dc-details [data-session-id]').first();
  const sessionID=await session.getAttribute('data-session-id'),title=await page.locator('#dc-inspector-heading').textContent();
  await session.hover();await page.locator('.dc-session.preview').waitFor();
  assert.equal(await page.locator('.dc-session.preview').getAttribute('data-entity-id'),sessionID);
  assert.equal(await page.locator('#dc-inspector-heading').textContent(),title);
  assert.equal(await page.locator('#dc-show-sessions').isChecked(),false);
  await page.locator('#dc-inspector-grip').hover();
  await page.locator('.dc-session.preview').waitFor({state:'detached'});
  for(const mode of ['gui','linux']) {
    await page.locator('#dc-rib-view').selectOption(mode);
    assert.doesNotMatch(await page.locator('#dc-details').textContent(),/host-b\d+-h\d+/);
    assert.match(await page.locator('#dc-details').textContent(),/h1001/);
  }
  assert.doesNotMatch(await page.locator('#dc-packet-form select[name="from"]').textContent(),/host-b\d+-h\d+/);
  await page.locator('#dc-rib-view').selectOption('gui');
  await page.locator('.dc-border-routes > summary').click();
  assert((await page.locator('.dc-border-routes .dc-route-row').count())>=4);
  assert.match(await page.locator('.dc-border-routes').textContent(),/statyczn/);
  for(const family of ['ipv4','ipv6']) {
    const packet=await (await page.request.get(`${api}/explore?kind=packet&from=customer-1&to=border-2&family=${family}`)).json();
    assert.equal(packet.packet.reachable,true);
  }
  await page.keyboard.press('Escape');
  await page.locator('.dc-vm[data-entity-id="customer-1"]').click();
  await page.locator('#dc-send-to').click();
  await page.locator('.dc-vm[data-entity-id="customer-3"]').click();
  await page.waitForFunction(()=>!document.querySelector('#dc-packet-form button[type=submit]').disabled);
  assert.equal(await page.locator('#dc-play').textContent(),'Wstrzymaj pakiet','Send traffic should start the packet');
  await page.locator('#dc-play').click();await page.locator('#dc-rewind').click();
  await page.keyboard.press('Escape');
  const onYellow=()=>page.evaluate(()=>{
    const m=document.querySelector('#dc-packet-marker'),x=Number(m.getAttribute('cx')),y=Number(m.getAttribute('cy'));
    return [...document.querySelectorAll('.dc-packet-track, .dc-packet-internal-track')].some(l=>{
      const a=l.x1.baseVal.value,b=l.y1.baseVal.value,c=l.x2.baseVal.value,d=l.y2.baseVal.value;
      const t=Math.max(0,Math.min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2||1)));
      return Math.hypot(x-a-t*(c-a),y-b-t*(d-b))<.01;
    });
  });
  assert.equal(await onYellow(),true);
  const start=await page.locator('#dc-packet-marker').evaluate(m=>[Number(m.getAttribute('cx')),Number(m.getAttribute('cy'))]);
  await page.locator('#dc-play').click();
  await page.waitForFunction(([x,y])=>{
    const m=document.querySelector('#dc-packet-marker');return Math.hypot(Number(m.getAttribute('cx'))-x,Number(m.getAttribute('cy'))-y)>1;
  },start);
  assert.equal(await onYellow(),true);
  await page.locator('#dc-play').click();
  assert.match(await page.locator('.dc-vm[data-entity-id="rs-ctrl-m4"]').textContent(),/rsctrl4/);
  await page.locator('.dc-vm[data-entity-id="rs-ctrl-m4"]').click();
  assert.match(await page.locator('#dc-inspector-heading').textContent(),/rsctrl4/);
  assert.doesNotMatch(await page.locator('#dc-details').textContent(),/rs-(ctrl|user)-m\d+/);
  assert.equal(await (await page.request.get(`${api}/config.yaml`)).text(),yaml);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Topology refinements at desktop and narrow widths: passed');
} finally {await browser.close();}
