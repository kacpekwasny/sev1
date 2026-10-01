// Source-language keys keep Polish readable. Tagged templates retain values
// (addresses, IDs, counts) while translations may reorder their placeholders.
export function createTranslator(catalog = {}) {
  return (source, ...values) => {
    const key = typeof source === 'string' ? source : source.reduce((key, part, i) => key + (i ? `{${i - 1}}` : '') + part, '');
    const translated = catalog[key] ?? key;
    return translated.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
  };
}

let catalog = {};
if (globalThis.document?.documentElement.lang === 'en') {
  const response = await fetch('/static/i18n/en.json');
  if (response.ok) catalog = await response.json();
}
export const t = createTranslator(catalog);
