import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../../web/static/i18n/en.json', import.meta.url), 'utf8'));
// Load browser modules as an English page, without a DOM or a frontend build.
globalThis.document = { documentElement: { lang: 'en' } };
globalThis.fetch = async (url, options) => {
  assert.equal(url, '/static/i18n/en.json');
  assert.equal(options.cache, 'no-store');
  return { ok: true, json: async () => catalog };
};
const { t, createTranslator, createRuntimeTranslator, localizeResponse } = await import('../../web/static/i18n.js');
assert.equal(t('Wybierz odpowiedź'), 'Choose an answer');
assert.equal(t('Pokaż fizyczną topologię'), 'Show physical topology');
assert.equal(t('Pokaż underlay BGP'), 'Show underlay BGP');
assert.equal(t`VM klienta ${3}`, 'Customer VM 3');
const custom = createTranslator({ 'Od {0} do {1}': 'To {1} from {0}' });
assert.equal(custom`Od ${'<tag>$&'} do ${'{0}'}`, 'To {0} from <tag>$&');
assert.equal(createTranslator()`Adres ${'2001:db8::1'}`, 'Adres 2001:db8::1', 'Polish remains the default');
assert.equal(t('custom-label'), 'custom-label', 'Custom labels remain literal');
assert.equal(t('constructor'), 'constructor', 'Unknown labels cannot resolve inherited object properties');
for (const [key, value] of Object.entries(catalog)) {
  const placeholders = text => (text.match(/\{\d+\}/g) ?? []).sort();
  assert.deepEqual(placeholders(value), placeholders(key), `Translation must retain every dynamic value: ${key}`);
}
const runtime = createRuntimeTranslator(catalog);
assert.equal(runtime('VM klienta 3 via h1001'), 'Customer VM 3 via h1001');
assert.equal(runtime('wartość musi mieścić się w zakresie 1–16'), 'value must be between 1 and 16');
assert.equal(runtime('topology.spines: wartość musi mieścić się w zakresie 1–16\ncustomer_vms.overrides[0].addresses[1]: niepoprawny adres IPv4/IPv6'),
  'topology.spines: value must be between 1 and 16\ncustomer_vms.overrides[0].addresses[1]: invalid IPv4/IPv6 address');
const data = { id: 'lokalny-host', label: 'VM klienta 3', origin_label: 'VM klienta 1 via h1001',
  message: 'wybierz dwa różne urządzenia lub VM', stage: 'routowanie IP', prefix: '2001:db8:6::3/128',
  reason: 'primary-vm-connectivity-required', received_from: 'host-b1-h1', payload: 'SEV1: sample packet',
  errors: [{ path: 'topology.spines', message: 'wartość musi mieścić się w zakresie 1–16' }],
  config: { traffic: [{ id: 'miedzy-boltami' }], vpcs: [{ name: 'sieć klienta' }] } };
const before = JSON.stringify(data), localized = localizeResponse(data);
assert.equal(localized.label, 'Customer VM 3');
assert.equal(localized.origin_label, 'Customer VM 1 via h1001');
assert.equal(localized.message, 'select two different devices or VMs');
assert.equal(localized.stage, 'IP routing');
assert.equal(localized.errors[0].message, 'value must be between 1 and 16');
for (const key of ['id', 'prefix', 'reason', 'received_from', 'payload', 'config']) assert.deepEqual(localized[key], data[key], `${key} is domain data`);
assert.equal(JSON.stringify(data), before, 'Localizing cannot mutate the API model');

const { explorerMarkup } = await import('../../web/static/dc-topology/inspection.js');
assert.match(explorerMarkup, /Packet path · ICMP Echo/);
assert.match(explorerMarkup, /Choose a compatible route/);
assert.doesNotMatch(explorerMarkup, /[ąćęłńóśźż]/i);
const { addressInventory, explainAddress } = await import('../../web/static/dc-topology/addresses.js');
const inventory = addressInventory({ config: {}, nodes: [{ id: 'host-1', label: 'h1001', kind: 'host', ipv4: '10.16.0.1', ipv6: '2001:db8:2::1' }], vms: [], interfaces: [] });
const hint = explainAddress(inventory, '10.16.0.1');
assert.match(hint.description, /Device address in the underlay/);
assert.deepEqual(hint.ownerIDs, ['host-1']);
const { encodePacket, checksum } = await import('../../web/static/dc-topology/packet-bits.js');
const packet = { from_id: 'customer-1', to_id: 'customer-3', physical_node_ids: ['host-1', 'host-3'], source: '10.64.0.1', destination: '10.64.0.3', payload: 'SEV1: sample packet', ttl: 64,
  vxlan: true, vni: 3, outer_source: '10.16.0.1', outer_destination: '10.16.0.2', udp_source_port: 49152, udp_destination_port: 4789 };
const layers = encodePacket(packet);
assert(layers.some(layer => layer.name === 'Inner IP'));
for (const layer of layers) {
  assert.doesNotMatch(layer.name, /[ąćęłńóśźż]/i);
  for (const field of layer.fields) assert.doesNotMatch(field.description, /[ąćęłńóśźż]/i);
  assert.equal(layer.fields.map(field => field.bits).join(''), [...layer.bytes].map(byte => byte.toString(2).padStart(8, '0')).join(''));
}
assert.equal(checksum(layers.find(layer => layer.name === 'Inner IP').bytes), 0, 'Translations preserve wire checksums');
assert.equal(checksum(layers.find(layer => layer.name === 'Outer IPv4 · VTEP').bytes), 0);
console.log('English UI, reordered placeholders, validation prose, immutable IDs, address hints and packet fields: passed');
