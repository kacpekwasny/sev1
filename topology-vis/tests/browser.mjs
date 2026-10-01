// Optional developer check: uses an externally installed Playwright module and Chrome.
// No frontend package manager or build step is added to the application.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright-core");
const target = process.env.TOPOLOGY_URL || "http://127.0.0.1:8081/topologie/dc/";
const output = process.env.TOPOLOGY_SCREENSHOTS || "/tmp/dc-topology-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
let rejectedConfigReports = 0;
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  if (message.text().includes("400 (Bad Request)")) rejectedConfigReports++;
  else errors.push(message.text());
});
const start = performance.now();
await page.goto(target);
const node = page.locator('[data-entity-type="node"][data-entity-id="border-1"]');
await node.waitFor();
const defaultLoad = performance.now() - start;
const api = new URL(await page.locator("#dc-topology-app").getAttribute("data-api-base") || "/api", target).href;
const getText = async (path) => (await context.request.get(`${api}${path}`)).text();
const getJSON = async (path) => (await context.request.get(`${api}${path}`)).json();
const baseYAML = await getText("/config.yaml");
const baseTable = await getText("/inspector?kind=speaker&id=border-1");
const checkLayout = async (model = null) => {
  model ??= await getJSON("/model");
  const violations = await page.evaluate((model) => {
    const failures = [];
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
    const contains = (outer, inner) => outer && inner && inner.left >= outer.left - .1 && inner.right <= outer.right + .1 && inner.top >= outer.top - .1 && inner.bottom <= outer.bottom + .1;
    const overlaps = (a, b) => a && b && Math.min(a.right, b.right) - Math.max(a.left, b.left) > .1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .1;
    const nodeRect = (id) => rect(`.dc-node[data-entity-id="${id}"] rect`);
    const groupRect = (id) => rect(`.dc-group-box[data-group-id="${id}"]`);
    for (const group of model.groups) {
      const box = groupRect(group.id);
      if (!box) failures.push(`Missing outline: ${group.id}`);
      if (group.parent_id && !contains(groupRect(group.parent_id), box)) failures.push(`Rack escapes bolt: ${group.id}`);
      for (const id of group.node_ids) if (!contains(box, nodeRect(id))) failures.push(`Device escapes group: ${id}`);
      for (const other of model.groups) {
        if (group.id < other.id && group.kind === other.kind && overlaps(box, groupRect(other.id))) failures.push(`Sibling outlines cross: ${group.id}, ${other.id}`);
      }
    }
    const hosts = model.nodes.filter((node) => node.kind === "host");
    for (const host of hosts) {
      for (const other of hosts) if (host.id < other.id && overlaps(nodeRect(host.id), nodeRect(other.id))) failures.push(`Hosts overlap: ${host.id}, ${other.id}`);
    }
    const vms = [...document.querySelectorAll(".dc-vm")];
    const vmRect = vm => {
      const box = vm.querySelector('rect').getBoundingClientRect();
      const scroller = vm.closest('.dc-host-vm-scroll');
      if (!scroller) return box;
      const viewport = scroller.getBoundingClientRect();
      const visible = { left: Math.max(box.left, viewport.left), right: Math.min(box.right, viewport.right),
        top: Math.max(box.top, viewport.top), bottom: Math.min(box.bottom, viewport.bottom) };
      return visible.left < visible.right && visible.top < visible.bottom ? visible : null;
    };
    for (const vm of vms) {
      const box = vmRect(vm);
      if (!box) continue; // Overflow rows are clipped inside the host's scroll region.
      if (vm.dataset.onHost === "true") {
        const host = nodeRect(vm.dataset.hostId);
        const label = rect(`.dc-node[data-entity-id="${vm.dataset.hostId}"] .dc-node-label`);
        if (!contains(host, box) || box.bottom >= label.top) failures.push(`VM must be inside host above its name: ${vm.dataset.entityId}`);
        for (const other of hosts) if (other.id !== vm.dataset.hostId && overlaps(box, nodeRect(other.id))) failures.push(`VM overlaps another host: ${vm.dataset.entityId}`);
      }
      for (const other of vms) if (vm.dataset.entityId < other.dataset.entityId && overlaps(box, vmRect(other))) failures.push(`VM badges overlap: ${vm.dataset.entityId}, ${other.dataset.entityId}`);
    }
    const tiers = [...document.querySelectorAll(".dc-rs-tier")];
    const graph = document.querySelector(".dc-topology-svg").getBoundingClientRect();
    for (const kind of ["border", "stem"]) {
      const devices = model.nodes.filter((node) => node.kind === kind).map((node) => nodeRect(node.id));
      const left = Math.min(...devices.map((box) => box.left)), right = Math.max(...devices.map((box) => box.right));
      if (Math.abs((left + right) / 2 - (graph.left + graph.right) / 2) > .1 || right - left >= graph.width * .5) failures.push(`${kind} must form a compact centered row`);
    }
    for (const tier of tiers) {
      const box = tier.getBoundingClientRect();
      for (const node of model.nodes) if (overlaps(box, nodeRect(node.id))) failures.push(`RS tier covers a device: ${tier.dataset.rsRole}, ${node.id}`);
      for (const group of model.groups) if (overlaps(box, groupRect(group.id))) failures.push(`RS tier crosses fabric outline: ${group.id}`);
      if (tier.dataset.rsRole === "rs_bolt") {
        const leaves = model.nodes.filter((node) => node.kind === "leaf" && node.bolt_id === Number(tier.dataset.servedBolt));
        const bolt = groupRect(`bolt-${tier.dataset.servedBolt}`);
        if (Math.abs((box.left + box.right) / 2 - (bolt.left + bolt.right) / 2) > .1 || leaves.some((node) => box.bottom >= nodeRect(node.id).top)) failures.push("RS Bolt must be centered above its leaves");
      } else if (tier.dataset.rsRole === "rs_ctrl") {
        if (Math.abs((box.left + box.right) / 2 - (graph.left + graph.right) / 2) > .1) failures.push("RS Ctrl must be centered");
      } else {
        const ctrl = rect('.dc-rs-tier[data-rs-role="rs_ctrl"]');
        if (box.left <= (graph.left + graph.right) / 2 || box.bottom >= ctrl.top) failures.push("RS User must be on the top right");
      }
      const members = vms.filter((vm) => vm.dataset.onHost === "false" && vm.classList.contains(tier.dataset.rsRole) && (tier.dataset.rsRole !== "rs_bolt" || model.vms.find((member) => member.id === vm.dataset.entityId || member.cluster_id === vm.dataset.entityId)?.served_bolt === Number(tier.dataset.servedBolt)));
      for (const vm of members) if (!contains(box, vm.querySelector("rect").getBoundingClientRect())) failures.push(`VM escapes RS tier: ${vm.dataset.entityId}`);
    }
    return failures;
  }, model);
  assert.deepEqual(violations, [], "Topology geometry");
};
assert.equal(await page.locator(".dc-node").count(), 28);
assert(await page.locator("#dc-inspector").isHidden());
assert.equal(await page.locator('script[src*="htmx"]').count(), 0);
assert.equal(await page.locator("#dc-show-route-flow").isChecked(), true);
await checkLayout();
await page.screenshot({ path: `${output}/desktop.png`, fullPage: true, animations: "disabled" });

