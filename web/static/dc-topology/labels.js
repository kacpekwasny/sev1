// Canonical IDs stay in datasets/API payloads; presentation uses device slugs.
export function displayNames(value) {
  return String(value).replace(/\bhost-b(\d+)-h(\d+)\b/g,(_,bolt,host)=>`h${bolt}${host.padStart(3,"0")}`);
}
