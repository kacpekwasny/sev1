import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const source = await readFile(new URL('../../web/static/site.js', import.meta.url), 'utf8');
const listeners = new Map();
const submissions = [];
const select = { value: 'pl', form: { requestSubmit() { submissions.push(select.value); } },
  addEventListener(event, listener) { listeners.set(event, listener); } };
runInNewContext(source, { document: { querySelector: selector => {
  if (selector === '.topbar') return null;
  assert.equal(selector, '.language-switch select'); return select;
} } });
assert.equal(submissions.length, 0, 'Opening a page must not redirect');
for (const value of ['en', 'pl', 'en']) { select.value = value; listeners.get('change')(); }
assert.deepEqual(submissions, ['en', 'pl', 'en'], 'Each selection submits immediately, with no Change click');
runInNewContext(source, { document: { querySelector: () => null } });

const { loadCatalog, createTranslator } = await import('../../web/static/i18n.js');
assert.deepEqual(await loadCatalog('pl', () => { throw new Error('unexpected fetch'); }), {});
for (const fetcher of [
  async () => { throw new Error('network unavailable'); },
  async () => ({ ok: false }),
  async () => ({ ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }),
  ...[null, [], { 'Notatki': 123 }].map(value => async () => ({ ok: true, json: async () => value })),
]) assert.deepEqual(await loadCatalog('en', fetcher), {}, 'Catalog failures cannot disable dependent modules');
const expected = { 'Notatki': 'Notes' };
assert.deepEqual(await loadCatalog('en', async () => ({ ok: true, json: async () => expected })), expected);
// Model a browser with an older catalog cached before the new preset existed.
const freshCatalog = JSON.parse(await readFile(new URL('../../web/static/i18n/en.json', import.meta.url), 'utf8'));
const cachedCatalog = { ...freshCatalog };
delete cachedCatalog['Pokaż underlay BGP'];
const refreshed = await loadCatalog('en', async (_, options) => ({
  ok: true, json: async () => options.cache === 'no-store' ? freshCatalog : cachedCatalog,
}));
assert.equal(createTranslator(refreshed)('Pokaż underlay BGP'), 'Show underlay BGP', 'New preset labels must not use an older cached catalog');

globalThis.document = { documentElement: { lang: 'en' } };
globalThis.fetch = async () => { throw new Error('network unavailable'); };
const offline = await import('../../web/static/i18n.js?catalog-failure');
assert.equal(offline.t('Notatki'), 'Notatki', 'Even failed module initialization leaves a usable translator');
let aborted = false;
assert.deepEqual(await loadCatalog('en', async (_, { signal }) => new Promise((resolve, reject) => {
  signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
})), {});
assert(aborted, 'An unresponsive catalog request must eventually release module initialization');
console.log('Immediate language changes, missing controls, offline/invalid catalogs and request timeout: passed');