// Hosts retain EVPN independently of tenant FIB import, and expose local TAPs.
const hostWithoutVPC = page.locator('.dc-node[data-entity-id="host-b1-h2"]');
await hostWithoutVPC.locator('.dc-node-label').click();
await page.locator('summary').filter({hasText:'Oczekiwana tablica BGP'}).waitFor();
if (!(await page.locator('summary').filter({hasText:'Oczekiwana tablica BGP'}).evaluate((item)=>item.parentElement.open))) await page.locator('summary').filter({hasText:'Oczekiwana tablica BGP'}).click();
// Border destinations are static, so they no longer add an EVPN advertisement.
assert.match(await page.locator('[data-family="l2vpn"] > summary').textContent(), /6 wybranych/);
await page.locator('summary').filter({hasText:'Interfejsy ('}).click();
assert.match(await page.locator('#dc-details').textContent(), /tap-b1m1/);
await page.locator('#dc-rib-view').selectOption('linux');
assert.match(await page.locator('[data-family="l2vpn"] pre').textContent(), /show bgp l2vpn evpn route type prefix/);
assert.match(await page.locator('[data-family="l2vpn"] pre').textContent(), /Route Distinguisher: 64512:/);
assert.match(await page.locator('#dc-details').textContent(), /ip -4 route show table main/);
await page.screenshot({path:`${output}/host-linux.png`,fullPage:true,animations:'disabled'});
await page.locator('#dc-rib-view').selectOption('gui');
await page.keyboard.press('Escape');

