import { appendPacketBits } from "./packet-bits.js";
const text = (container, value, className = "") => {
  const p = document.createElement("p"); p.className = className; p.textContent = value; container.append(p);
};
function fields(container, values) {
  const dl = document.createElement("dl"); dl.className = "dc-decoded-fields";
  for (const [label, value] of values) {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = String(value ?? "—"); dl.append(dt, dd);
  }
  container.append(dl);
}

export const explorerMarkup = `
  <details class="dc-explorer" id="dc-explorer" open>
    <summary>Sprawdź przepływ między urządzeniami</summary>
    <div class="dc-explorer-grid">
      <form id="dc-update-form" class="dc-explorer-form">
        <h3>Ogłoszenie trasy · BGP UPDATE</h3>
        <div class="dc-endpoints"><label>Od <select name="from" required></select></label><label>Do <select name="to" required></select></label></div>
        <label>Trasa <select name="route"><option value="">Dobierz zgodną trasę</option></select></label>
        <button class="dc-button secondary" data-explore-submit type="submit">Pokaż przepływ i UPDATE</button>
        <p id="dc-update-status" class="dc-explore-status" role="status">Wybierz końce ogłoszenia. Przepływ korzysta z oczekiwanych eksportów BGP.</p>
      </form>
      <form id="dc-packet-form" class="dc-explorer-form">
        <h3>Droga pakietu · ICMP Echo</h3>
        <div class="dc-endpoints"><label>Od <select name="from" required></select></label><label>Do <select name="to" required></select></label></div>
        <div class="dc-pick-actions"><button type="button" data-pick-endpoint="from" class="dc-button secondary">Kliknij źródło</button><button type="button" data-pick-endpoint="to" class="dc-button secondary">Kliknij cel</button><button type="button" data-pick-endpoint="pair" class="dc-button secondary">Wybierz oba na topologii</button></div>
        <label>Pakiet <select name="family"><option value="ipv4">IPv4 · ICMP</option><option value="ipv6">IPv6 · ICMPv6</option></select></label>
        <button class="dc-button secondary" data-explore-submit type="submit">Pokaż drogę i pakiet</button>
        <p id="dc-packet-status" class="dc-explore-status" role="status">VM klienta → VM w tej samej VPC lub prefiks border; urządzenia i VM infra → underlay.</p>
      </form>
    </div>
  </details>`;

export function appendUpdateInspection(container, flow, model, reasonText, chosenStep = null) {
  if (!flow) { text(container, "Wczytuję oczekiwany przepływ…"); return; }
  if (!flow.reachable) { text(container, `Brak przepływu: ${reasonText(flow.reason)}`, "dc-hidden-note"); return; }
  text(container, `${flow.from_id} → ${flow.to_id} · ${flow.route.prefix} · ${flow.steps.length} eksportów. Oczekiwane ogłoszenia, bez symulacji zbieżności.`);
  for (const [index, update] of flow.steps.entries()) {
    const details = document.createElement("details"); details.className = "dc-interface-details dc-update-step"; details.open = chosenStep === index || (chosenStep === null && index === 0);
    details.dataset.stepIndex = index;
    const summary = document.createElement("summary"); summary.textContent = `${index + 1}. UPDATE · ${update.from_id} → ${update.to_id}`; details.append(summary);
    const session = model.bgp_sessions.find((item) => item.id === update.session_id);
    const from = session?.a.entity_id === update.from_id ? session.a : session?.b;
    const to = session?.a.entity_id === update.to_id ? session.a : session?.b;
    fields(details, [["Typ wiadomości", "BGP UPDATE · ogłoszenie"], ["Transport", `TCP / 179 · ${from?.address ?? update.from_id} → ${to?.address ?? update.to_id}`], ["AFI / SAFI", `${update.afi} / ${update.safi}`], ["NLRI", update.route_type ? `EVPN Type ${update.route_type} · ${update.prefix}` : update.prefix], ["NEXT_HOP", update.next_hop], ["AS_PATH", update.as_path?.join(" ") || "pusty"], ["ORIGIN", ["IGP", "EGP", "INCOMPLETE"][update.origin_code] ?? update.origin_code], ["MED", update.med]]);
    if (update.route_type === 5) fields(details, [["Route Distinguisher", update.rd], ["Route Target", update.route_target], ["VNI / etykieta", update.vni], ["VPC", update.vpc_id], ["MP_REACH_NLRI", `AFI L2VPN · SAFI EVPN · Type 5 · ${update.prefix} · NH ${update.next_hop}`]]);
    text(details, `LOCAL_PREF ${update.local_preference}: lokalna decyzja odbiorcy; nie jest atrybutem przesyłanym przez eBGP. Widok pokazuje pola modelowanego ogłoszenia, nie przechwycony pakiet.`);
    container.append(details);
  }
}

export function appendPacketInspection(container, packet, reasonText, highlightedHop = null) {
  if (!packet) { text(container, "Wczytuję drogę pakietu…"); return; }
  if (!packet.reachable) { text(container, `Brak drogi: ${reasonText(packet.reason)}`, "dc-hidden-note"); return; }
  text(container, `${packet.from_id} → ${packet.to_id} · ${packet.physical_link_ids.length} łączy fabric · ${packet.equal_cost_path_count} ścieżek ECMP · wybrano ${packet.selected_path_index + 1}.`);
  fields(container, [["Pakiet", packet.protocol], ["Wersja / protokół IP", packet.family === "ipv6" ? "6 / 58 (ICMPv6)" : "4 / 1 (ICMP)"], ["IP źródłowy", packet.source], ["IP docelowy", packet.destination], ["TTL / Hop Limit początkowy", packet.ttl], ["ICMP typ / kod", packet.family === "ipv6" ? "128 / 0" : "8 / 0"], ["ICMP identyfikator / sekwencja", "1 / 1"], ["Payload", packet.payload], ["VPC", packet.vpc_id || "underlay"], ["Trasa", packet.route_id || "underlay"]]);
  if (packet.vxlan) {
    text(container, "Enkapsulacja: wewnętrzny IP w Ethernet → VXLAN → UDP → zewnętrzny IPv4.");
    fields(container, [["VTEP źródłowy", packet.outer_source], ["VTEP docelowy", packet.outer_destination], ["UDP źródło / cel", `${packet.udp_source_port} / ${packet.udp_destination_port}`], ["VNI", packet.vni]]);
  } else text(container, packet.physical_link_ids.length ? "Pakiet IP bez VXLAN." : "Dostarczenie lokalne przez TAP; bez ruchu w fabric.");
  text(container, "Nagłówki przykładowego Echo Request. TTL początkowy 64 i payload są poglądowe; adresy, interfejsy i droga pochodzą z konfiguracji.");
  appendPacketBits(container, packet);
  for (const [index, hop] of packet.hops.entries()) {
    const details = document.createElement("details"); details.className = "dc-interface-details dc-packet-hop"; details.open = highlightedHop === index || index === 0;
    details.dataset.hopIndex = index;
    const summary = document.createElement("summary"); summary.textContent = `${index + 1}. ${hop.entity_id} · ${hop.stage}`;
    details.append(summary); fields(details, [["Wejście", hop.ingress || "pakiet lokalny"], ["Wyjście", hop.egress || "odbiorca"], [packet.vxlan && hop.stage.includes("VXLAN") ? "Zewnętrzny Hop Limit" : "TTL / Hop Limit", hop.ttl]]);
    container.append(details);
  }
}
