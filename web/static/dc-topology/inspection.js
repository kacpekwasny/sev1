import { t } from "../i18n.js";
import { appendPacketBits } from "./packet-bits.js";
const text = (container, value, className = "") => {
  const p = document.createElement("p"); p.className = className; p.textContent = value; container.append(p);
};
function fields(container, values) {
  const dl = document.createElement("dl"); dl.className = "dc-decoded-fields";
  for (const [label, value] of values) {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = String(value ?? "—"); dl.append(dt, dd);
    if(label==='AS_PATH')dd.dataset.asPath='';
  }
  container.append(dl);
}

export const explorerMarkup = `
  <details class="dc-explorer" id="dc-explorer">
    <summary>${t("Zaawansowane: UPDATE i wybór końców pakietu")}</summary>
    <div class="dc-explorer-grid">
      <form id="dc-update-form" class="dc-explorer-form">
        <h3>${t("Ogłoszenie trasy · BGP UPDATE")}</h3>
        <div class="dc-endpoints"><label>${t("Od")} <select name="from" required></select></label><label>${t("Do")} <select name="to" required></select></label></div>
        <label>${t("Trasa")} <select name="route"><option value="">${t("Dobierz zgodną trasę")}</option></select></label>
        <button class="dc-button secondary" data-explore-submit type="submit">${t("Pokaż przepływ i UPDATE")}</button>
        <p id="dc-update-status" class="dc-explore-status" role="status">${t("Wybierz końce ogłoszenia. Przepływ korzysta z oczekiwanych eksportów BGP.")}</p>
      </form>
      <form id="dc-packet-form" class="dc-explorer-form">
        <h3>${t("Droga pakietu · ICMP Echo")}</h3>
        <div class="dc-endpoints"><label>${t("Od")} <select name="from" required></select></label><label>${t("Do")} <select name="to" required></select></label></div>
        <div class="dc-pick-actions"><button type="button" data-pick-endpoint="from" class="dc-button secondary">${t("Kliknij źródło")}</button><button type="button" data-pick-endpoint="to" class="dc-button secondary">${t("Kliknij cel")}</button><button type="button" data-pick-endpoint="pair" class="dc-button secondary">${t("Wybierz oba na topologii")}</button></div>
        <label>${t("Pakiet")} <select name="family"><option value="ipv4">${t("IPv4 · ICMP")}</option><option value="ipv6">${t("IPv6 · ICMPv6")}</option></select></label>
        <button class="dc-button secondary" data-explore-submit type="submit">${t("Pokaż drogę i pakiet")}</button>
        <p id="dc-packet-status" class="dc-explore-status" role="status">${t("VM klienta → VM w tym samym VRF/VPC lub prefiks border; urządzenia i VM infra → underlay.")}</p>
      </form>
    </div>
  </details>`;

export function appendUpdateInspection(container, flow, model, reasonText, chosenStep = null) {
  if (!flow) { text(container, t("Wczytuję oczekiwany przepływ…")); return; }
  if (!flow.reachable) { text(container, t`Brak przepływu: ${reasonText(flow.reason)}`, "dc-hidden-note"); return; }
  text(container, t`${flow.from_id} → ${flow.to_id} · ${flow.route.prefix} · ${flow.steps.length} eksportów. Oczekiwane ogłoszenia, bez symulacji zbieżności.`);
  for (const [index, update] of flow.steps.entries()) {
    const details = document.createElement("details"); details.className = "dc-interface-details dc-update-step"; details.open = chosenStep === index || (chosenStep === null && index === 0);
    details.dataset.stepIndex = index;
    const summary = document.createElement("summary"); summary.textContent = t`${index + 1}. UPDATE · ${update.from_id} → ${update.to_id}`; details.append(summary);
    const session = model.bgp_sessions.find((item) => item.id === update.session_id);
    const from = session?.a.entity_id === update.from_id ? session.a : session?.b;
    const to = session?.a.entity_id === update.to_id ? session.a : session?.b;
    fields(details, [[t("Typ wiadomości"), t("BGP UPDATE · ogłoszenie")], ["Transport", t`TCP / 179 · ${from?.address ?? update.from_id} → ${to?.address ?? update.to_id}`], [t("AFI / SAFI"), `${update.afi} / ${update.safi}`], ["NLRI", update.route_type ? t`EVPN Type ${update.route_type} · ${update.prefix}` : update.prefix], ["NEXT_HOP", update.next_hop], ["AS_PATH", update.as_path?.join(" ") || t("pusty")], ["ORIGIN", ["IGP", "EGP", "INCOMPLETE"][update.origin_code] ?? update.origin_code], ["MED", update.med]]);
    if (update.route_type === 5) fields(details, [[t("Route Distinguisher"), update.rd], [t("Route Target"), update.route_target], [t("VNI / etykieta"), update.vni], ["VPC", update.vpc_id], ["MP_REACH_NLRI", t`AFI L2VPN · SAFI EVPN · Type 5 · ${update.prefix} · NH ${update.next_hop}`]]);
    text(details, t`LOCAL_PREF ${update.local_preference}: lokalna decyzja odbiorcy; nie jest atrybutem przesyłanym przez eBGP. Widok pokazuje pola modelowanego ogłoszenia, nie przechwycony pakiet.`);
    container.append(details);
  }
}

