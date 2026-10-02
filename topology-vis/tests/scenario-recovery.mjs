import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

// Exercise the actual page controller with a small app and HTTP boundary.
const source = (await readFile(new URL('../../web/static/dc-topology/dev.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');
const updates = [], calls = [];
let onCommand, expired = false;
const model = { nodes: [{ id: 'default-host' }] };
const root = { dataset: { apiBase: '/api/dc-topology' }, querySelector: () => ({}) };
const context = createContext({
  AbortController, DOMException, URLSearchParams,
  document: { querySelector: () => root }, window: { addEventListener() {} },
  t: text => text, translateRuntime: text => text, localizeResponse: data => data,
  mountTopologyApp: (_, options) => {
    onCommand = options.onCommand;
    return { setState: state => updates.push(state), destroy() {} };
  },
  fetch: async url => {
    calls.push(url);
    const isDetail = /\/(inspector|explore)\?/.test(url);
    return {
      ok: true, status: 200,
      headers: { get: () => expired && isDetail ? 'default' : null },
      text: async () => 'spines: 4',
      json: async () => isDetail ? { ok: true, speaker_table: { speaker_id: 'default-host' } }
        : url.endsWith('/status') ? { ok: true, summary: { physical_devices: 28 } } : model,
    };
  },
});
runInContext(source, context);
const settled = async () => { await runInContext('commandQueue', context); };
onCommand({ type: 'initialize' });
await settled();
assert.equal(updates.find(update => update.model)?.model, model, 'Initialization must load the default');
assert(!updates.some(update => update.error === true));

updates.length = calls.length = 0;
expired = true;
await Promise.all([
  onCommand({ type: 'load_inspector', kind: 'speaker', id: 'old-host', revision: 1 }),
  onCommand({ type: 'explore', kind: 'packet', from: 'old-host', to: 'old-vm', family: 'ipv4', requestID: 1, revision: 1 }),
]);
await settled();
assert.equal(calls.filter(url => url.endsWith('/model')).length, 1, 'Concurrent expired reads must trigger one reload');
assert.equal(updates.filter(update => update.model).length, 1);
assert(!updates.some(update => update.inspectorData || update.explorationData), 'Default tables must not enter an expired diagram');
assert(!updates.some(update => update.error === true), 'Recovery must not show the expired-scenario error');
assert.equal(updates.at(-1).busy, false);

updates.length = 0;
expired = false;
await onCommand({ type: 'load_inspector', kind: 'speaker', id: 'default-host', revision: 2 });
assert.equal(updates[0].inspectorData.id, 'default-host', 'Inspection must work after recovery');

// Recovery can happen again after another expiry; the guard is not sticky.
updates.length = 0;
expired = true;
await onCommand({ type: 'load_inspector', kind: 'speaker', id: 'old-host', revision: 3 });
await settled();
assert.equal(updates.filter(update => update.model).length, 1);
console.log('Default initialization, automatic/coalesced scenario recovery and subsequent inspection: passed');