// A delayed result for a previous selection must not replace the current popup.
let release;
const gate = new Promise((resolve) => { release = resolve; });
await page.route("**/inspector?kind=speaker&id=border-1", async (route) => { await gate; await route.continue(); });
await node.click();
await page.locator('[data-entity-type="node"][data-entity-id="stem-1"]').click();
await page.locator("#dc-inspector-heading").filter({ hasText: "Stem" }).waitFor();
const delayed = page.waitForResponse((response) => response.url().endsWith("/inspector?kind=speaker&id=border-1"));
release(); await delayed;
assert.match(await page.locator("#dc-inspector-heading").textContent(), /Stem/);
await page.unroute("**/inspector?kind=speaker&id=border-1");
await page.keyboard.press("Escape");
await node.click();
await page.locator("summary").filter({ hasText: "Oczekiwana tablica BGP" }).waitFor();
await page.screenshot({ path: `${output}/inspector.png`, fullPage: true, animations: "disabled" });
const popupBox = await page.locator("#dc-inspector").boundingBox();
const canvasBox = await page.locator("#dc-graph").boundingBox();
assert(popupBox.x >= canvasBox.x && popupBox.y >= canvasBox.y && popupBox.x + popupBox.width <= canvasBox.x + canvasBox.width + 1);
await page.locator("summary").filter({ hasText: "Oczekiwana tablica BGP" }).click();
assert((await page.locator(".dc-route-row").count()) > 0);
await page.locator(".dc-rib-family .dc-route-row").first().click();
assert.equal(await page.locator("#dc-inspector-heading").textContent(), "Trasa w wybranym RIB");
assert.equal(await page.locator('#dc-details .dc-route-row').count(),0);
assert.match(await page.locator('#dc-details').textContent(),/AS_PATH/);
assert(await page.locator("#dc-play").isDisabled());
await page.keyboard.press("Escape");
assert(await page.locator("#dc-inspector").isHidden());
assert.equal(await page.evaluate(() => document.activeElement.dataset.entityId), "border-1");

// Bound the view offset and verify all connected lines follow it.
const base = await node.getAttribute("transform");
const edge = page.locator(".dc-edge-line").first();
const edgeX = await edge.getAttribute("x1");
const box = await node.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 130, box.y + box.height / 2 + 90, { steps: 10 });
await page.mouse.up();
assert(await page.locator("#dc-inspector").isHidden());
const numbers = (value) => value.match(/[-\d.]+/g).map(Number);
const [ax, ay] = numbers(base), [bx, by] = numbers(await node.getAttribute("transform"));
assert(Math.abs(Math.hypot(bx - ax, by - ay) - 48) < .01);
assert.notEqual(await edge.getAttribute("x1"), edgeX);
await node.press("Home"); assert.equal(await node.getAttribute("transform"), base);
await node.press("ArrowRight");
const moved = await node.getAttribute("transform");
await page.locator("#dc-show-sessions").check();
assert.equal(await node.getAttribute("transform"), moved);
await page.locator("#dc-zoom").fill("120");
assert.equal(await node.getAttribute("transform"), moved);
const cancelBox = await node.boundingBox();
await page.mouse.move(cancelBox.x + 20, cancelBox.y + 20); await page.mouse.down();
await page.mouse.move(cancelBox.x + 60, cancelBox.y + 60, { steps: 5 });
await page.evaluate(() => document.querySelector("#dc-graph").dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true })));
await page.mouse.up(); assert.equal(await node.getAttribute("transform"), moved);
await page.locator("#dc-layout-reset").click(); assert.equal(await node.getAttribute("transform"), base);
await node.click(); await page.locator("#dc-inspector-close").click();

