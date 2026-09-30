// Canonical IDs stay in datasets/API payloads; presentation uses device slugs.
export function displayNames(value) {
  return String(value).replace(/\bhost-b(\d+)-h(\d+)\b/g,(_,bolt,host)=>`h${bolt}${host.padStart(3,"0")}`)
    .replace(/\brs-bolt-b(\d+)-m(\d+)\b/g,(_,bolt,member)=>`rs${bolt}${member.padStart(3,"0")}`)
    .replace(/\brs-(ctrl|user)-m(\d+)\b/g,(_,role,member)=>`rs${role}${member}`);
}
