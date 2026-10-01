// Source-language keys keep Polish readable. Tagged templates retain values
// (addresses, IDs, counts) while translations may reorder their placeholders.
export function createTranslator(catalog = {}) {
  return (source, ...values) => {
    const key = typeof source === 'string' ? source : source.reduce((key, part, i) => key + (i ? `{${i - 1}}` : '') + part, '');
    const translated = Object.hasOwn(catalog, key) ? catalog[key] : key;
    return translated.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
  };
}

// A catalog failure must not prevent dependent controls or the graph from mounting.
export async function loadCatalog(language, fetchCatalog = globalThis.fetch) {
  if (language !== 'en') return {};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    // New UI keys must use the current catalog, even after a cached site visit.
    const response = await fetchCatalog('/static/i18n/en.json', { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return {};
    const loaded = await response.json();
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded) || Object.values(loaded).some(value => typeof value !== 'string')) return {};
    return loaded;
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

const catalog = await loadCatalog(globalThis.document?.documentElement?.lang);
export const t = createTranslator(catalog);

export function createRuntimeTranslator(catalog = {}) {
  const placeholders = /\{\d+\}/g;
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = Object.entries(catalog)
    .filter(([key, value]) => key !== value && /\{\d+\}/.test(key))
    .sort(([a], [b]) => b.length - a.length || a.localeCompare(b))
    .map(([key, value]) => ({
      match: new RegExp('^' + key.split(placeholders).map(escape).join('([\\s\\S]*?)') + '$'), value,
    }));
  return function translate(source) {
    if (Object.hasOwn(catalog, source)) return catalog[source];
    for (const { match, value } of patterns) {
      const values = source.match(match);
      if (values) return value.replace(placeholders, placeholder => values[Number(placeholder.slice(1, -1)) + 1] ?? placeholder);
    }
    // Validation summaries retain exact YAML field paths while translating prose.
    if (source.includes('\n')) return source.split('\n').map(translate).join('\n');
    const field = source.match(/^([a-z_][\w.[\]]*): (.+)$/);
    if (field) return `${field[1]}: ${translate(field[2])}`;
    return source;
  };
}

export const translateRuntime = createRuntimeTranslator(catalog);
const authoredFields = new Set(['label', 'origin_label', 'destination_label', 'message', 'stage']);
export function localizeResponse(value) {
  if (Array.isArray(value)) return value.map(localizeResponse);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    authoredFields.has(key) && typeof item === 'string' ? translateRuntime(item) : localizeResponse(item),
  ]));
}