// Decorative route flow is independently switched and never learns routes.
await page.locator("#dc-show-route-flow").check();
assert((await page.locator(".dc-session.illustrative").count()) > 3);
await page.waitForFunction(() => document.querySelector("#dc-route-marker").getAttribute("visibility") === "visible");
assert((await page.locator(".dc-route-marker").count()) > 1);
assert((await page.locator(".dc-route-marker[visibility=visible]").count()) >= 1);
const firstPrefix = await page.locator("#dc-route-marker").getAttribute("data-route-id");
const cy = await page.locator("#dc-route-marker").getAttribute("cy");
await page.waitForFunction((previous) => document.querySelector("#dc-route-marker").getAttribute("cy") !== previous, cy);
await page.waitForFunction((previous) => document.querySelector("#dc-route-marker").dataset.routeId !== previous, firstPrefix, {timeout:12000});
assert((await page.locator(".dc-route-marker[visibility=visible]").count()) >= 1);
for (const collapsed of [true, false]) {
  await page.locator("#dc-collapse-rs").setChecked(collapsed);
  for (const hosted of [true, false]) {
    await page.locator("#dc-show-infra-hosts").setChecked(hosted);
    assert((await page.locator(".dc-session.illustrative").count()) > 3);
    assert((await page.locator(".dc-route-marker[visibility=visible]").count()) >= 1);
    assert.equal(await page.locator(".dc-vm.cluster").count(), collapsed ? 4 : 0);
    await checkLayout();
  }
}
await page.emulateMedia({ reducedMotion: "reduce" });
await page.waitForFunction(() => document.querySelector("#dc-route-marker").getAttribute("visibility") === "hidden");
assert((await page.locator(".dc-session.illustrative").count()) > 3);
await page.emulateMedia({ reducedMotion: "no-preference" });
await page.locator("#dc-show-sessions").uncheck();
assert.equal(await page.locator("#dc-route-marker").getAttribute("visibility"), "hidden");
await page.locator("#dc-show-route-flow").uncheck();
assert.equal(await page.locator(".dc-session.illustrative").count(), 0);
await page.locator("#dc-fit").click();
await page.screenshot({ path: `${output}/abstract.png`, fullPage: true, animations: "disabled" });
await page.locator("#dc-show-infra-hosts").check();
assert.equal(await getText("/config.yaml"), baseYAML);
assert.equal(await getText("/inspector?kind=speaker&id=border-1"), baseTable);

// Configuration rejection is atomic; valid count changes survive export/reload.
await page.locator("#dc-config-open").click();
await page.locator('[name="spines"]').fill("6");
await page.locator("#dc-config-close").click();
await node.click(); await page.locator("#dc-inspector-close").click();
await page.locator("#dc-config-open").click();
assert.equal(await page.locator('[name="spines"]').inputValue(), "6");
await page.locator("#dc-count-form button[type=submit]").click();
await page.waitForFunction(() => document.querySelectorAll(".dc-node.spine").length === 6);
await page.waitForFunction(() => !document.querySelector("#dc-count-form button[type=submit]").disabled);
const changedYAML = await getText("/config.yaml");
assert.match(changedYAML, /spines: 6/);
await page.locator("#dc-editor").fill("schema_version: 99\n");
await page.locator('#dc-config-form button[type="submit"]').click();
await page.locator("#dc-config-message.error").waitFor();
assert.equal(await getText("/config.yaml"), changedYAML);
assert.equal(await page.locator(".dc-node.spine").count(), 6);
await page.locator("#dc-reset").click();
await page.waitForFunction(() => document.querySelectorAll(".dc-node.spine").length === 4);
await page.waitForFunction(() => !document.querySelector("#dc-reset").disabled);
await page.locator('[name="customer_vms"]').fill("0");
await page.locator("#dc-count-form button[type=submit]").click();
await page.waitForFunction(() => document.querySelectorAll(".dc-vm.customer").length === 0);
await page.waitForFunction(() => !document.querySelector("#dc-reset").disabled);
await page.locator("#dc-reset").click();
await page.waitForFunction(() => document.querySelectorAll(".dc-vm.customer").length === 3);
await page.waitForFunction(() => !document.querySelector("#dc-reset").disabled);
await page.locator("#dc-config-close").click();
await page.reload(); await node.waitFor(); assert.equal(await page.locator(".dc-node").count(), 28);

// Verify packet illustration remains separate from route flow.
await page.locator('[data-traffic-id="miedzy-boltami"]').click();
await page.locator("#dc-play").click();
await page.waitForFunction(() => document.querySelector("#dc-packet-marker").getAttribute("visibility") === "visible");
await page.locator("#dc-show-links").uncheck();
assert.equal(await page.locator("#dc-packet-marker").getAttribute("visibility"), "hidden");
await page.locator("#dc-show-links").check(); await page.keyboard.press("Escape");
await page.locator("#dc-fit").click();
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: `${output}/mobile.png`, fullPage: true, animations: "disabled" });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
await node.click(); await page.screenshot({ path: `${output}/mobile-inspector.png`, fullPage: true, animations: "disabled" });
assert(await page.locator("#dc-inspector").isVisible()); await page.keyboard.press("Escape");