export function appendPacketInspection(container, packet, reasonText, highlightedHop = null) {
  if (!packet) { text(container, t("Wczytuję drogę pakietu…")); return; }
  if (!packet.reachable) { text(container, t`Brak drogi: ${reasonText(packet.reason)}`, "dc-hidden-note"); return; }
  text(container, t`${packet.from_id} → ${packet.to_id} · ${packet.physical_link_ids.length} łączy fabric · ${packet.equal_cost_path_count} ścieżek ECMP · wybrano ${packet.selected_path_index + 1}.`);
  fields(container, [[t("Pakiet"), packet.protocol], [t("Wersja / protokół IP"), packet.family === "ipv6" ? t("6 / 58 (ICMPv6)") : t("4 / 1 (ICMP)")], [t("IP źródłowy"), packet.source], [t("IP docelowy"), packet.destination], [t("TTL / Hop Limit początkowy"), packet.ttl], [t("ICMP typ / kod"), packet.family === "ipv6" ? "128 / 0" : "8 / 0"], [t("ICMP identyfikator / sekwencja"), "1 / 1"], ["Payload", packet.payload], ["VPC", packet.vpc_id || (packet.vni===3?t("default/public VRF (VNI 3)"):"underlay")], [t("Trasa"), packet.route_id || "underlay"]]);
  if (packet.vxlan) {
    text(container, t("Enkapsulacja: wewnętrzny IP w Ethernet → VXLAN → UDP → zewnętrzny IPv4."));
    fields(container, [[t("VTEP źródłowy"), packet.outer_source], [t("VTEP docelowy"), packet.outer_destination], [t("UDP źródło / cel"), `${packet.udp_source_port} / ${packet.udp_destination_port}`], ["VNI", packet.vni]]);
  } else text(container, packet.physical_link_ids.length ? t("Pakiet IP bez VXLAN.") : t("Dostarczenie lokalne przez TAP; bez ruchu w fabric."));
  text(container, t("Nagłówki przykładowego Echo Request. TTL początkowy 64 i payload są poglądowe; adresy, interfejsy i droga pochodzą z konfiguracji."));
  appendPacketBits(container, packet);
  for (const [index, hop] of packet.hops.entries()) {
    const details = document.createElement("details"); details.className = "dc-interface-details dc-packet-hop"; details.open = highlightedHop === index || index === 0;
    details.dataset.hopIndex = index;
    const summary = document.createElement("summary"); summary.textContent = `${index + 1}. ${hop.entity_id} · ${hop.stage}`;
    details.append(summary); fields(details, [[t("Wejście"), hop.ingress || t("pakiet lokalny")], [t("Wyjście"), hop.egress || t("odbiorca")], [packet.vxlan && hop.stage.includes("VXLAN") ? t("Zewnętrzny Hop Limit") : t("TTL / Hop Limit"), hop.ttl]]);
    container.append(details);
  }
}
