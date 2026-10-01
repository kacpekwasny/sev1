import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const language = process.argv[2] ?? 'pl';
const catalog = JSON.parse(await readFile(new URL('../../web/static/i18n/en.json', import.meta.url), 'utf8'));
globalThis.document = { documentElement: { lang: language } };
globalThis.fetch = async () => ({ ok: true, json: async () => catalog });
const { layout } = await import('../../web/static/dc-topology/app.js');

function fixture() {
  const topology = { borders: 2, stems: 2, spines: 2, bolts: 2, leaves_per_bolt: 2, racks_per_bolt: 2, hosts_per_rack: 3 };
  const nodes = [], vms = [];
  const add = (id, kind, extra = {}) => nodes.push({ id, kind, ...extra });
  for (const kind of ['border', 'stem', 'spine']) for (let id = 1; id <= 2; id++) add(`${kind}-${id}`, kind, { role_index: id });
  for (let bolt = 1; bolt <= topology.bolts; bolt++) {
    for (let id = 1; id <= topology.leaves_per_bolt; id++) add(`leaf-${bolt}-${id}`, 'leaf', { bolt_id: bolt, role_index: id });
    for (let rack = 1; rack <= topology.racks_per_bolt; rack++) {
      for (let id = 1; id <= 2; id++) add(`tor-${bolt}-${rack}-${id}`, 'tor', { bolt_id: bolt, rack_id: rack, role_index: id, group_id: `rack-${bolt}-${rack}` });
      for (let id = 1; id <= topology.hosts_per_rack; id++) add(`host-${bolt}-${rack}-${id}`, 'host', { bolt_id: bolt, rack_id: rack, host_id: id });
    }
  }
  for (const [role, bolt] of [['rs_bolt', 1], ['rs_bolt', 2], ['rs_ctrl', 1], ['rs_user', 2]]) {
    for (let member = 1; member <= 4; member++) vms.push({ id: `${role}-${bolt}-${member}`, role, served_bolt: bolt,
      member, cluster_id: `${role}-${bolt}`, host_id: `host-${bolt}-1-${member % 3 + 1}` });
  }
  vms.push({ id: 'customer-1', role: 'customer', host_id: 'host-1-1-1' });
  return { config: { topology }, nodes, vms };
}
const model = process.argv[3] ? JSON.parse(await readFile(process.argv[3], 'utf8')) : fixture();
const before = JSON.stringify(model);
let checked = 0;
const anchors = new Map();
for (const showInfraOnHosts of [true, false]) for (const collapseRouteServers of [false, true]) for (const drag of [false, true]) {
  const offsets = new Map();
  if (drag) for (const entity of [...model.nodes, ...model.vms]) offsets.set(entity.id, { x: 1000, y: -1000 });
  const view = layout(model, { showInfraOnHosts, collapseRouteServers, offsets });
  assert.equal(view.nodes.size, model.nodes.length);
  assert.equal(view.entityPoints.size, model.nodes.length + model.vms.length, 'Every VM remains reachable through its projected card');
  assert.equal(view.rsTiers.length, showInfraOnHosts ? 0 : model.config.topology.bolts + 2);
  assert(view.width > 0 && view.height > 0);
  for (const point of view.entityPoints.values()) assert(Number.isFinite(point.x) && Number.isFinite(point.y));
  assert.deepEqual(view.displayItems.flatMap(item => item.members.map(vm => vm.id)).sort(), model.vms.map(vm => vm.id).sort(), 'Grouping must retain every real member');
  for (const item of view.displayItems) {
    const point = view.displayPoints.get(item.id);
    if (item.onHost) {
      const host = view.nodes.get(item.hostID);
      assert(point.x > host.x - host.width / 2 && point.x < host.x + host.width / 2);
      const viewport = view.hostViewports.get(item.hostID);
      const anchor = view.entityPoints.get(item.members[0].id);
      assert(anchor.y >= viewport.y + 12 && anchor.y <= viewport.y + viewport.height - 12, 'Offscreen VM connections remain inside the host viewport');
    } else assert(view.rsTiers.some(tier => point.x > tier.x && point.x < tier.x + tier.width && point.y > tier.y && point.y < tier.y + tier.height));
  }

  const hosts = model.nodes.filter(node => node.kind === 'host').map(node => view.nodes.get(node.id));
  assert.equal(new Set(hosts.map(host => `${host.width}/${host.height}`)).size, 1, 'Every host has identical fixed dimensions');
  // Layer changes must not move or resize hosts or the surrounding map.
  const stable = {
    width: view.width, height: view.height, groups: [...view.groups], rows: view.rowLabels,
    devices: model.nodes.map(node => {
      const point = view.nodes.get(node.id);
      return [node.id, point.x, point.y, point.width, point.height];
    }),
    customers: model.vms.filter(vm => vm.role === 'customer').map(vm => [vm.id, view.entityPoints.get(vm.id)]),
  };
  if (!anchors.has(drag)) anchors.set(drag, stable);
  else assert.deepEqual(stable, anchors.get(drag), 'Presets/grouping must preserve canvas bounds, device anchors and customer positions');
  assert.equal(view.rowLabels.at(-1)[0], language === 'en' ? 'HOSTS' : 'HOSTY');
  if (language === 'en') assert(view.rsTiers.every(tier => !tier.label.includes('klaster')));
  assert.equal(JSON.stringify(model), before, 'View changes cannot mutate model data');
  checked++;
}
console.log(`${language}: ${checked} stable RS placement/grouping/drag combinations passed (${model.nodes.length} devices)`);