// Touch dragging uses the same bound and must not open an inspector.
const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const touchPage = await touchContext.newPage(); touchPage.on("pageerror", (error) => errors.push(error.message));
await touchPage.goto(target);
const touchNode = touchPage.locator('[data-entity-type="node"][data-entity-id="border-1"]'); await touchNode.waitFor();
await touchNode.scrollIntoViewIfNeeded();
const touchBase = await touchNode.getAttribute("transform");
const touchBox = await touchNode.boundingBox();
const cdp = await touchContext.newCDPSession(touchPage);
const tx = touchBox.x + touchBox.width / 2, ty = touchBox.y + touchBox.height / 2;
await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tx, y: ty }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: tx + 25, y: ty + 20 }] });
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
assert.notEqual(await touchNode.getAttribute("transform"), touchBase);
assert(await touchPage.locator("#dc-inspector").isHidden());
await touchContext.close();

// Exercise capped size through YAML, including every selected customer peer.
await page.setViewportSize({ width: 1280, height: 900 });
await page.locator("#dc-config-open").click();
const maximum = baseYAML.replace(/borders: 2/, "borders: 4").replace(/stems: 2/, "stems: 4").replace(/spines: 4/, "spines: 8")
  .replace(/bolts: 2/, "bolts: 4").replace(/leaves_per_bolt: 2/, "leaves_per_bolt: 4").replace(/racks_per_bolt: 2/, "racks_per_bolt: 4")
  .replace(/hosts_per_rack: 2/, "hosts_per_rack: 4").replace(/count: 3/, "count: 64")
  .replace(/rs_user_peers:[\s\S]*?(?=\n    overrides:)/, `rs_user_peers: [${Array.from({ length: 64 }, (_, i) => i + 1).join(", ")}]`);
await page.locator("#dc-editor").fill(maximum);
const maximumStart = performance.now();
await page.locator('#dc-config-form button[type="submit"]').click();
await page.waitForFunction(() => document.querySelectorAll(".dc-node").length === 128, { timeout: 30000 });
const maximumLoad = performance.now() - maximumStart;
await page.waitForFunction(() => !document.querySelector("#dc-reset").disabled);
await page.locator("#dc-config-close").click();
const maximumModel = await getJSON("/model");
assert.equal(maximumModel.bgp_sessions.length, 1040); assert.equal(maximumModel.vms.length, 88);
await page.locator("#dc-show-sessions").check(); assert.equal(await page.locator(".dc-session").count(), 1040);
await checkLayout();
await page.screenshot({ path: `${output}/maximum.png`, fullPage: true, animations: "disabled" });
for (const collapsed of [true, false]) {
  await page.locator("#dc-collapse-rs").setChecked(collapsed);
  for (const hosted of [true, false]) {
    await page.locator("#dc-show-infra-hosts").setChecked(hosted);
    await checkLayout();
  }
}
await page.screenshot({ path: `${output}/maximum-abstract.png`, fullPage: true, animations: "disabled" });
await node.press("ArrowRight"); await node.press("Home");

// Racks stay disjoint at drag limits; a host carries its badges and can move
// back immediately after reaching its cell boundary.
await page.locator("#dc-show-infra-hosts").check();
const host = page.locator('.dc-node.host[data-entity-id="host-b1-h1"]');
const vm = page.locator('.dc-vm.customer[data-host-id="host-b1-h1"]').first();
const hostBefore = numbers(await host.getAttribute("transform"));
const vmBefore = numbers(await vm.getAttribute("transform"));
for (let i = 0; i < 12; i++) await host.press("ArrowRight");
const hostAtLimit = numbers(await host.getAttribute("transform"));
const vmAtLimit = numbers(await vm.getAttribute("transform"));
assert(hostAtLimit[0] > hostBefore[0] && hostAtLimit[0] - hostBefore[0] <= 48);
assert.equal(vmAtLimit[0] - vmBefore[0], hostAtLimit[0] - hostBefore[0]);
await checkLayout(maximumModel);
await host.press("ArrowLeft"); assert(numbers(await host.getAttribute("transform"))[0] < hostAtLimit[0]);
for (const selector of ['.dc-node.host[data-entity-id="host-b1-h1"]', '.dc-node.tor[data-entity-id="tor-b1-r1-1"]', '.dc-node.leaf[data-entity-id="leaf-b1-1"]', '.dc-vm.customer[data-host-id="host-b1-h1"]']) {
  const entity = page.locator(selector).first();
  for (const direction of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) {
    for (let i = 0; i < 9; i++) await entity.press(direction);
    await checkLayout(maximumModel);
  }
  await entity.press("Home");
}

// An unrelated browser still sees the default. The current browser reload keeps its scenario.
const independent = await browser.newContext();
assert.match(await (await independent.request.get(`${api}/config.yaml`)).text(), /spines: 4/);
await independent.close();
await page.reload(); await page.waitForFunction(() => document.querySelectorAll(".dc-node").length === 128);

// Small/mixed fabrics and co-located VM placement reserve the same boundaries.
for (const hostsPerRack of [1, 3]) {
  const small = baseYAML.replace(/borders: 2/, "borders: 4").replace(/bolts: 2/, "bolts: 1").replace(/leaves_per_bolt: 2/, "leaves_per_bolt: 4")
    .replace(/racks_per_bolt: 2/, "racks_per_bolt: 1").replace(/hosts_per_rack: 2/, `hosts_per_rack: ${hostsPerRack}`)
    .replace(/bolt_id: 2/g, "bolt_id: 1").replace(/host_id: 2/g, "host_id: 1");
  const response = await context.request.post(`${api}/config`, { data: small, headers: { "Content-Type": "application/yaml" } });
  assert.equal(response.status(), 200);
  await page.reload(); await node.waitFor();
  const smallModel = await getJSON("/model");
  for (const collapsed of [true, false]) {
    await page.locator("#dc-collapse-rs").setChecked(collapsed);
    for (const hosted of [true, false]) {
      await page.locator("#dc-show-infra-hosts").setChecked(hosted);
      await checkLayout(smallModel);
    }
  }
}

// Teardown must cancel both animation frames and listeners on retained DOM nodes.
await page.evaluate(async () => {
  const { mountTopologyApp } = await import("/static/dc-topology/app.js");
  const model = await (await fetch((document.querySelector("#dc-topology-app").dataset.apiBase || "/api") + "/model")).json();
  const active = new Set();
  const nativeRequest = window.requestAnimationFrame, nativeCancel = window.cancelAnimationFrame;
  window.requestAnimationFrame = (callback) => { const id = nativeRequest((now) => { active.delete(id); callback(now); }); active.add(id); return id; };
  window.cancelAnimationFrame = (id) => { active.delete(id); nativeCancel(id); };
  const container = document.createElement("div"); container.className = "dc-app"; document.body.append(container);
  let commands = 0;
  const hintCount = document.querySelectorAll('.dc-address-tooltip').length;
  const mounted = mountTopologyApp(container, { onCommand: () => { commands++; } }); mounted.setState({ model });
  if (document.querySelectorAll('.dc-address-tooltip').length !== hintCount + 1) throw new Error('Missing instance address tooltip');
  const sessions = container.querySelector("#dc-show-sessions"), flow = container.querySelector("#dc-show-route-flow");
  sessions.checked = true; sessions.dispatchEvent(new Event("change")); flow.checked = true; flow.dispatchEvent(new Event("change"));
  const button = container.querySelector("#dc-reset");
  mounted.destroy(); const after = commands; button.click();
  if (document.querySelectorAll('.dc-address-tooltip').length !== hintCount) throw new Error('Teardown leaked address tooltip');
  if (active.size || commands !== after || container.children.length) throw new Error("Teardown leaked animation, listeners, or DOM");
  container.remove(); window.requestAnimationFrame = nativeRequest; window.cancelAnimationFrame = nativeCancel;
});
assert.equal(rejectedConfigReports, 1, "Only the deliberately invalid YAML request may be rejected");
assert.deepEqual(errors, []);
console.log(JSON.stringify({ browser: await browser.version(), desktop: "1280×900", narrow: "390×844", defaultLoadMs: Math.round(defaultLoad),
  maximumLoadAndCalculationMs: Math.round(maximumLoad), maximum: { devices: 128, cables: 432, vms: 88, sessions: 1040 }, screenshots: output, checks: "passed", errors }, null, 2));
await browser.close();
