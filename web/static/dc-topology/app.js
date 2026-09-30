const NS = "http://www.w3.org/2000/svg";
import { appendRIB, appendFIB, identifyRoute, appendOriginatedRoutes, appendBorderRoutes } from "./tables.js";
import { routeFlowStreams } from "./route-flow.js";
import { displayNames } from "./labels.js";
import { physicalPoints, tapPoints, packetSegments } from "./packet-path.js";
import { routePaths } from "./route-paths.js";
import { appendBGPBits } from "./packet-bits.js";
import { explorerMarkup, appendUpdateInspection, appendPacketInspection } from "./inspection.js";

const kindLabels = {
  border: "Border", stem: "Stem", spine: "Spine", leaf: "Leaf", tor: "ToR", host: "Host",
};

export function mountTopologyApp(root, { onCommand = () => {} } = {}) {
  if (!root) throw new Error("Nie znaleziono korzenia aplikacji.");

  root.innerHTML = `
    <header class="dc-head">
      <div class="dc-brand-mark" aria-hidden="true">◈</div>
      <div><p class="dc-kicker">AGH WIET / ATLAS SIECI</p><h1>Wewnątrz sieci<span>.</span></h1>
        <p>Centrum danych — od fizycznych połączeń do oczekiwanych tras.</p></div>
      <div class="dc-head-actions"><span class="dc-tag">MODEL SYNTETYCZNY</span>
        <button class="dc-button" id="dc-config-open" type="button">Konfiguracja <span aria-hidden="true">↗</span></button></div>
    </header>
    <div class="dc-overview"><div><p class="dc-kicker">TOPOLOGIA DC</p><p id="dc-config-label">Wczytuję konfigurację…</p></div>
      <div id="dc-summary" class="dc-summary" aria-label="Podsumowanie modelu"></div></div>
    <section class="dc-graph-card" aria-labelledby="dc-graph-title">
      <div class="dc-toolbar"><div class="dc-layer-title"><span class="dc-status-dot" aria-hidden="true"></span><h2 id="dc-graph-title">Eksplorator</h2></div>
        <label><input id="dc-show-links" type="checkbox" checked> Łącza</label>
        <label><input id="dc-show-sessions" type="checkbox"> Sesje BGP</label>
        <label><input id="dc-show-infra-hosts" type="checkbox" checked> RS na hostach</label>
        <label><input id="dc-collapse-rs" type="checkbox"> Grupuj RS</label>
        <div class="dc-underlay-options">
          <label><input id="dc-show-underlay" type="checkbox" checked> Urządzenia underlay</label>
          <label id="dc-border-option" class="dc-underlay-suboption" hidden><input id="dc-keep-borders" type="checkbox" checked> Zostaw border</label>
        </div>
        <label title="Ilustracja po sesjach BGP; tablice tras pozostają bez zmian."><input id="dc-show-route-flow" type="checkbox"> Przepływ tras</label>
        <button id="dc-layout-reset" class="dc-tool-button" type="button">Reset układu</button>
        <button id="dc-fit" class="dc-tool-button" type="button">Dopasuj</button>
        <label class="dc-zoom"><span class="dc-sr-only">Powiększenie</span><input id="dc-zoom" type="range" min="50" max="150" value="85" step="5"><output id="dc-zoom-value">85%</output></label>
      </div>
      <div class="dc-workspace">
        <div id="dc-graph" class="dc-graph-scroll"><p class="dc-empty">Buduję widok topologii…</p></div>
        <div id="dc-device-actions" class="dc-device-actions" role="group" aria-label="Akcje urządzenia" hidden>
          <div class="dc-device-actions-heading"><strong></strong><button type="button" id="dc-device-actions-close" aria-label="Zamknij akcje urządzenia">×</button></div>
          <label id="dc-action-member-label" hidden>Członek <select id="dc-action-member"></select></label>
          <div class="dc-device-send-row"><button id="dc-send-to" type="button">Wyślij ruch do…</button><select id="dc-action-family" aria-label="Rodzina pakietu"><option value="ipv4">IPv4</option><option value="ipv6">IPv6</option></select></div>
        </div>
        <div id="dc-pick-banner" class="dc-pick-banner" hidden><span role="status"></span><button type="button" class="dc-tool-button">Anuluj wybór</button></div>
        <aside id="dc-inspector" class="dc-inspector" role="dialog" aria-labelledby="dc-inspector-heading" tabindex="-1" hidden>
          <div class="dc-inspector-bar"><button id="dc-inspector-back" type="button" class="dc-icon-button" aria-label="Wróć do poprzedniego widoku" disabled>←</button><button id="dc-inspector-grip" type="button" class="dc-popup-grip" aria-label="Przesuń inspektor; strzałki przesuwają, Home przywraca">⠿ <span>INSPEKTOR</span></button>
            <label class="dc-rib-control">Tablice <select id="dc-rib-view"><option value="gui">GUI</option><option value="linux">Linux / FRR</option></select></label>
            <button id="dc-inspector-close" class="dc-icon-button" type="button" aria-label="Zamknij inspektor">×</button></div>
          <div id="dc-details" class="dc-details"></div>
          ${["n","e","s","w","ne","se","sw","nw"].map(edge=>`<div class="dc-popup-edge" data-resize="${edge}" aria-hidden="true"></div>`).join("")}
          <button id="dc-inspector-resize" class="dc-popup-resize" type="button" aria-label="Zmień rozmiar inspektora; strzałki zmieniają wymiary, Home przywraca">◢</button>
        </aside>
      </div>
      <div id="dc-route-legend" class="dc-route-legend" hidden><span class="learned">● Fioletowy: droga ogłoszenia do tego RIB</span><span class="points-to">● Żółty: droga do next hop / celu</span></div>
      <div class="dc-graph-footer"><span class="dc-legend"><i class="legend-switch"></i> fabric <i class="legend-host"></i> host <i class="legend-vm"></i> route server <i class="legend-customer"></i> VM klienta</span>
        <span class="dc-canvas-note"><span aria-hidden="true">◎</span> Kliknij: szczegóły · przeciągnij: ustawienie</span>
        <span id="dc-flow-note">Adresy i tablice są obliczanym przykładem.</span></div>
      <div id="dc-traffic-list" class="dc-traffic-list" aria-label="Scenariusze ruchu"></div>
      <div class="dc-playback" role="group" aria-label="Sterowanie ilustracją pakietu">
        <button id="dc-play" class="dc-button" type="button" disabled>Odtwórz pakiet</button>
        <button id="dc-rewind" class="dc-button secondary" type="button" disabled>Od początku</button>
        <button id="dc-inspect-packet" class="dc-button secondary" type="button" disabled>Inspektuj pakiet</button>
        <label>Tempo <select id="dc-speed"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
        <span id="dc-play-status" aria-live="polite">Wybierz przepływ lub sesję BGP.</span>
      </div>
      ${explorerMarkup}
    </section>
    <p id="dc-message" class="dc-message" role="status" aria-live="polite">Wczytywanie przykładu…</p>
    <dialog id="dc-config-dialog" class="dc-config-dialog" aria-labelledby="dc-config-title">
      <div class="dc-inspector-bar"><div><p class="dc-kicker">SCENARIUSZ</p><h2 id="dc-config-title">Konfiguracja sieci</h2></div>
        <button id="dc-config-close" class="dc-icon-button" type="button" aria-label="Zamknij konfigurację">×</button></div>
      <p class="dc-config-help">Zmień rozmiar lub wczytaj YAML. Oczekiwane tablice tras zostaną przeliczone po przebudowie.</p>
      <form id="dc-count-form" class="dc-count-controls"><h3>Rozmiar topologii</h3>
        <div class="dc-count-grid">
          <label>Spines <input name="spines" type="number" min="1" max="8" required></label>
          <label>Bolts <input name="bolts" type="number" min="1" max="4" required></label>
          <label>Racks / bolt <input name="racks_per_bolt" type="number" min="1" max="4" required></label>
          <label>Hosty / rack <input name="hosts_per_rack" type="number" min="1" max="4" required></label>
          <label>VM klientów <input name="customer_vms" type="number" min="0" max="64" required></label>
        </div><button class="dc-button" type="submit">Przebuduj topologię</button>
      </form>
      <form id="dc-config-form"><label class="dc-editor-label" for="dc-editor">Konfiguracja YAML</label>
        <textarea id="dc-editor" class="dc-editor" spellcheck="false" autocomplete="off"></textarea>
        <div class="dc-actions"><button class="dc-button" type="submit">Wczytaj YAML</button>
          <button class="dc-button secondary" id="dc-reset" type="button">Przywróć przykład</button>
          <a class="dc-button secondary" id="dc-export" href="/api/config.yaml" download="dc-topology.yaml">Eksportuj YAML</a></div>
      </form><p id="dc-config-message" class="dc-message" role="status" aria-live="polite"></p>
    </dialog>`;

  const editor = root.querySelector("#dc-editor");
  const summaryEl = root.querySelector("#dc-summary");
  const messageEl = root.querySelector("#dc-message");
  const detailsEl = root.querySelector("#dc-details");
  const inspectorEl = root.querySelector("#dc-inspector");
  const configDialog = root.querySelector("#dc-config-dialog");
  const events = new AbortController();
  let returnFocus = null;

  function listen(target, type, handler, options = {}) {
    target.addEventListener(type, handler, { ...options, signal: events.signal });
  }

  function focusEntity(selection) {
    const element = [...graphEl.querySelectorAll("[data-entity-type]")].find((item) =>
      item.dataset.entityType === selection?.type && item.dataset.entityId === selection?.id);
    const target = element || [...trafficList.querySelectorAll("[data-traffic-id]")].find((item) => item.dataset.trafficId === selection?.id) || (["update", "packet"].includes(selection?.type) ? root.querySelector(`#dc-${selection.type}-form button[type=submit]`) : null);
    const focusTarget = target?.disabled ? target.closest("form")?.elements.from : target;
    focusTarget?.focus({ preventScroll: true });
  }

  function openInspector() {
    if (inspectorEl.hidden) returnFocus = selected;
    inspectorEl.hidden = false;
    clampPopup();
    root.querySelector("#dc-inspector-close").focus({ preventScroll: true });
  }

  function closeInspector() {
    cancelResize();
    inspectorEl.hidden = true;
    packetReveal = null;
    clearRoutePreview();
    inspectorHistory.length = 0;
    deviceMenu = null; positionDeviceMenu();
    if (!["packet", "update"].includes(selected?.type)) {
      selected = null;
      resetAnimation();
    }
    renderGraph();
    renderTrafficList();
    focusEntity(returnFocus);
  }

  function cancelResize() {
    if(popupResize) {
      popupSize=popupResize.previousSize;popupPosition=popupResize.previousPosition;
      const {target,id}=popupResize;popupResize=null;
      if(target.hasPointerCapture(id))target.releasePointerCapture(id);
      clampPopup();
    }
  }

  const graphEl = root.querySelector("#dc-graph");
  const trafficList = root.querySelector("#dc-traffic-list");
  const playButton = root.querySelector("#dc-play");
  const rewindButton = root.querySelector("#dc-rewind");
  const speedSelect = root.querySelector("#dc-speed");
  const playStatus = root.querySelector("#dc-play-status");
  const showLinks = root.querySelector("#dc-show-links");
  const showSessions = root.querySelector("#dc-show-sessions");
  const showRouteFlow = root.querySelector("#dc-show-route-flow");
  const flowNote = root.querySelector("#dc-flow-note");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const illustration = { frame: 0, startedAt: 0, sequence: [], streams: [] };
  const showInfraOnHosts = root.querySelector("#dc-show-infra-hosts");
  const collapseRouteServers = root.querySelector("#dc-collapse-rs");
  const showUnderlay = root.querySelector("#dc-show-underlay");
  const keepBorders = root.querySelector("#dc-keep-borders");
  const nodeVisible = node => showUnderlay.checked || node.kind === "host" || (node.kind === "border" && keepBorders.checked);
  const zoomInput = root.querySelector("#dc-zoom");
  const zoomOutput = root.querySelector("#dc-zoom-value");
  const countForm = root.querySelector("#dc-count-form");
  let state = { summary: null, model: null, configYAML: "", message: "", error: false };
  let selected = null;
  let destroyed = false;
  let modelRevision = 0;
  const inspectorLoaded = new Set();
  const inspectorPending = new Set();
  const inspectorErrors = new Map();
  const viewOffsets = new Map();
  let drag = null;
  let dragFrame = 0;
  let suppressClickUntil = 0;
  let currentPositions = null;
  let currentPacketSegments = [];
  let inspectorSelectionKey = "";
  const inspectorHistory = [];
  let popupPosition = null, popupDrag = null, endpointPick = null, deviceMenu = null;
  let popupSize = null, popupResize = null;
  let routeHover = null, sessionHover = null, previewFrame = 0;
  let packetReveal = null;
  const exploration = { update: null, packet: null };
  const exploreRequests = { update: 0, packet: 0 };
  const exploreErrors = { update: "", packet: "" };
  let pendingPacketPlayback=null;
  const animation = { playing: false, elapsed: 0, startedAt: 0, frame: 0 };

  function routeSelection(element) {
    return {type:"route",id:element.dataset.routeId,ownerID:element.dataset.routeOwner,candidate:JSON.parse(element.dataset.routeCandidate||"null")};
  }
  function previewRoute(element) {
    if(!element&&!routeHover)return;
    sessionHover=null;
    routeHover=element?routeSelection(element):null;
    if(!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;if(!destroyed)renderGraph();});
  }
  function clearRoutePreview() {
    routeHover=null;
    sessionHover=null;
    if(previewFrame)cancelAnimationFrame(previewFrame);
    previewFrame=0;
  }
  function previewSession(element) {
    if(!element&&!sessionHover)return;
    sessionHover=element?.dataset.sessionId??null;routeHover=null;
    if(!previewFrame)previewFrame=requestAnimationFrame(()=>{previewFrame=0;if(!destroyed)renderGraph();});
  }
  function requestPacketReveal() {
    packetReveal = `${selected.type}/${selected.id}`;
    revealPacketSection();
  }
  function revealPacketSection() {
    if (!packetReveal || inspectorEl.hidden) return;
    if (packetReveal !== `${selected?.type}/${selected?.id}`) { packetReveal = null; return; }
    const section = detailsEl.querySelector(".dc-wire");
    if (!section) {
      if (exploreErrors.packet || exploration.packet?.reachable === false) packetReveal = null;
      return;
    }
    for (let parent = section.parentElement; parent && parent !== detailsEl; parent = parent.parentElement) {
      if (parent.tagName === "DETAILS") parent.open = true;
    }
    inspectorEl.scrollIntoView({block:"start", behavior:"instant"});
    detailsEl.scrollTop += section.getBoundingClientRect().top - detailsEl.getBoundingClientRect().top - 8;
    section.querySelector("h4").focus({preventScroll:true});
    // Session exports may still arrive above the packet; reveal again after that
    // response settles so inserted content cannot push the fields out of view.
    if (!inspectorPending.has(`${modelRevision}/session/${selected.id}`)) packetReveal = null;
  }
  function rememberInspector() {
    if (!selected || inspectorEl.hidden) return;
    inspectorHistory.push({selection:selected, mode:root.querySelector("#dc-rib-view").value,
      sections:[...detailsEl.querySelectorAll("details")].map((item)=>item.open),scroll:detailsEl.scrollTop});
    if(inspectorHistory.length>32)inspectorHistory.shift();
  }
  function goBack() {
    const previous=inspectorHistory.pop();if(!previous)return;
    selected=previous.selection;root.querySelector("#dc-rib-view").value=previous.mode;
    resetAnimation();loadSelectionInspector();renderGraph();renderTrafficList();renderInspector();
    [...detailsEl.querySelectorAll("details")].forEach((item,index)=>{if(previous.sections[index]!==undefined)item.open=previous.sections[index];});
    detailsEl.scrollTop=previous.scroll;
  }
  function popupHeightLimit() {
    return inspectorEl.parentElement.clientHeight-parseFloat(getComputedStyle(inspectorEl).getPropertyValue("--dc-inspector-gap"));
  }
  function clampPopup() {
    if(popupSize) {
      const workspace=inspectorEl.parentElement;
      popupSize.width=Math.max(Math.min(300,workspace.clientWidth-16),Math.min(popupSize.width,workspace.clientWidth-16));
      const maxHeight=popupHeightLimit();
      popupSize.height=Math.max(Math.min(220,maxHeight),Math.min(popupSize.height,maxHeight));
      inspectorEl.style.width=`${popupSize.width}px`;inspectorEl.style.height=`${popupSize.height}px`;
    } else {inspectorEl.style.removeProperty("width");inspectorEl.style.removeProperty("height");}
    if(!popupPosition) {for(const prop of ["left","top","right"])inspectorEl.style.removeProperty(prop);return;}
    if(inspectorEl.hidden)return;
    const workspace=inspectorEl.parentElement;
    popupPosition.x=Math.max(4,Math.min(popupPosition.x,workspace.clientWidth-inspectorEl.offsetWidth-4));
    popupPosition.y=Math.max(4,Math.min(popupPosition.y,workspace.clientHeight-inspectorEl.offsetHeight-4));
    inspectorEl.style.left=`${popupPosition.x}px`;inspectorEl.style.top=`${popupPosition.y}px`;inspectorEl.style.right="auto";
  }
  function positionDeviceMenu() {
    const menu=root.querySelector("#dc-device-actions");menu.hidden=!deviceMenu;
    if(!deviceMenu)return;
    const entity=[...graphEl.querySelectorAll("[data-entity-type]")].find(el=>el.dataset.entityId===deviceMenu.id&&el.dataset.entityType===deviceMenu.type);
    if(!entity){menu.hidden=true;return;}
    const box=entity.getBoundingClientRect(),parent=inspectorEl.parentElement.getBoundingClientRect();
    let x=box.right-parent.x+8;
    if(x+menu.offsetWidth>parent.width-8)x=box.left-parent.x-menu.offsetWidth-8;
    menu.style.left=`${Math.max(8,Math.min(x,parent.width-menu.offsetWidth-8))}px`;
    menu.style.top=`${Math.max(8,Math.min(box.y-parent.y-15,parent.height-menu.offsetHeight-8))}px`;
  }
  function showDeviceMenu(selection) {
    deviceMenu=["node","vm","cluster"].includes(selection?.type)?selection:null;
    const menu=root.querySelector("#dc-device-actions");
    if(deviceMenu) {
      const entity=[...state.model.nodes,...state.model.vms].find(n=>n.id===selection.id);
      const members=state.model.vms.filter(v=>v.cluster_id===selection.id);
      menu.querySelector("strong").textContent=entity?.label??members[0]?.cluster_id??selection.id;
      root.querySelector("#dc-action-member-label").hidden=!members.length;
      root.querySelector("#dc-action-member").replaceChildren(...members.map(v=>new Option(displayNames(`${v.label} · ${v.host_id}`),v.id)));
    }
    positionDeviceMenu();
  }
  function updatePickBanner() {
    const banner=root.querySelector("#dc-pick-banner");banner.hidden=!endpointPick;
    root.classList.toggle("is-picking-endpoint",Boolean(endpointPick));
    for(const button of root.querySelectorAll("[data-pick-endpoint]"))button.setAttribute("aria-pressed",String(endpointPick?.name===button.dataset.pickEndpoint || (endpointPick?.pair&&button.dataset.pickEndpoint==="pair")));
    if(endpointPick)banner.querySelector("span").textContent=endpointPick.name==="from"?"Kliknij urządzenie źródłowe lub pojedynczą VM.":"Kliknij urządzenie docelowe lub pojedynczą VM.";
  }
  function endpointClass(id) {
    if(!endpointPick&&selected?.type!=="packet")return "";
    const form=root.querySelector("#dc-packet-form");
    return (form.elements.from.value===id?" packet-source":"")+(form.elements.to.value===id?" packet-destination":"");
  }
  function pickEndpoint(entity) {
    if(entity.dataset.entityType==="cluster") {
      collapseRouteServers.checked=false;renderGraph();updatePickBanner();
      root.querySelector("#dc-pick-banner span").textContent="Klaster rozwinięty; kliknij konkretną VM.";return;
    }
    if(!["node","vm"].includes(entity.dataset.entityType))return;
    const form=root.querySelector("#dc-packet-form"),pick=endpointPick;
    form.elements[pick.name].value=entity.dataset.entityId;
    form.dispatchEvent(new Event("change",{bubbles:true}));
    if(pick.pair&&pick.name==="from")endpointPick={name:"to",pair:true};
    else endpointPick=null;
    updatePickBanner();renderGraph();
    if(pick.pair&&pick.name==="to")beginExploration("packet",{autoplay:true});
  }

  const onSubmit = (event) => {
    event.preventDefault();
    send({ type: "load_config", yaml: editor.value });
  };
  const onCountSubmit = (event) => {
    event.preventDefault();
    const counts = Object.fromEntries(new FormData(countForm).entries());
    send({
      type: "update_counts",
      counts: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number(value)])),
      yaml: editor.value,
    });
  };
  const onReset = () => send({ type: "reset_default" });
  const onLayerChange = (event) => {
    const layerHidden = ["traffic", "session", "packet"].includes(selected?.type) && (!showLinks.checked ||
      selectedPath().some(id=>state.model.nodes.some(n=>n.id===id&&!nodeVisible(n))));
    const motionChanged = event.currentTarget === reducedMotion && reducedMotion.matches && !animation.reducedAtStart;
    if (animation.playing && (layerHidden || motionChanged)) pauseAnimation();
    renderGraph();
    renderInspector();
  };
  const onZoom = () => {
    zoomOutput.value = `${zoomInput.value}%`;
    renderGraph();
  };
  const onGraphClick = (event) => {
    clearRoutePreview();
    if (event.detail > 0 && performance.now() < suppressClickUntil) { suppressClickUntil = 0; return; }
    const entity = event.target.closest("[data-entity-type]");
    if (!entity || !graphEl.contains(entity)) return;
    if (endpointPick) { pickEndpoint(entity); return; }
    inspectorHistory.length = 0;
    selected = { type: entity.dataset.entityType, id: entity.dataset.entityId };
    resetAnimation();
    loadSelectionInspector();
    renderTrafficList();
    renderGraph();
    renderInspector();
    openInspector();
    showDeviceMenu(selected);
  };
  const onGraphKey = (event) => {
    const entity = event.target.closest("[data-entity-type]");
    if (!entity || !graphEl.contains(entity)) return;
    if (isDraggable(entity) && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) {
      event.preventDefault();
      const id = entity.dataset.entityId;
      const offset = viewOffsets.get(id) ?? { x: 0, y: 0 };
      const step = event.shiftKey ? 12 : 6;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (event.key === "Home") viewOffsets.delete(id);
      else viewOffsets.set(id, boundedOffset(offset.x + delta[0], offset.y + delta[1], currentPositions?.offsetBounds.get(id)));
      renderGraph();
      focusEntity({ type: entity.dataset.entityType, id });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      entity.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  };

  function isDraggable(entity) {
    return ["node", "vm", "cluster"].includes(entity?.dataset.entityType);
  }

  function graphPoint(event) {
    const svg = graphEl.querySelector("svg");
    const matrix = svg?.getScreenCTM();
    return matrix ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()) : null;
  }

  function endDrag(event, cancelled = false) {
    if (!drag || (event && event.pointerId !== drag.pointerID)) return;
    const previous = drag;
    drag = null;
    if (dragFrame) cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    graphEl.classList.remove("is-dragging");
    if (graphEl.hasPointerCapture(previous.pointerID)) graphEl.releasePointerCapture(previous.pointerID);
    if (cancelled) {
      if (previous.hadOffset) viewOffsets.set(previous.id, previous.offset);
      else viewOffsets.delete(previous.id);
    }
    if (previous.moved) {
      suppressClickUntil = performance.now() + 300;
      renderGraph();
      focusEntity({ type: previous.type, id: previous.id });
    }
  }

  const onPointerDown = (event) => {
    if (endpointPick || drag || !event.isPrimary || event.button !== 0) return;
    suppressClickUntil = 0;
    const entity = event.target.closest("[data-entity-type]");
    if (!isDraggable(entity)) return;
    const point = graphPoint(event);
    if (!point) return;
    drag = { id: entity.dataset.entityId, type: entity.dataset.entityType, pointerID: event.pointerId,
      point, clientX: event.clientX, clientY: event.clientY, offset: viewOffsets.get(entity.dataset.entityId) ?? { x: 0, y: 0 },
      hadOffset: viewOffsets.has(entity.dataset.entityId), moved: false };
  };
  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerID) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 4) return;
    const point = graphPoint(event);
    if (!point) return;
    if (!drag.moved) {
      drag.moved = true;
      graphEl.setPointerCapture(event.pointerId);
      graphEl.classList.add("is-dragging");
    }
    event.preventDefault();
    viewOffsets.set(drag.id, boundedOffset(drag.offset.x + point.x - drag.point.x, drag.offset.y + point.y - drag.point.y, currentPositions?.offsetBounds.get(drag.id)));
    if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; renderGraph(); });
  };
  const onInspectorClick = (event) => {
    clearRoutePreview();
    deviceMenu=null;positionDeviceMenu();
    const update = event.target.closest("[data-update-id]");
    if (update) {
      const advertisement = state.model.route_state?.advertisements?.find((item) => item.id === update.dataset.updateId);
      if (advertisement) {
        const form = root.querySelector("#dc-update-form"); form.elements.from.value = advertisement.from_id; form.elements.to.value = advertisement.to_id;
        setRouteOptions({ routes: [state.model.route_state.origins.find((item) => item.id === advertisement.route_id)] });
        form.elements.route.value = advertisement.route_id; beginExploration("update");
      }
      return;
    }
    const route = event.target.closest("[data-route-id]");
    if (route && detailsEl.contains(route)) {
      rememberInspector();
      selected = routeSelection(route);
      resetAnimation();
      renderTrafficList();
      renderGraph();
      renderInspector();
      return;
    }
    const button = event.target.closest("[data-session-id]");
    if (!button || !detailsEl.contains(button)) return;
    rememberInspector();
    selected = { type: "session", id: button.dataset.sessionId };
    resetAnimation();
    loadInspector("session", selected.id);
    renderTrafficList();
    renderGraph();
    renderInspector();
  };
  const onTrafficClick = (event) => {
    const button = event.target.closest("[data-traffic-id]");
    if (!button || !trafficList.contains(button)) return;
    const flow=state.model.route_state?.traffic?.find(item=>item.id===button.dataset.trafficId);
    if(!flow?.reachable)return;
    const form=root.querySelector("#dc-packet-form");form.elements.from.value=flow.source_vm_id;form.elements.to.value=flow.destination_id;form.elements.family.value="ipv4";
    beginExploration("packet",{autoplay:true,trafficID:flow.id});
  };
  const onPlaybackClick = () => animation.playing ? pauseAnimation() : startAnimation();
  const onRewindClick = () => resetAnimation();
  const onSpeedChange = () => {
    if (animation.playing) {
      const now = performance.now();
      animation.elapsed += (now - animation.startedAt) * animation.speed;
      animation.startedAt = now;
      animation.speed = Number(speedSelect.value);
      updateAnimationMarker();
    }
  };

  listen(root.querySelector("#dc-config-form"), "submit", onSubmit);
  listen(countForm, "submit", onCountSubmit);
  listen(root.querySelector("#dc-reset"), "click", onReset);
  listen(showLinks, "change", onLayerChange);
  listen(showSessions, "change", onLayerChange);
  listen(showRouteFlow, "change", onLayerChange);
  listen(reducedMotion, "change", onLayerChange);
  listen(showInfraOnHosts, "change", onLayerChange);
  listen(collapseRouteServers, "change", onLayerChange);
  listen(showUnderlay, "change", onLayerChange);
  listen(keepBorders, "change", onLayerChange);
  listen(zoomInput, "input", onZoom);
  listen(graphEl, "click", onGraphClick);
  listen(graphEl, "keydown", onGraphKey);
  listen(graphEl, "pointerdown", onPointerDown);
  listen(graphEl, "pointermove", onPointerMove);
  listen(graphEl, "pointerup", (event) => endDrag(event));
  listen(graphEl, "pointercancel", (event) => endDrag(event, true));
  listen(graphEl, "lostpointercapture", (event) => endDrag(event, true));
  listen(window, "pointerup", (event) => endDrag(event));
  listen(root.querySelector("#dc-layout-reset"), "click", () => {
    endDrag(null, true);
    viewOffsets.clear();
    renderGraph();
  });
  listen(root.querySelector("#dc-fit"), "click", fitGraph);
  listen(detailsEl, "click", onInspectorClick);
  const onRouteEnter=(event)=>{
    if(event.type==="pointerover"&&event.pointerType!=="mouse"&&event.pointerType!=="pen")return;
    const route=event.target.closest("[data-route-id]");
    if(route&&detailsEl.contains(route)&&event.relatedTarget?.closest?.("[data-route-id]")!==route)previewRoute(route);
    const session=event.target.closest("[data-session-id]");
    if(session&&detailsEl.contains(session)&&event.relatedTarget?.closest?.("[data-session-id]")!==session)previewSession(session);
  };
  const onRouteLeave=(event)=>{
    const route=event.target.closest("[data-route-id]");
    if(route&&event.relatedTarget?.closest?.("[data-route-id]")!==route)previewRoute(null);
    const session=event.target.closest("[data-session-id]");
    if(session&&event.relatedTarget?.closest?.("[data-session-id]")!==session)previewSession(null);
  };
  listen(detailsEl,"pointerover",onRouteEnter);listen(detailsEl,"pointerout",onRouteLeave);
  listen(detailsEl,"focusin",onRouteEnter);listen(detailsEl,"focusout",onRouteLeave);
  listen(root.querySelector("#dc-inspector-back"),"click",goBack);
  const grip=root.querySelector("#dc-inspector-grip");
  listen(grip,"pointerdown",(event)=>{
    if(!event.isPrimary||event.button!==0)return;
    const box=inspectorEl.getBoundingClientRect(),parent=inspectorEl.parentElement.getBoundingClientRect();
    popupDrag={id:event.pointerId,x:event.clientX,y:event.clientY,start:{x:box.x-parent.x,y:box.y-parent.y},previous:popupPosition&&{...popupPosition}};
    grip.setPointerCapture(event.pointerId);event.preventDefault();
  });
  listen(grip,"pointermove",(event)=>{
    if(!popupDrag||popupDrag.id!==event.pointerId)return;
    popupPosition={x:popupDrag.start.x+event.clientX-popupDrag.x,y:popupDrag.start.y+event.clientY-popupDrag.y};clampPopup();
  });
  const finishPopupDrag=(event)=>{
    if(!popupDrag||popupDrag.id!==event.pointerId)return;
    if(event.type==="pointercancel") {popupPosition=popupDrag.previous;clampPopup();}
    popupDrag=null;if(grip.hasPointerCapture(event.pointerId))grip.releasePointerCapture(event.pointerId);
  };
  for(const type of ["pointerup","pointercancel","lostpointercapture"])listen(grip,type,finishPopupDrag);
  listen(grip,"keydown",(event)=>{
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(event.key))return;
    event.preventDefault();
    if(event.key==="Home")popupPosition=null;
    else {
      const box=inspectorEl.getBoundingClientRect(),parent=inspectorEl.parentElement.getBoundingClientRect();
      const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[event.key];
      popupPosition={x:box.x-parent.x+delta[0],y:box.y-parent.y+delta[1]};
    }
    clampPopup();
  });
  listen(window,"resize",()=>{clampPopup();positionDeviceMenu();});
  const resizeHandle=root.querySelector("#dc-inspector-resize");
  const beginResize=event=>{
    if(!event.isPrimary||event.button!==0)return;
    const box=inspectorEl.getBoundingClientRect(),parent=inspectorEl.parentElement.getBoundingClientRect();
    popupResize={id:event.pointerId,x:event.clientX,y:event.clientY,width:box.width,height:box.height,
      start:{x:box.x-parent.x,y:box.y-parent.y},direction:event.currentTarget.dataset.resize??"se",target:event.currentTarget,
      previousSize:popupSize&&{...popupSize},previousPosition:popupPosition&&{...popupPosition}};
    popupPosition={x:box.x-parent.x,y:box.y-parent.y};
    event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
  };
  const moveResize=event=>{
    if(!popupResize||popupResize.id!==event.pointerId)return;
    const {start,width,height,direction}=popupResize,workspace=inspectorEl.parentElement;
    const dx=event.clientX-popupResize.x,dy=event.clientY-popupResize.y;
    const west=direction.includes("w"),east=direction.includes("e"),north=direction.includes("n"),south=direction.includes("s");
    const limit=(value,minimum,maximum)=>Math.max(minimum,Math.min(value,maximum));
    popupSize={width,height};
    if(west||east)popupSize.width=limit(width+(west?-dx:dx),Math.min(300,workspace.clientWidth-16),Math.min(workspace.clientWidth-16,west?start.x+width-4:workspace.clientWidth-start.x-4));
    const maxHeight=popupHeightLimit();
    if(north||south)popupSize.height=limit(height+(north?-dy:dy),Math.min(220,maxHeight),Math.min(maxHeight,north?start.y+height-4:workspace.clientHeight-start.y-4));
    popupPosition={x:west?start.x+width-popupSize.width:start.x,y:north?start.y+height-popupSize.height:start.y};
    clampPopup();
  };
  const finishResize=event=>{
    if(!popupResize||popupResize.id!==event.pointerId)return;
    if(event.type==="pointercancel") {popupSize=popupResize.previousSize;popupPosition=popupResize.previousPosition;clampPopup();}
    const target=popupResize.target;popupResize=null;if(target.hasPointerCapture(event.pointerId))target.releasePointerCapture(event.pointerId);
  };
  for(const target of [resizeHandle,...root.querySelectorAll(".dc-popup-edge")]) {
    listen(target,"pointerdown",beginResize);listen(target,"pointermove",moveResize);
    for(const type of ["pointerup","pointercancel","lostpointercapture"])listen(target,type,finishResize);
  }
  listen(resizeHandle,"keydown",event=>{
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(event.key))return;
    event.preventDefault();
    if(event.key==="Home")popupSize=null;
    else {
      const box=inspectorEl.getBoundingClientRect(),step=event.shiftKey?64:16;
      popupSize={width:box.width+({ArrowLeft:-step,ArrowRight:step}[event.key]??0),height:box.height+({ArrowUp:-step,ArrowDown:step}[event.key]??0)};
    }
    clampPopup();
  });
  listen(graphEl,"scroll",positionDeviceMenu);
  listen(root.querySelector("#dc-device-actions-close"),"click",()=>{deviceMenu=null;positionDeviceMenu();});
  listen(document,"pointerdown",event=>{
    if(deviceMenu&&!root.querySelector("#dc-device-actions").contains(event.target)) {
      deviceMenu=null;positionDeviceMenu();
    }
  });
  listen(root.querySelector("#dc-send-to"),"click",()=>{
    if(!deviceMenu)return;
    const form=root.querySelector("#dc-packet-form");
    form.elements.from.value=deviceMenu.type==="cluster"?root.querySelector("#dc-action-member").value:deviceMenu.id;
    form.elements.family.value=root.querySelector("#dc-action-family").value;
    form.dispatchEvent(new Event("change",{bubbles:true}));
    endpointPick={name:"to",pair:true};deviceMenu=null;positionDeviceMenu();
    inspectorEl.hidden=true;selected=null;inspectorHistory.length=0;resetAnimation();updatePickBanner();renderGraph();
  });
  for(const button of root.querySelectorAll("[data-pick-endpoint]"))listen(button,"click",()=>{
    const name=button.dataset.pickEndpoint;endpointPick={name:name==="pair"?"from":name,pair:name==="pair"};
    inspectorEl.hidden=true;inspectorHistory.length=0;selected=null;deviceMenu=null;positionDeviceMenu();resetAnimation();updatePickBanner();renderGraph();
    graphEl.scrollIntoView({block:"center"});graphEl.querySelector(".dc-node")?.focus({preventScroll:true});
  });
  listen(root.querySelector("#dc-pick-banner button"),"click",()=>{endpointPick=null;updatePickBanner();renderGraph();});
  listen(root.querySelector("#dc-rib-view"), "change", () => renderInspector());
  for (const kind of ["update", "packet"]) {
    const form = root.querySelector(`#dc-${kind}-form`);
    listen(form, "submit", (event) => { event.preventDefault(); beginExploration(kind); });
    listen(form, "change", () => {
      exploreRequests[kind]++;
      exploration[kind] = null;
      exploreErrors[kind] = "";
      form.querySelector("button[type=submit]").disabled = false;
      root.querySelector(`#dc-${kind}-status`).textContent = "Pokaż przepływ, aby zatwierdzić wybrane końce.";
      if (kind === "update") {
        if (form.elements.from.value !== form.dataset.from || form.elements.to.value !== form.dataset.to) setRouteOptions(null);
        renderGraph();
      } else resetAnimation();
      renderInspector();
    });
  }
  listen(root.querySelector("#dc-inspect-packet"), "click", () => {
    if(selected?.type==="packet") {
      renderInspector();openInspector();requestPacketReveal();return;
    }
    if (selected?.type === "session") {
      renderInspector(); openInspector();
      requestPacketReveal();
      return;
    }
    if (selected?.type !== "traffic" && exploration.packet) {
      selected = { type: "packet", id: String(exploreRequests.packet) };
      renderGraph(); renderInspector(); openInspector(); requestPacketReveal();
      return;
    }
    const flow = state.model.route_state?.traffic?.find((item) => item.id === selected?.id);
    const session = state.model.bgp_sessions.find((item) => item.id === selected?.id);
    const from = flow?.source_vm_id ?? session?.a.entity_id;
    const to = flow?.destination_id ?? session?.b.entity_id;
    if (from && to) {
      const form = root.querySelector("#dc-packet-form"); form.elements.from.value = from; form.elements.to.value = to;
      form.elements.family.value = session ? "ipv6" : "ipv4"; beginExploration("packet");
      requestPacketReveal();
    }
  });
  listen(trafficList, "click", onTrafficClick);
  listen(playButton, "click", onPlaybackClick);
  listen(rewindButton, "click", onRewindClick);
  listen(speedSelect, "change", onSpeedChange);

  listen(root.querySelector("#dc-config-open"), "click", () => configDialog.showModal());
  listen(root.querySelector("#dc-config-close"), "click", () => configDialog.close());
  listen(root.querySelector("#dc-inspector-close"), "click", closeInspector);
  listen(window, "keydown", (event) => {
    if (event.key === "Escape" && deviceMenu && inspectorEl.hidden) {deviceMenu=null;positionDeviceMenu();return;}
    if (event.key === "Escape" && endpointPick) {endpointPick=null;updatePickBanner();renderGraph();return;}
    if (event.key === "Escape" && !inspectorEl.hidden && !configDialog.open) {
      event.preventDefault();
      closeInspector();
    }
  });

  function send(command) {
    if (!destroyed) onCommand(command);
  }

  function loadInspector(kind, id) {
    const key = `${modelRevision}/${kind}/${id}`;
    if (inspectorLoaded.has(key) || inspectorPending.has(key)) return;
    inspectorErrors.delete(key);
    inspectorPending.add(key);
    send({ type: "load_inspector", kind, id, revision: modelRevision });
  }

  function loadSelectionInspector() {
    if (selected?.type === "node" || selected?.type === "vm") loadInspector("speaker", selected.id);
    else if (selected?.type === "session") loadInspector("session", selected.id);
    else if (selected?.type === "cluster") {
      for (const vm of state.model?.vms ?? []) if (vm.cluster_id === selected.id) loadInspector("speaker", vm.id);
    }
  }

  function appendInspectorLoading(container, kind, id) {
    const note = document.createElement("p");
    note.textContent = inspectorErrors.get(`${modelRevision}/${kind}/${id}`) || (inspectorPending.has(`${modelRevision}/${kind}/${id}`)
      ? "Wczytuję szczegóły…"
      : "Wybierz element ponownie, aby wczytać szczegóły.");
    container.append(note);
  }

  function appendSpeakerTableOrLoading(container, speakerID) {
    appendOriginatedRoutes(container, state.model, speakerID, root.querySelector("#dc-rib-view").value, appendRouteRows);
    const table = state.model?.route_state?.tables?.find((item) => item.speaker_id === speakerID);
    if (table) {
      appendRIB(container, state.model, speakerID, root.querySelector("#dc-rib-view").value, appendRouteRows);
      appendBorderRoutes(container,state.model,speakerID,root.querySelector("#dc-rib-view").value,appendRouteRows);
    }
    else appendInspectorLoading(container, "speaker", speakerID);
  }

  function setRouteOptions(flow) {
    const form = root.querySelector("#dc-update-form"), select = form.elements.route;
    select.replaceChildren(new Option("Dobierz zgodną trasę", ""));
    for (const route of flow?.routes ?? []) select.add(new Option(`${route.route_type ? "EVPN Type 5" : route.afi} · ${route.prefix}${route.vpc_id ? ` · VPC ${route.vpc_id}` : ""} · ${route.origin_label}`, route.id));
    if (flow?.route) select.value = flow.route.id;
    form.dataset.from = form.elements.from.value; form.dataset.to = form.elements.to.value;
  }

  function renderEndpointOptions(model) {
    const endpoints = [...model.nodes.map((item) => ({ id: item.id, label: `${kindLabels[item.kind]} · ${item.label}` })), ...model.vms.map((item) => ({ id: item.id, label: displayNames(`${item.label} · ${item.host_id}`) }))];
    for (const kind of ["update", "packet"]) {
      const form = root.querySelector(`#dc-${kind}-form`);
      for (const name of ["from", "to"]) form.elements[name].replaceChildren(...endpoints.map((item) => new Option(item.label, item.id)));
      const defaults = kind === "update" ? ["host-b1-h1", "host-b2-h1"] : ["customer-1", "customer-3"];
      form.elements.from.value = endpoints.some((item) => item.id === defaults[0]) ? defaults[0] : endpoints[0].id;
      form.elements.to.value = endpoints.some((item) => item.id === defaults[1]) ? defaults[1] : endpoints.find((item) => item.id !== form.elements.from.value).id;
      form.querySelector("button[type=submit]").disabled = false;
      root.querySelector(`#dc-${kind}-status`).textContent = "Wybierz końce i pokaż przepływ. Inspekcja nie zmienia tablic ani YAML.";
    }
    setRouteOptions(null);
  }

  function beginExploration(kind,{autoplay=false,trafficID=""}={}) {
    const form = root.querySelector(`#dc-${kind}-form`);
    if (!state.model || state.busy) return;
    deviceMenu=null;positionDeviceMenu();
    const requestID = ++exploreRequests[kind];
    exploration[kind] = null; exploreErrors[kind] = "";
    rememberInspector();
    selected = { type: kind, id: String(requestID),presetID:trafficID||undefined };
    if(kind==="packet")pendingPacketPlayback=autoplay?requestID:null;
    resetAnimation();
    form.querySelector("button[type=submit]").disabled = true;
    root.querySelector(`#dc-${kind}-status`).textContent = "Sprawdzam wybrane końce…";
    if (kind === "update") { showSessions.checked = true; showRouteFlow.checked = true; }
    else showLinks.checked = true;
    renderGraph(); renderInspector(); openInspector();
    inspectorEl.scrollIntoView({ block: "start" });
    send({ type: "explore", kind, from: form.elements.from.value, to: form.elements.to.value,
      route: kind === "update" ? form.elements.route.value : "", family: kind === "packet" ? form.elements.family.value : "",
      traffic:trafficID,
      requestID, revision: modelRevision });
  }

  function selectedPath() {
    if (!state.model || !selected) return [];
    if (selected.type === "traffic") {
      return state.model.route_state?.traffic?.find((item) => item.id === selected.id)?.physical_node_ids ?? [];
    }
    if (selected.type === "session") {
      return state.model.route_state?.control_paths?.find((item) => item.session_id === selected.id)?.physical_node_ids ?? [];
    }
    if (selected.type === "packet") return exploration.packet?.display_hop_ids ?? [];
    return [];
  }

  function syncIllustration() {
    const active = !routeHover && selected?.type !== "route" && showRouteFlow.checked && showSessions.checked && illustration.sequence.length > 0;
    flowNote.textContent = !showRouteFlow.checked ? "Adresy i tablice są obliczanym przykładem."
      : !showSessions.checked ? "Przepływ poglądowy — włącz warstwę Sesje BGP."
      : !illustration.sequence.length ? "Brak zgodnego przykładu przepływu tras w tej konfiguracji."
      : exploration.update ? `UPDATE: ${exploration.update.from_id} → ${exploration.update.to_id} · ${exploration.update.route.prefix}. Rozgałęzienia pokazują dostarczenie tego prefiksu do urządzeń końcowych.`
      : `Poglądowo: ${illustration.streams.length} ogłoszeń płynie kolejno przez RS, jeden prefiks naraz, z rozgałęzieniami na RS. Tablice pozostają stałe.`;
    if(routeHover||selected?.type==="route")flowNote.textContent="Fioletowa strzałka wskazuje kierunek propagacji oglądanej trasy do tego RIB.";
    flowNote.textContent=displayNames(flowNote.textContent);
    if (!active || reducedMotion.matches) {
      if (illustration.frame) cancelAnimationFrame(illustration.frame);
      illustration.frame = 0;
      for (const marker of graphEl.querySelectorAll(".dc-route-marker")) marker.setAttribute("visibility", "hidden");
      return;
    }
    const now = performance.now();
    if (!illustration.frame) illustration.startedAt = now;
    updateIllustrationMarker(now);
    if (!illustration.frame) {
      const tick = (now) => {
        if (destroyed) return;
        updateIllustrationMarker(now);
        illustration.frame = requestAnimationFrame(tick);
      };
      illustration.frame = requestAnimationFrame(tick);
    }
  }

  function updateIllustrationMarker(now) {
    if (!showRouteFlow.checked || !showSessions.checked || reducedMotion.matches || !illustration.sequence.length) return;
    const scaled = (Math.max(0, now - illustration.startedAt) % (illustration.sequence.length * 1100)) / 1100;
    let waveIndex=Math.floor(scaled),streamIndex=0;
    while(waveIndex>=illustration.streams[streamIndex].waves.length)waveIndex-=illustration.streams[streamIndex++].waves.length;
    const stream=illustration.streams[streamIndex],wave=stream.waves[waveIndex];
    const markers=graphEl.querySelectorAll(".dc-route-marker"),displayed=new Set();
    let index=0;
    for(const step of wave) {
      const from=currentPositions?.entityPoints.get(step.fromID),to=currentPositions?.entityPoints.get(step.toID);
      if(!from||!to)continue;
      // Collapsed cluster members share anchors: draw one copy at that position.
      const key=`${from.x},${from.y}/${to.x},${to.y}`;
      if(displayed.has(key))continue;
      displayed.add(key);
      const marker=markers[index++],fraction=scaled%1;
      marker.setAttribute("cx",String(from.x+(to.x-from.x)*fraction));
      marker.setAttribute("cy",String(from.y+(to.y-from.y)*fraction));
      marker.setAttribute("visibility","visible");
      marker.dataset.flowIndex=String(streamIndex);marker.dataset.routeId=stream.route.id;
      marker.dataset.from=step.fromID;marker.dataset.to=step.toID;marker.dataset.wave=String(waveIndex);
      marker.style.fill=["#d4b1fc","#82d7e9","#ffd782","#9cdfb2"][streamIndex%4];
      marker.querySelector("title").textContent=displayNames(`${stream.route.prefix} · ${step.fromID} → ${step.toID}`);
    }
    for(;index<markers.length;index++)markers[index].setAttribute("visibility","hidden");
    for(const item of detailsEl.querySelectorAll(".dc-update-step"))item.classList.toggle("is-current",stream.focused&&wave.some(step=>step.fromID===exploration.update?.steps[Number(item.dataset.stepIndex)]?.from_id&&step.toID===exploration.update?.steps[Number(item.dataset.stepIndex)]?.to_id));
  }

  function animationDuration() {
    return currentPacketSegments.length * 900;
  }

  function animationElapsed(now = performance.now()) {
    return animation.elapsed + (animation.playing ? (now - animation.startedAt) * animation.speed : 0);
  }

  function updateAnimationMarker(now = performance.now()) {
    const marker = graphEl.querySelector("#dc-packet-marker");
    const path = selectedPath();
    if (routeHover || !marker || path.length < 2 || !state.model || !showLinks.checked) {
      if (marker) marker.setAttribute("visibility", "hidden");
      return;
    }
    if(!currentPacketSegments.length) {marker.setAttribute("visibility","hidden");return;}
    const duration = animationDuration();
    // rAF timestamps can precede performance.now() when playback starts mid-frame.
    const progress = Math.max(0, Math.min(1, animationElapsed(now) / duration));
    const scaled = progress * currentPacketSegments.length;
    const segment = Math.min(currentPacketSegments.length - 1, Math.floor(scaled));
    const fraction = progress >= 1 ? 1 : scaled - segment;
    const [a,b]=currentPacketSegments[segment].points;
    marker.setAttribute("cx", String(a.x + (b.x - a.x) * fraction));
    marker.setAttribute("cy", String(a.y + (b.y - a.y) * fraction));
    marker.setAttribute("visibility", "visible");
    for (const item of detailsEl.querySelectorAll(".dc-packet-hop")) item.classList.toggle("is-current", Number(item.dataset.hopIndex) === Math.floor(scaled));
  }

  function updatePlaybackControls() {
    const path = selectedPath();
    const hiddenPath = path.some(id=>!currentPositions?.entityPoints.has(id));
    const canPlay = path.length > 1 && showLinks.checked && !hiddenPath;
    playButton.disabled = !canPlay;
    rewindButton.disabled = !canPlay;
    root.querySelector("#dc-inspect-packet").disabled = !exploration.packet && (!selected || !["traffic", "session", "packet"].includes(selected.type));
    playButton.textContent = animation.playing ? "Wstrzymaj pakiet" : "Odtwórz pakiet";
    if (animation.playing) return;
    if (!selected || !["traffic", "session", "packet"].includes(selected.type)) playStatus.textContent = "Wybierz przepływ lub sesję BGP, aby prześledzić pakiet.";
    else if (hiddenPath) playStatus.textContent = "Pokaż urządzenia underlay, aby odtworzyć pełną drogę pakietu.";
    else if (!showLinks.checked) playStatus.textContent = "Włącz łącza fizyczne, aby zobaczyć drogę pakietu.";
    else if (path.length === 1) playStatus.textContent = "Dostarczenie lokalne — bez przejścia przez fabric.";
    else if (!path.length) playStatus.textContent = "Brak osiągalnej ścieżki w tej konfiguracji.";
    else playStatus.textContent = `${path.length - 1} hopów · poglądowa droga pakietu.`;
  }

  function startAnimation() {
    const path = selectedPath();
    if (path.length < 2 || !showLinks.checked || animation.playing || path.some(id=>!currentPositions?.entityPoints.has(id))) return;
    // Sending traffic or choosing a preset opts into packet playback.
    // Decorative streams still respect reduced motion.
    const duration = animationDuration();
    if (animation.elapsed >= duration) animation.elapsed = 0;
    animation.playing = true;
    animation.reducedAtStart = reducedMotion.matches;
    animation.startedAt = performance.now();
    animation.speed = Number(speedSelect.value);
    playStatus.textContent = "Poglądowy pakiet przemieszcza się po wybranej ścieżce…";
    updatePlaybackControls();
    const tick = (now) => {
      if (!animation.playing || destroyed) return;
      updateAnimationMarker(now);
      if (animationElapsed(now) >= duration) {
        animation.elapsed = duration;
        animation.playing = false;
        animation.frame = 0;
        updateAnimationMarker(now);
        playStatus.textContent = "Ilustracja pakietu zakończona.";
        updatePlaybackControls();
        return;
      }
      animation.frame = requestAnimationFrame(tick);
    };
    animation.frame = requestAnimationFrame(tick);
  }

  function pauseAnimation() {
    if (!animation.playing) return;
    const now = performance.now();
    animation.elapsed += (now - animation.startedAt) * animation.speed;
    animation.playing = false;
    if (animation.frame) cancelAnimationFrame(animation.frame);
    animation.frame = 0;
    playStatus.textContent = "Animacja wstrzymana.";
    updateAnimationMarker(now);
    updatePlaybackControls();
  }

  function resetAnimation() {
    animation.playing = false;
    animation.elapsed = 0;
    if (animation.frame) cancelAnimationFrame(animation.frame);
    animation.frame = 0;
    if (playStatus) playStatus.textContent = "";
    updateAnimationMarker();
    updatePlaybackControls();
  }

  function setState(next) {
    if (destroyed) return;
    if (next.model && next.model !== state.model) {
      clearRoutePreview();
      packetReveal = null;
      modelRevision++;
      inspectorLoaded.clear();
      inspectorPending.clear();
      pendingPacketPlayback=null;
      inspectorErrors.clear();
      endDrag(null, true);
      cancelResize();
      viewOffsets.clear();
      inspectorEl.hidden = true;
      selected = null;
      inspectorHistory.length = 0; popupPosition = null; popupSize = null; endpointPick = null; deviceMenu = null;
      clampPopup(); updatePickBanner();
      resetAnimation();
      for (const kind of ["update", "packet"]) { exploration[kind] = null; exploreRequests[kind]++; exploreErrors[kind] = ""; }
      renderEndpointOptions(next.model);
    }
    state = { ...state, ...next };
    if (next.busy !== undefined) {
      for (const button of root.querySelectorAll("#dc-config-form button, #dc-count-form button")) button.disabled = Boolean(next.busy);
    }
    if (next.explorationData) {
      const payload = next.explorationData;
      if (payload.revision === modelRevision && payload.requestID === exploreRequests[payload.kind]) {
        const kind = payload.kind;
        exploration[kind] = payload.ok ? payload.update_flow ?? payload.packet : null;
        exploreErrors[kind] = payload.ok ? "" : payload.message;
        root.querySelector(`#dc-${kind}-form button[type=submit]`).disabled = false;
        const result = exploration[kind];
        root.querySelector(`#dc-${kind}-status`).textContent = !payload.ok ? payload.message : result.reachable
          ? kind === "update" ? `${result.steps.length} eksportów · ${result.route.prefix}` : `${result.physical_link_ids.length} łączy · ${result.vxlan ? `VXLAN ${result.vni}` : "bez VXLAN"}`
          : trafficReasonText(result.reason);
        if (kind === "update" && payload.ok) setRouteOptions(result);
      }
    }
    if (next.inspectorData) {
      const payload = next.inspectorData;
      const key = `${payload.revision}/${payload.kind}/${payload.id}`;
      inspectorPending.delete(key);
      if (payload.revision === modelRevision && !payload.ok) inspectorErrors.set(key, payload.message || "Nie udało się wczytać szczegółów. Wybierz element ponownie, aby spróbować jeszcze raz.");
      if (payload.revision === modelRevision && state.model && payload.ok) {
        inspectorLoaded.add(key);
        const routeState = { ...state.model.route_state };
        if (payload.kind === "speaker" && payload.speaker_table) {
          routeState.tables = [...(routeState.tables ?? []).filter((item) => item.speaker_id !== payload.id), payload.speaker_table];
          routeState.forwarding = [...(routeState.forwarding ?? []).filter((item) => item.owner_id !== payload.id), ...(payload.forwarding ?? [])];
        } else if (payload.kind === "session") {
          routeState.advertisements = [...(routeState.advertisements ?? []).filter((item) => item.session_id !== payload.id), ...(payload.advertisements ?? [])];
        } else if (payload.kind === "route") {
          routeState.advertisements = [...(routeState.advertisements ?? []).filter((item) => item.route_id !== payload.id), ...(payload.advertisements ?? [])];
        }
        state.model = { ...state.model, route_state: routeState };
      }
    }
    if (typeof next.configYAML === "string" && editor.value !== next.configYAML) editor.value = next.configYAML;
    if (next.message !== undefined) {
      messageEl.textContent = next.message || "";
      messageEl.classList.toggle("error", Boolean(next.error));
      const configMessage = root.querySelector("#dc-config-message");
      configMessage.textContent = next.message || "";
      configMessage.classList.toggle("error", Boolean(next.error));
    }
    if (next.summary !== undefined) renderSummary();
    renderTrafficList();
    renderGraph();
    renderInspector();
    if(next.explorationData?.kind==="packet"&&next.explorationData.revision===modelRevision&&next.explorationData.ok&&pendingPacketPlayback===next.explorationData.requestID&&selected?.type==="packet"&&selected.id===String(pendingPacketPlayback)) {
      pendingPacketPlayback=null;
      if(exploration.packet?.reachable)startAnimation();
    }
  }

  function renderSummary() {
    const s = state.summary;
    const label = root.querySelector("#dc-config-label");
    if (!s) {
      label.textContent = "Brak aktywnej konfiguracji";
      summaryEl.innerHTML = '<p class="dc-empty">Brak podsumowania.</p>';
      return;
    }
    const cards = [
      [s.physical_devices, "urządzeń"], [s.physical_links, "łączy"],
      [s.bgp_sessions, "sesji BGP"], [s.customer_vms + s.route_server_vms, "maszyn VM"],
    ];
    label.textContent = `Schemat ${s.schema_version} · ${s.topology.borders} border · ${s.topology.stems} stem · ${s.topology.spines} spine · ${s.topology.bolts} bolt`;
    for (const [name, value] of Object.entries({
      spines: s.topology.spines, bolts: s.topology.bolts,
      racks_per_bolt: s.topology.racks_per_bolt, hosts_per_rack: s.topology.hosts_per_rack,
      customer_vms: s.customer_vms,
    })) countForm.elements.namedItem(name).value = value;
    summaryEl.replaceChildren(...cards.map(([value, name]) => {
      const item = document.createElement("div");
      item.className = "dc-stat";
      const strong = document.createElement("strong");
      strong.textContent = String(value ?? 0);
      const caption = document.createElement("span");
      caption.textContent = name;
      item.append(strong, caption);
      return item;
    }));
  }

  function renderTrafficList() {
    const flows = state.model?.route_state?.traffic ?? [];
    trafficList.replaceChildren();
    if (!flows.length) {
      const note = document.createElement("span"); note.textContent = "Brak skonfigurowanych przepływów."; trafficList.append(note); return;
    }
    const label = document.createElement("strong"); label.textContent = "Przepływy:"; trafficList.append(label);
    for (const flow of flows) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "dc-flow-button";
      button.dataset.trafficId = flow.id;
      button.classList.toggle("active", (selected?.type === "traffic" && selected.id === flow.id)||selected?.presetID===flow.id);
      button.textContent = `${flow.id}${flow.reachable ? " · osiągalny" : " · brak trasy"}`;
      trafficList.append(button);
    }
  }

  function renderGraph() {
    root.querySelector("#dc-border-option").hidden = showUnderlay.checked;
    const model = state.model;
    if (!model) {
      graphEl.innerHTML = '<p class="dc-empty">Brak wygenerowanej topologii.</p>';
      return;
    }
    const positions = layout(model, {
      showInfraOnHosts: showInfraOnHosts.checked,
      collapseRouteServers: collapseRouteServers.checked,
      offsets: viewOffsets,
    });
    for (const node of model.nodes) if (!nodeVisible(node)) positions.entityPoints.delete(node.id);
    const svg = document.createElementNS(NS, "svg");
    const zoom = Number(zoomInput.value) / 100;
    svg.setAttribute("class", "dc-topology-svg");
    svg.setAttribute("viewBox", `0 0 ${positions.width} ${positions.height}`);
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", `Topologia fizyczna: ${model.nodes.length} urządzeń i ${model.physical_links.length} łączy`);
    svg.style.width = `${Math.ceil(positions.width * zoom)}px`;
    svg.style.height = `${Math.ceil(positions.height * zoom)}px`;

    currentPositions = positions;
    currentPacketSegments = packetSegments(model,positions,selectedPath());
    const nodeByID = new Map(model.nodes.map((node) => [node.id, node]));
    const interfaceByID = new Map(model.interfaces.map((iface) => [iface.id, iface]));
    const inspectedPaths = routePaths(model, routeHover??selected);
    root.querySelector("#dc-route-legend").hidden = !routeHover && selected?.type !== "route";
    illustration.streams = showRouteFlow.checked && !routeHover && selected?.type !== "route" ? routeFlowStreams(model, exploration.update)
      .filter(stream=>stream.steps.every(step=>positions.entityPoints.has(step.fromID)&&positions.entityPoints.has(step.toID))) : [];
    const playlistKey=illustration.streams.map(stream=>`${stream.route.id}/${stream.focused}/${stream.waves.length}`).join("|");
    if(playlistKey!==illustration.key) {illustration.key=playlistKey;illustration.startedAt=performance.now();}
    illustration.sequence = illustration.streams.flatMap(stream=>stream.waves);
    const illustrationIDs = new Set(illustration.sequence.flat().map((step) => step.sessionID));
    const groupLayer = svgElement("g", { class: "dc-groups", "aria-hidden": "true" });
    const rsLayer = svgElement("g", { class: "dc-rs-tiers", "aria-hidden": "true" });
    for (const group of model.groups) {
      const box = positions.groups.get(group.id);
      if (!box) continue;
      groupLayer.append(svgElement("rect", {
        ...box, "data-group-id": group.id,
        rx: 14, class: `dc-group-box ${group.kind === "bolt" ? "bolt" : "rack"}`,
      }));
      groupLayer.append(svgText(box.x + 10, box.y + 18, group.label, "dc-group-label"));
    }
    for (const tier of positions.rsTiers) {
      rsLayer.append(svgElement("rect", {
        x: tier.x, y: tier.y, width: tier.width, height: tier.height, rx: 14,
        class: `dc-rs-tier ${tier.role}`, "data-rs-role": tier.role, "data-served-bolt": tier.bolt ?? "",
      }));
      rsLayer.append(svgText(tier.x + 14, tier.y + 22, tier.label, "dc-rs-tier-label"));
    }
    const defs = svgElement("defs", {});
    const arrow = svgElement("marker", { id: "dc-flow-arrow", viewBox: "0 0 8 8", refX: 7, refY: 4, markerWidth: 5, markerHeight: 5, orient: "auto" });
    arrow.append(svgElement("path", { d: "M0 0 L8 4 L0 8Z", fill: "#d4b1fc" }));
    defs.append(arrow); svg.append(defs, groupLayer);

    for (const [label, y] of positions.rowLabels) {
      if (!showUnderlay.checked && label !== "HOSTY" && !(label === "BORDER" && keepBorders.checked)) continue;
      svg.append(svgText(12, y, label, "dc-row-label"));
    }

    const edgeLayer = svgElement("g", { class: "dc-edges" });
    if (showLinks.checked && showUnderlay.checked) {
      for (const link of model.physical_links) {
        const a = positions.nodes.get(link.a_node_id);
        const b = positions.nodes.get(link.b_node_id);
        if (!a || !b) continue;
        let selectedClass = selected?.type === "link" && selected.id === link.id ? " selected" : "";
        if (!routeHover && selected?.type === "traffic") {
          const flow = model.route_state?.traffic?.find((item) => item.id === selected.id);
          if (flow?.physical_link_ids.includes(link.id)) selectedClass += " flow-path";
        }
        if (!routeHover && selected?.type === "packet" && exploration.packet?.physical_link_ids.includes(link.id)) selectedClass += " flow-path";
        if (!routeHover && selected?.type === "session") {
          const path = model.route_state?.control_paths?.find((item) => item.session_id === selected.id);
          if (path?.physical_link_ids.includes(link.id)) selectedClass += " flow-path";
        }
        const group = svgElement("g", {
          class: `dc-edge${selectedClass}`, role: "button", tabindex: "0",
          "data-entity-type": "link", "data-entity-id": link.id,
          "aria-label": `Łącze ${nodeByID.get(link.a_node_id)?.label} — ${nodeByID.get(link.b_node_id)?.label}`,
        });
        const [start,end]=physicalPoints(a,b);
        const x1=start.x,y1=start.y,x2=end.x,y2=end.y;
        group.append(svgElement("line", { x1, y1, x2, y2, class: "dc-edge-hit" }));
        group.append(svgElement("line", { x1, y1, x2, y2, class: "dc-edge-line" }));
        edgeLayer.append(group);
      }
    }
    svg.append(edgeLayer);

    if (showSessions.checked || sessionHover) {
      const sessionLayer = svgElement("g", { class: "dc-sessions" });
      for (const session of model.bgp_sessions) {
        if(!showSessions.checked&&session.id!==sessionHover)continue;
        const step = illustration.sequence.flat().find((item) => item.sessionID === session.id);
        const a = positions.entityPoints.get(step?.fromID ?? session.a.entity_id);
        const b = positions.entityPoints.get(step?.toID ?? session.b.entity_id);
        if (!a || !b) continue;
        const selectedClass = (selected?.type === "session" && selected.id === session.id ? " selected" :
          "") +
          (illustrationIDs.has(session.id) ? " illustrative" : "") + (sessionHover===session.id?" preview":"");
        const group = svgElement("g", {
          class: `dc-session${selectedClass}`, role: "button", tabindex: "0",
          "data-entity-type": "session", "data-entity-id": session.id,
          "aria-label": `Sesja BGP ${session.a.label} — ${session.b.label}, ${session.families.map((family) => `${family.afi}/${family.safi}`).join(", ")}`,
        });
        const aY = a.y;
        const bY = b.y;
        group.append(svgElement("line", { x1: a.x, y1: aY, x2: b.x, y2: bY, class: "dc-session-hit" }));
        group.append(svgElement("line", { x1: a.x, y1: aY, x2: b.x, y2: bY, class: "dc-session-line" }));
        sessionLayer.append(group);
      }
      svg.append(sessionLayer);
    }

    const pathLayer = svgElement("g", {class:"dc-route-paths", "aria-hidden":"true"});
    const propagationLayer=svgElement("g",{class:"dc-route-propagation","aria-hidden":"true"});
    const pathDefs = svgElement("defs", {});
    const propagationSegments=[];
    for (const [kind, ids, color] of [["learned", inspectedPaths.learned, "#bc8aff"], ["points-to", inspectedPaths.pointsTo, "#ffe16a"]]) {
      const marker = svgElement("marker", {id:`dc-arrow-${kind}`,viewBox:"0 0 10 10",refX:9,refY:5,markerWidth:5,markerHeight:5,orient:"auto"});
      marker.append(svgElement("path",{d:"M 0 0 L 10 5 L 0 10 z",fill:color}));pathDefs.append(marker);
      for(let i=1;i<ids.length;i++) {
        const a=positions.entityPoints.get(ids[i-1]),b=positions.entityPoints.get(ids[i]);
        if(!a||!b||(a.x===b.x&&a.y===b.y))continue;
        const shift=kind==="learned"?-4:4;
        pathLayer.append(svgElement("line",{x1:a.x+shift,y1:a.y,x2:b.x+shift,y2:b.y,class:`dc-route-${kind}`,"marker-end":`url(#dc-arrow-${kind})`,"data-from":ids[i-1],"data-to":ids[i]}));
        if(kind==="learned")propagationSegments.push({a:{x:a.x+shift,y:a.y},b:{x:b.x+shift,y:b.y},from:ids[i-1],to:ids[i]});
      }
    }
    if(propagationSegments.length) {
      const arrow=svgElement("path",{class:"dc-route-propagation-marker",d:"M -6 -4 L 5 0 L -6 4 L -3 0 Z",
        "data-from":propagationSegments[0].from,"data-to":propagationSegments.at(-1).to});
      if(reducedMotion.matches) {
        const {a,b}=propagationSegments[0];
        arrow.setAttribute("transform",`translate(${(a.x+b.x)/2} ${(a.y+b.y)/2}) rotate(${Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI})`);
      } else {
        arrow.append(svgElement("animateMotion",{dur:`${Math.max(2,propagationSegments.length*.9)}s`,repeatCount:"indefinite",rotate:"auto",
          path:propagationSegments.map(({a,b})=>`M ${a.x} ${a.y} L ${b.x} ${b.y}`).join(" ")}));
      }
      propagationLayer.append(arrow);
    }
    svg.append(pathDefs,rsLayer,pathLayer);
    const nodeLayer = svgElement("g", { class: "dc-nodes" });
    const vmCountByHost = new Map();
    for (const vm of model.vms) vmCountByHost.set(vm.host_id, (vmCountByHost.get(vm.host_id) ?? 0) + 1);
    for (const node of model.nodes) {
      if (!nodeVisible(node)) continue;
      const point = positions.nodes.get(node.id);
      if (!point) continue;
      const selectedClass = (selected?.type === "node" && selected.id === node.id ? " selected" : "") + endpointClass(node.id);
      const group = svgElement("g", {
        class: `dc-node ${node.kind}${selectedClass}`, transform: `translate(${point.x} ${point.y})`,
        role: "button", tabindex: "0", "data-entity-type": "node", "data-entity-id": node.id,
        "aria-label": `${kindLabels[node.kind] ?? node.kind}: ${node.label}`,
        "aria-description": "Enter: szczegóły. Strzałki: przesuń. Home: przywróć pozycję.",
      });
      group.append(svgElement("rect", { x: -point.width / 2, y: -point.height / 2, width: point.width, height: point.height, rx: 9 }));
      const labelY = node.kind === "host" ? point.height / 2 - 25 : -2;
      group.append(svgText(0, labelY, node.label, "dc-node-label"));
      group.append(svgText(0, labelY + 16, node.kind === "host" ? `${vmCountByHost.get(node.id) ?? 0} VM · ${node.interface_ids.length} interfejsy` : `AS ${node.asn}`, "dc-node-subtitle"));
      nodeLayer.append(group);
    }
    svg.append(nodeLayer);

    if (!routeHover && selected?.type === "packet" && exploration.packet?.reachable && showLinks.checked) {
      const localLayer = svgElement("g", { class: "dc-local-paths", "aria-hidden": "true" });
      for (const link of model.local_links ?? []) {
        if (![exploration.packet.from_id, exploration.packet.to_id].includes(link.vm_id)) continue;
        const host = positions.entityPoints.get(link.host_id), vm = positions.entityPoints.get(link.vm_id);
        if (host && vm) {
          const [a,b]=tapPoints(host,vm);
          localLayer.append(svgElement("line", {x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:"dc-local-path", "data-tap-id":link.tap_interface_id}));
        }
      }
      svg.append(localLayer);
    }

    if(!routeHover&&showLinks.checked)for(const segment of currentPacketSegments) {
      const [a,b]=segment.points;
      svg.append(svgElement("line",{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:"dc-packet-track","data-from":segment.from,"data-to":segment.to,"aria-hidden":"true"}));
    }
    const vmLayer = svgElement("g", { class: "dc-vms" });
    for (const item of positions.displayItems) {
      const point = positions.displayPoints.get(item.id);
      if (!point) continue;
      const selectedClass = (selected?.type === item.entityType && selected.id === item.id ? " selected" : "") + endpointClass(item.id);
      const group = svgElement("g", {
        class: `dc-vm ${item.role}${item.entityType === "cluster" ? " cluster" : ""}${selectedClass}`, transform: `translate(${point.x} ${point.y})`,
        role: "button", tabindex: "0", "data-entity-type": item.entityType, "data-entity-id": item.id,
        "data-host-id": item.hostID, "data-on-host": item.onHost,
        "aria-label": displayNames(`${item.label}${item.onHost ? `, host ${item.hostID}` : ", widok abstrakcyjny"}`),
        "aria-description": "Enter: szczegóły. Strzałki: przesuń. Home: przywróć pozycję.",
      });
      group.append(svgElement("rect", { x: -47, y: -12, width: 94, height: 24, rx: 7 }));
      group.append(svgText(0, 4, item.label, "dc-vm-label"));
      vmLayer.append(group);
    }
    svg.append(vmLayer,propagationLayer);
    svg.append(svgElement("circle", { id: "dc-packet-marker", class: "dc-packet-marker", r: 7, visibility: "hidden" }));
    const markerCount=Math.max(1,...illustration.sequence.map(wave=>wave.length));
    for(let index=0;index<markerCount;index++) {
      const routeMarker=svgElement("circle",{...(index===0?{id:"dc-route-marker"}:{}),class:"dc-route-marker",r:5,visibility:"hidden"});
      routeMarker.append(svgElement("title",{}));svg.append(routeMarker);
    }
    graphEl.replaceChildren(svg);
    updateAnimationMarker();
    updatePlaybackControls();
    syncIllustration();
    positionDeviceMenu();
  }

  function renderInspector(nodeByID, interfaceByID) {
    if(routeHover||sessionHover) {clearRoutePreview();renderGraph();}
    root.querySelector("#dc-inspector-back").disabled = !inspectorHistory.length;
    const key = selected ? `${selected.type}/${selected.id}/${selected.ownerID??""}` : "";
    const keep = key === inspectorSelectionKey;
    const sectionKey = (item) => {
      const path = [];
      for (let current = item; current && detailsEl.contains(current); current = current.parentElement.closest("details")) path.unshift(current.querySelector(":scope > summary")?.textContent.split(" · ")[0]);
      return path.join("/");
    };
    const sections = keep ? new Map([...detailsEl.querySelectorAll("details")].map((item) => [sectionKey(item), item.open])) : new Map();
    const scroll = keep ? detailsEl.scrollTop : 0;
    renderInspectorContent(nodeByID, interfaceByID);
    const textNodes=document.createTreeWalker(detailsEl,NodeFilter.SHOW_TEXT);
    while(textNodes.nextNode())textNodes.currentNode.nodeValue=displayNames(textNodes.currentNode.nodeValue);
    for (const item of detailsEl.querySelectorAll("details")) {
      const body=document.createElement("div");body.className="dc-disclosure-body";
      for(const child of [...item.childNodes])if(child.nodeName!=="SUMMARY")body.append(child);
      item.append(body);
    }
    for (const item of detailsEl.querySelectorAll("details")) {
      if (sections.has(sectionKey(item))) item.open = sections.get(sectionKey(item));
    }
    detailsEl.scrollTop = scroll;
    clampPopup();
    inspectorSelectionKey = key;
    revealPacketSection();
  }

  function fitGraph() {
    if (!currentPositions) return;
    zoomInput.value = String(Math.max(50, Math.min(150, Math.floor((graphEl.clientWidth - 16) / currentPositions.width * 100 / 5) * 5)));
    onZoom();
    graphEl.scrollTo({ top: 0, left: 0 });
  }

  function renderInspectorContent(nodeByID, interfaceByID) {
    if (!state.model || !selected) inspectorEl.hidden = true;
    if (!state.model) {
      detailsEl.innerHTML = "<p>Wybierz urządzenie lub łącze po wczytaniu modelu.</p>";
      return;
    }
    if (!selected) {
      detailsEl.innerHTML = "<p>Wybierz urządzenie lub łącze na diagramie. Adresy są fikcyjne; tablice przedstawiają oczekiwany stan.</p>";
      return;
    }
    if (["update", "packet"].includes(selected.type)) {
      const kind = selected.type;
      appendInspectorTitle(kind === "update" ? "Przepływ trasy · BGP UPDATE" : "Pakiet i droga między urządzeniami", kind === "update" ? exploration.update?.route?.id ?? "UPDATE" : exploration.packet?.route_id ?? "ICMP");
      if (exploreErrors[kind]) { appendHiddenNote(exploreErrors[kind]); return; }
      if (kind === "update") appendUpdateInspection(detailsEl, exploration.update, state.model, trafficReasonText);
      else appendPacketInspection(detailsEl, exploration.packet, trafficReasonText);
      return;
    }
    if (selected.type === "node") {
      const node = (nodeByID ?? new Map(state.model.nodes.map((item) => [item.id, item]))).get(selected.id);
      if (!node) { selected = null; return renderInspector(); }
      appendInspectorTitle(`${kindLabels[node.kind] ?? node.kind} · ${node.label}`, node.id);
      const identity = [`ASN ${node.asn}`, `IPv4 ${node.ipv4}`, `IPv6 ${node.ipv6}`];
      if (node.bolt_id) identity.push(`Bolt ${node.bolt_id}`);
      if (node.rack_id) identity.push(`Rack ${node.rack_id}`);
      if (node.host_id) identity.push(`Host ID ${node.host_id}`);
      const list = document.createElement("ul");
      list.className = "dc-inspector-list";
      for (const value of identity) { const li = document.createElement("li"); li.textContent = value; list.append(li); }
      const interfaces = document.createElement("details");
      interfaces.className = "dc-interface-details";
      const summary = document.createElement("summary"); summary.textContent = `Interfejsy (${node.interface_ids.length + (node.local_interface_ids?.length ?? 0)}) · TAP ${node.local_interface_ids?.length ?? 0}`;
      interfaces.append(summary);
      for (const id of [...node.interface_ids, ...(node.local_interface_ids ?? [])]) {
        const iface = (interfaceByID ?? new Map([...state.model.interfaces, ...(state.model.local_interfaces ?? [])].map((item) => [item.id, item]))).get(id);
        if (!iface) continue;
        const row = document.createElement("p");
        row.textContent = `${iface.name} ↔ ${iface.peer_node_id}: ${iface.kind === "tap" ? `TAP · ${iface.vpc_id ? `VPC ${iface.vpc_id}` : "infra"} · port lokalny bez adresu L3` : formatAddress(iface)}`;
        interfaces.append(row);
      }
      detailsEl.append(list, interfaces);
      if (node.kind === "host") {
        const hosted = state.model.vms.filter((vm) => vm.host_id === node.id);
        const vmDetails = document.createElement("details");
        vmDetails.className = "dc-interface-details";
        const vmSummary = document.createElement("summary"); vmSummary.textContent = `Maszyny wirtualne (${hosted.length})`;
        vmDetails.append(vmSummary);
        for (const vm of hosted) {
          const row = document.createElement("p"); row.textContent = `${vm.label} · ${vm.ipv4} · ${vm.ipv6}`;
          vmDetails.append(row);
        }
        detailsEl.append(vmDetails);
      }
      appendEndpointSessions(detailsEl, state.model, node.id);
      appendSpeakerTableOrLoading(detailsEl, node.id);
      if (node.kind === "host") {
        if (inspectorLoaded.has(`${modelRevision}/speaker/${node.id}`)) {
          appendFIB(detailsEl, state.model, node.id, "Tablica forwarding hosta", root.querySelector("#dc-rib-view").value, appendRouteRows);
        } else {
        appendInspectorLoading(detailsEl, "speaker", node.id);
        }
      }
      return;
    }
    if (selected.type === "vm") {
      const vm = state.model.vms.find((item) => item.id === selected.id);
      if (!vm) { selected = null; return renderInspector(); }
      appendInspectorTitle(`${vm.label} · ${vm.role === "customer" ? "VM klienta" : "infrastruktura"}`, vm.id);
      if (collapseRouteServers.checked && vm.role !== "customer") {
        const hidden = document.createElement("p");
        hidden.textContent = "Ten członek jest ukryty w widoku klastra RS; jego model i sesje pozostają bez zmian.";
        detailsEl.append(hidden);
      }
      const values = [
        `Host: ${vm.host_id} (bolt ${vm.host_bolt_id}, rack ${vm.host_rack_id})`,
        `ASN: ${vm.asn}`, `IPv4: ${vm.ipv4}`, `IPv6: ${vm.ipv6}`,
      ];
      if (vm.vpc_id) values.push(`VPC: ${vm.vpc_id}`);
      if (vm.served_bolt) values.push(`Obsługiwany bolt: ${vm.served_bolt}`);
      if (vm.cluster_id) values.push(`Klaster: ${vm.cluster_id}, członek ${vm.member}`);
      values.push(`Umieszczenie: ${vm.explicit_placement ? "jawne w YAML" : "deterministyczne"}`);
      const list = document.createElement("ul"); list.className = "dc-inspector-list";
      for (const value of values) { const li = document.createElement("li"); li.textContent = value; list.append(li); }
      detailsEl.append(list);
      const attachment = state.model.local_links?.find((item) => item.vm_id === vm.id);
      if (attachment) {
        const tap = state.model.local_interfaces.find((item) => item.id === attachment.tap_interface_id);
        const nic = document.createElement("p"); nic.className = "dc-local-interface";
        nic.textContent = `eth0 ${vm.ipv4}/32 · ${vm.ipv6}/128 ↔ ${tap.name} na ${vm.host_id}${vm.vpc_id ? ` · VPC ${vm.vpc_id}` : " · infra"}`;
        detailsEl.append(nic);
      }
      appendEndpointSessions(detailsEl, state.model, vm.id);
      appendSpeakerTableOrLoading(detailsEl, vm.id);
      if (vm.role === "customer") {
        if (inspectorLoaded.has(`${modelRevision}/speaker/${vm.id}`)) {
          appendFIB(detailsEl, state.model, vm.id, "Widok forwarding VPC (NVE hosta; nie tabela systemu gościa)", root.querySelector("#dc-rib-view").value, appendRouteRows);
        } else {
          appendInspectorLoading(detailsEl, "speaker", vm.id);
        }
      }
      return;
    }
    if (selected.type === "cluster") {
      const members = state.model.vms.filter((vm) => vm.cluster_id === selected.id).sort((a, b) => a.member - b.member);
      if (!members.length) { selected = null; return renderInspector(); }
      appendInspectorTitle(`Klaster RS · ${members[0].cluster_id}`, `${members.length} członków`);
      if (!collapseRouteServers.checked) appendHiddenNote("Widok klastra jest rozwinięty; członkowie są pokazani osobno.");
      const summary = document.createElement("p");
      summary.textContent = "To zgrupowanie zmienia tylko rysunek. Członkowie zachowują rzeczywiste umieszczenie, adresy i sesje BGP.";
    detailsEl.append(summary);
      for (const vm of members) {
        const section = document.createElement("details"); section.className = "dc-interface-details";
        const heading = document.createElement("summary"); heading.textContent = `${vm.label} · ${vm.host_id}`;
        const body = document.createElement("p"); body.textContent = `ASN ${vm.asn} · ${vm.ipv4} · ${vm.ipv6}${vm.served_bolt ? ` · obsługuje bolt ${vm.served_bolt}` : ""}`;
        section.append(heading, body);
        appendEndpointSessions(section, state.model, vm.id);
        detailsEl.append(section);
        appendSpeakerTableOrLoading(section, vm.id);
      }
      return;
    }
    if (selected.type === "session") {
      const session = state.model.bgp_sessions.find((item) => item.id === selected.id);
      if (!session) { selected = null; return renderInspector(); }
      appendInspectorTitle("Sesja BGP", session.id);
      if (!showSessions.checked) appendHiddenNote("Warstwa sesji BGP jest obecnie ukryta.");
      const summary = document.createElement("p");
      summary.textContent = `${session.a.label} (AS ${session.a.asn}) ↔ ${session.b.label} (AS ${session.b.asn}) · ${session.state}`;
      const transport = document.createElement("p");
      transport.textContent = `Transport: ${session.transport} · ${session.a.address} ↔ ${session.b.address}`;
      const families = document.createElement("ul"); families.className = "dc-inspector-list";
      for (const family of session.families) {
        const li = document.createElement("li");
        li.textContent = `${family.afi}/${family.safi}${family.route_types?.length ? ` · Type ${family.route_types.join(", ")}` : ""}`;
        families.append(li);
      }
      detailsEl.append(summary, transport, families);
      if (inspectorLoaded.has(`${modelRevision}/session/${session.id}`)) {
        appendSessionRoutes(detailsEl, state.model, session);
      } else {
        appendInspectorLoading(detailsEl, "session", session.id);
      }
      const controlPath = state.model.route_state?.control_paths?.find((item) => item.session_id === session.id);
      if (controlPath) appendControlPath(detailsEl, session, controlPath, state.model);
      return;
    }
    if (selected.type === "route") {
      const route = state.model.route_state?.origins?.find((item) => item.id === selected.id);
      if (!route) { selected = null; return renderInspector(); }
      appendInspectorTitle(route.protocol==="static"?"Trasa statyczna i droga wyjścia":"Trasa w wybranym RIB", `${route.prefix} · ${route.id}`);
      const paths = routePaths(state.model, selected);
      const identity = document.createElement("p");
      identity.textContent = `${route.afi}/${route.safi}${route.route_type ? ` Type ${route.route_type}` : ""} · origin ${route.origin_id} (${route.origin_label}) · next hop ${paths.nextHop??route.next_hop} · AS ${route.origin_asn}`;
      if(route.protocol==="static")identity.textContent=`${route.afi}/${route.safi} · statyczna · next hop ${paths.nextHop??route.next_hop} · ${route.origin_label}`;
      const context = document.createElement("p");
      context.textContent = route.vpc_id
        ? `VPC ${route.vpc_id} · RD ${route.rd} · RT ${route.route_target} · VNI ${route.vni}`
        : "Underlay · bez kontekstu VPC/VNI";
      detailsEl.append(identity, context);
      const provenance = document.createElement("div"); provenance.className="dc-route-provenance";
      const learned=document.createElement("p");learned.className="learned";learned.textContent=`Fioletowy · RIB ${paths.owner??""}: ${paths.learned.length>1?paths.learned.join(" → "):"trasa lokalna / brak drogi uczenia"}`;
      const target=document.createElement("p");target.className="points-to";target.textContent=`Żółty · next hop ${paths.nextHop??route.next_hop}: ${paths.pointsTo.join(" → ")||"brak rozwiązanej drogi"}`;
      provenance.append(learned,target);detailsEl.append(provenance);
      if(route.protocol==="static") {
        const note=document.createElement("p");note.textContent="Trasa statyczna — nie jest ogłaszana przez BGP.";detailsEl.append(note);
      }
      const candidate=paths.candidate;
      if(candidate) {
        const attributes=document.createElement("p");
        const received=candidate.received_from??candidate.from_id;
        attributes.textContent=`RIB ${paths.owner??route.origin_id}${received!==undefined?` · od ${received||"lokalna"}`:""}${candidate.as_path?` · AS_PATH ${candidate.as_path.join(" ")||"pusta"}`:""}${candidate.local_preference!==undefined?` · LP ${candidate.local_preference}`:""}${candidate.med!==undefined?` · MED ${candidate.med}`:""}`;
        if(route.protocol!=="static")detailsEl.append(attributes);
      }
      return;
    }
    if (selected.type === "traffic") {
      const flow = state.model.route_state?.traffic?.find((item) => item.id === selected.id);
      if (!flow) { selected = null; return renderInspector(); }
      appendInspectorTitle(`Przepływ danych · ${flow.id}`, flow.route_id ?? flow.reason ?? flow.id);
      const status = document.createElement("p");
      status.textContent = flow.reachable ? `Osiągalny · VPC ${flow.vpc_id} · ${flow.destination_prefix}` : `Nieosiągalny · ${trafficReasonText(flow.reason)}`;
      const hops = document.createElement("p");
      hops.textContent = `Warstwa logiczna: ${flow.logical_hops.join(" → ") || "brak ścieżki"}`;
      const physical = document.createElement("p");
      physical.textContent = `Warstwa fizyczna: ${flow.physical_node_ids.join(" → ") || "brak ścieżki"}`;
      const detail = document.createElement("p");
      detail.textContent = `${flow.vxlan ? `VXLAN VNI ${flow.vni}` : "Dostarczenie lokalne"} · ${flow.underlay_cost} hopów · ${flow.equal_cost_path_count} równokosztowych ścieżek · wybrano ${flow.selected_path_index + 1}`;
      detailsEl.append(status, hops, physical, detail);
      if (flow.ecmp_next_hops?.length) {
        const choices = document.createElement("p"); choices.textContent = `ECMP next hops: ${flow.ecmp_next_hops.join(", ")}`; detailsEl.append(choices);
      }
      return;
    }
    const link = state.model.physical_links.find((item) => item.id === selected.id);
    if (!link) { selected = null; return renderInspector(); }
    const nodes = nodeByID ?? new Map(state.model.nodes.map((item) => [item.id, item]));
    const ifaces = interfaceByID ?? new Map(state.model.interfaces.map((item) => [item.id, item]));
    appendInspectorTitle(`Łącze fizyczne`, link.id);
    if (!showLinks.checked) appendHiddenNote("Warstwa łączy fizycznych jest obecnie ukryta.");
    const a = nodes.get(link.a_node_id), b = nodes.get(link.b_node_id);
    const aIf = ifaces.get(link.a_interface_id), bIf = ifaces.get(link.b_interface_id);
    const description = document.createElement("p");
    description.textContent = `${a?.label ?? link.a_node_id} ↔ ${b?.label ?? link.b_node_id}${link.unnumbered ? " · bez adresacji globalnej" : ""}`;
    const addresses = document.createElement("p");
    addresses.textContent = `${aIf?.name}: ${formatAddress(aIf)} · ${bIf?.name}: ${formatAddress(bIf)}`;
    detailsEl.append(description, addresses);
  }

  function appendInspectorTitle(title, id) {
    const heading = document.createElement("h3"); heading.id = "dc-inspector-heading"; heading.textContent = title;
    const code = document.createElement("code"); code.textContent = id;
    detailsEl.replaceChildren(heading, code);
  }

  function appendHiddenNote(message) {
    const note = document.createElement("p"); note.className = "dc-hidden-note"; note.textContent = message;
    detailsEl.append(note);
  }

  setState({});
  send({ type: "initialize" });
  return {
    send,
    setState,
    destroy() {
      destroyed = true;
      packetReveal = null;
      clearRoutePreview();
      cancelResize();
      endDrag(null, true);
      if (dragFrame) cancelAnimationFrame(dragFrame);
      events.abort();
      if (configDialog.open) configDialog.close();
      if (animation.frame) cancelAnimationFrame(animation.frame);
      if (illustration.frame) cancelAnimationFrame(illustration.frame);
      root.replaceChildren();
    },
  };
}

function boundedOffset(x, y, bounds) {
  const scale = Math.min(1, 48 / (Math.hypot(x, y) || 1));
  return {
    x: Math.max(bounds?.left ?? -48, Math.min(bounds?.right ?? 48, x * scale)),
    y: Math.max(bounds?.top ?? -48, Math.min(bounds?.bottom ?? 48, y * scale)),
  };
}

function layout(model, options) {
  const t = model.config.topology;
  const rackWidth = 252, rackGap = 16, boltPadding = 16, boltGap = 32;
  const blockWidth = Math.max(t.racks_per_bolt * rackWidth + (t.racks_per_bolt - 1) * rackGap + boltPadding * 2, t.leaves_per_bolt * 116 + 32);
  const fabricWidth = t.bolts * blockWidth + (t.bolts - 1) * boltGap;
  const width = Math.max(1040, fabricWidth + 160, !options.showInfraOnHosts ? (t.borders - 1) * 124 + 862 : 0);
  const margin = (width - fabricWidth) / 2;
  const nodes = new Map();
  const offsetBounds = new Map();
  const groups = new Map();
  const rsTiers = [];
  const displayPoints = new Map();
  const entityPoints = new Map();
  const displayItems = makeDisplayItems(model.vms, options.collapseRouteServers);
  const hostedCounts = new Map();
  for (const item of displayItems) {
    item.onHost = item.role === "customer" || options.showInfraOnHosts;
    if (item.onHost) hostedCounts.set(item.hostID, (hostedCounts.get(item.hostID) ?? 0) + 1);
  }
  const abstract = displayItems.some((item) => !item.onHost);
  const spineY = abstract ? 340 : 250, leafY = abstract ? 545 : 350;
  const rackTop = leafY + 65, torY = rackTop + 55, hostTop = torY + 60;
  const hostHeight = (id) => Math.max(80, (hostedCounts.get(id) ?? 0) * 28 + 52);
  const maxHostHeight = Math.max(80, ...model.nodes.filter((node) => node.kind === "host").map((node) => hostHeight(node.id)));
  const hostRowGap = maxHostHeight + 28;
  const rackBottom = hostTop + (Math.ceil(t.hosts_per_rack / 2) - 1) * hostRowGap + maxHostHeight + 26;

  // Reserve disjoint cells before applying visual offsets. A small drag stays
  // inside its cell and group; neither neighboring outlines nor VM badges cross.
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const placeNode = (node, x, y, bounds, nodeWidth = 94, nodeHeight = 44) => {
    const offset = options.offsets?.get(node.id) ?? { x: 0, y: 0 };
    offsetBounds.set(node.id, bounds);
    nodes.set(node.id, {
      x: x + clamp(offset.x, bounds?.left ?? -48, bounds?.right ?? 48),
      y: y + clamp(offset.y, bounds?.top ?? -48, bounds?.bottom ?? 48),
      width: nodeWidth, height: nodeHeight,
    });
  };
  const tiers = [
    ["border", 70], ["stem", 160], ["spine", spineY],
  ];
  for (const [kind, y] of tiers) {
    const members = model.nodes.filter((node) => node.kind === kind).sort((a, b) => a.role_index - b.role_index);
    const span = kind === "spine" ? fabricWidth - 120 : (members.length - 1) * 124;
    const bounds = abstract && kind === "stem" ? { top: -12, bottom: 12 } : abstract && kind === "spine" ? { top: -4, bottom: 8 } : undefined;
    evenPositions(members, (width - span) / 2, (width + span) / 2).forEach((x, index) => placeNode(members[index], x, y, bounds));
  }
  for (let bolt = 1; bolt <= t.bolts; bolt++) {
    const start = margin + (bolt - 1) * (blockWidth + boltGap);
    const end = start + blockWidth;
    groups.set(`bolt-${bolt}`, { x: start, y: leafY - 46, width: blockWidth, height: rackBottom + 16 - (leafY - 46) });
    const leaves = model.nodes.filter((node) => node.kind === "leaf" && node.bolt_id === bolt).sort((a, b) => a.role_index - b.role_index);
    const leafCell = blockWidth / leaves.length;
    leaves.forEach((node, index) => placeNode(node, start + leafCell * (index + .5), leafY, {
      left: -Math.min(48, leafCell / 2 - 55), right: Math.min(48, leafCell / 2 - 55), top: -4, bottom: 20,
    }));
    if (abstract) rsTiers.push({ role: "rs_bolt", bolt, label: `RS Bolt · Bolt ${bolt}`, x: (start + end) / 2 - 120, y: leafY - 164, width: 240, height: 108 });
    const rackStartX = (start + end - t.racks_per_bolt * rackWidth - (t.racks_per_bolt - 1) * rackGap) / 2;
    for (let rack = 1; rack <= t.racks_per_bolt; rack++) {
      const rackStart = rackStartX + (rack - 1) * (rackWidth + rackGap);
      const rackEnd = rackStart + rackWidth;
      const tors = model.nodes.filter((node) => node.kind === "tor" && node.bolt_id === bolt && node.rack_id === rack).sort((a, b) => a.role_index - b.role_index);
      groups.set(tors[0].group_id, { x: rackStart, y: rackTop, width: rackWidth, height: rackBottom - rackTop });
      const hosts = model.nodes.filter((node) => node.kind === "host" && node.bolt_id === bolt && node.rack_id === rack).sort((a, b) => a.host_id - b.host_id);
      const columns = [rackStart + 64, rackEnd - 64];
      tors.forEach((node, index) => placeNode(node, columns[index], torY, { left: -10, right: 10, top: -8, bottom: 20 }));
      hosts.forEach((host, index) => {
        const row = Math.floor(index / 2);
        const centered = hosts.length === 1 || hosts.length === 3 && index === 2;
        const x = centered ? (rackStart + rackEnd) / 2 : columns[index % 2];
        const height = hostHeight(host.id);
        placeNode(host, x, hostTop + row * hostRowGap + height / 2, {
          left: centered ? -48 : -8, right: centered ? 48 : 8, top: -12, bottom: 12,
        }, 104, height);
      });
    }
  }
  if (abstract) {
    rsTiers.push({ role: "rs_ctrl", label: "RS Ctrl · klaster", x: width / 2 - 120, y: 202, width: 240, height: 108 });
    rsTiers.push({ role: "rs_user", label: "RS User · klaster", x: width - 320, y: 24, width: 240, height: 108 });
  }
  const hostCounts = new Map();
  for (const item of displayItems) {
    if (!item.onHost) continue;
    const index = hostCounts.get(item.hostID) ?? 0;
    hostCounts.set(item.hostID, index + 1);
    const host = nodes.get(item.hostID);
    if (!host) continue;
    const offset = options.offsets?.get(item.id) ?? { x: 0, y: 0 };
    offsetBounds.set(item.id, { left: -4, right: 4, top: -1, bottom: 1 });
    displayPoints.set(item.id, { x: host.x + clamp(offset.x, -4, 4), y: host.y - host.height / 2 + 24 + index * 28 + clamp(offset.y, -1, 1) });
  }
  for (const tier of rsTiers) {
    const items = displayItems.filter((item) => !item.onHost && item.role === tier.role && (tier.role !== "rs_bolt" || item.members[0].served_bolt === tier.bolt));
    items.forEach((item, index) => {
      const offset = options.offsets?.get(item.id) ?? { x: 0, y: 0 };
      offsetBounds.set(item.id, { left: -7, right: 7, top: -3, bottom: 3 });
      displayPoints.set(item.id, {
        x: tier.x + tier.width / 2 + (items.length === 1 ? 0 : (index % 2 === 0 ? -55 : 55)) + clamp(offset.x, -7, 7),
        y: tier.y + (items.length === 1 ? 66 : 50 + Math.floor(index / 2) * 32) + clamp(offset.y, -3, 3),
      });
    });
  }
  for (const node of model.nodes) entityPoints.set(node.id, nodes.get(node.id));
  for (const item of displayItems) {
    const point = displayPoints.get(item.id);
    for (const vm of item.members) entityPoints.set(vm.id, point);
  }
  const rowLabels = [["BORDER", 74], ["STEM", 164], ["SPINE", spineY + 4], ["LEAF", leafY + 4], ["TOR", torY + 4], ["HOSTY", hostTop + 24]];
  return { nodes, groups, rsTiers, rowLabels, offsetBounds, displayPoints, entityPoints, displayItems, width, height: rackBottom + 44 };
}

function makeDisplayItems(vms, collapseRouteServers) {
  const order = { customer: 0, rs_bolt: 1, rs_ctrl: 2, rs_user: 3 };
  const sorted = [...vms].sort((a, b) => {
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    if (a.cluster_id !== b.cluster_id) return (a.cluster_id ?? "").localeCompare(b.cluster_id ?? "");
    return (a.member ?? Number(a.id.split("-").at(-1))) - (b.member ?? Number(b.id.split("-").at(-1)));
  });
  const items = [];
  if (!collapseRouteServers) {
    return sorted.map((vm) => ({
      id: vm.id, entityType: "vm", role: vm.role, label: vmShortLabel(vm),
      hostID: vm.host_id, members: [vm],
    }));
  }
  const clusters = new Map();
  for (const vm of sorted) {
    if (vm.role === "customer") {
      items.push({ id: vm.id, entityType: "vm", role: vm.role, label: vmShortLabel(vm), hostID: vm.host_id, members: [vm] });
      continue;
    }
    if (!clusters.has(vm.cluster_id)) clusters.set(vm.cluster_id, []);
    clusters.get(vm.cluster_id).push(vm);
  }
  for (const [clusterID, members] of clusters) {
    const first = members[0];
    const label = first.role === "rs_bolt" ? `Bolt ${first.served_bolt} ×${members.length}` : `${first.role === "rs_ctrl" ? "Ctrl" : "User"} ×${members.length}`;
    items.push({ id: clusterID, entityType: "cluster", role: first.role, label, hostID: first.host_id, members });
  }
  return items.sort((a, b) => {
    if (a.role !== b.role) return order[a.role] - order[b.role];
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

function evenPositions(items, left, right) {
  if (items.length === 1) return [(left + right) / 2];
  if (items.length === 0) return [];
  return items.map((_, index) => left + (right - left) * index / (items.length - 1));
}

function svgElement(tag, attrs) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

function svgText(x, y, value, className) {
  const element = svgElement("text", { x, y, class: className, "text-anchor": "middle" });
  element.textContent = value;
  return element;
}

function formatAddress(iface) {
  if (!iface) return "brak";
  const addresses = [];
  if (iface.ipv4_address) addresses.push(`${iface.ipv4_address}/${iface.ipv4_prefix}`);
  if (iface.ipv6_address) addresses.push(`${iface.ipv6_address}/${iface.ipv6_prefix}`);
  if (iface.link_local_ipv6) addresses.push(`${iface.link_local_ipv6} (link-local)`);
  return addresses.length ? addresses.join(", ") : "unnumbered";
}

function vmShortLabel(vm) {
  if (vm.role === "customer") return `Klient ${vm.id.slice("customer-".length)}`;
  return vm.label;
}

function appendSessionRoutes(container, model, session) {
  const entries = model.route_state?.advertisements?.filter((item) => item.session_id === session.id) ?? [];
  for (const [title, routes] of [
    [`${session.a.label} → ${session.b.label}`, entries.filter((item) => item.from_id === session.a.entity_id && item.to_id === session.b.entity_id)],
    [`${session.b.label} → ${session.a.label}`, entries.filter((item) => item.from_id === session.b.entity_id && item.to_id === session.a.entity_id)],
  ]) {
    const details = document.createElement("details"); details.className = "dc-interface-details";
    const summary = document.createElement("summary"); summary.textContent = `${title} · ${routes.length}`;
    details.append(summary); appendRouteRows(details, routes); container.append(details);
  }
}

function appendControlPath(container, session, path, model) {
  const details = document.createElement("details"); details.className = "dc-interface-details";
  const summary = document.createElement("summary"); summary.textContent = "Fizyczna droga pakietu BGP";
  const endpoints = document.createElement("p");
  endpoints.textContent = `Jedna sesja logiczna: ${session.a.label} → ${session.b.label} · ${session.transport}`;
  const physical = document.createElement("p");
  physical.textContent = path.reachable ? `Węzły underlay: ${path.physical_node_ids.join(" → ") || "obie końcówki na tym samym hoście"}` : `Brak drogi: ${trafficReasonText(path.reason)}`;
  const links = document.createElement("p"); links.textContent = `Łącza fizyczne: ${path.physical_link_ids.join(", ") || "brak"}`;
  details.append(summary, endpoints, physical, links);
  const header = document.createElement("p");
  header.textContent = `Nagłówek transportu: IPv6 ${session.a.address} → ${session.b.address} · TCP 49152 → 179. Port źródłowy i Hop Limit 64 są poglądowe; UPDATE można rozwinąć w eksportach sesji.`;
  details.append(header);
  appendBGPBits(details, session);
  for (const endpoint of [session.a, session.b]) {
    const local = model.local_links?.find((item) => item.vm_id === endpoint.entity_id);
    if (!local) continue;
    const tap = model.local_interfaces.find((item) => item.id === local.tap_interface_id);
    const attachment = document.createElement("p"); attachment.textContent = `${endpoint.label}: eth0 ↔ ${tap.name} na ${local.host_id}`; details.append(attachment);
  }
  if (path.ecmp_next_hops?.length) {
    const ecmp = document.createElement("p"); ecmp.textContent = `Równokosztowe next hops: ${path.ecmp_next_hops.join(", ")}`; details.append(ecmp);
  }
  container.append(details);
}

function trafficReasonText(reason) {
  const messages = {
    "cross-vpc-not-permitted": "ruch między VPC jest zabroniony",
    "no-matching-vpc-route": "brak pasującej trasy w tej VPC",
    "unresolved-underlay-next-hop": "next hop nie jest osiągalny w underlay",
    "destination-vm-not-found": "VM docelowa nie istnieje",
    "no-expected-advertisement-path": "brak oczekiwanych eksportów tej trasy między wybranymi końcami",
    "tenant-target-not-supported": "VM klienta wymaga celu w tej samej VPC albo statycznej trasy do border; nie ma trasy do tego celu w underlay",
    "endpoint-address-unavailable": "wybrany koniec nie ma adresu w tej rodzinie IP",
  };
  return messages[reason] ?? reason ?? "nieznana przyczyna";
}

function appendEndpointSessions(container, model, entityID) {
  const sessions = model.bgp_sessions.filter((session) => session.a.entity_id === entityID || session.b.entity_id === entityID);
  const details = document.createElement("details"); details.className = "dc-interface-details";
  const summary = document.createElement("summary"); summary.textContent = `Sesje BGP (${sessions.length})`;
  details.append(summary);
  for (const session of sessions) {
    const peer = session.a.entity_id === entityID ? session.b : session.a;
    const button = document.createElement("button");
    button.type = "button"; button.className = "dc-inspector-link";
    button.dataset.sessionId = session.id;
    const routeCount = model.route_state?.advertisement_counts?.[session.id] ?? 0;
    button.textContent = `${peer.label} · ${session.families.map((family) => `${family.afi}/${family.safi}`).join(", ")} · ${routeCount} ogłoszeń`;
    details.append(button);
  }
  container.append(details);
}

function appendRouteRows(container, entries, simple = false, ownerID = "") {
  if (!entries?.length) {
    const empty = document.createElement("p"); empty.textContent = "Brak tras."; container.append(empty); return;
  }
  for (const route of entries) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dc-route-row";
    identifyRoute(row, route, ownerID);
    row.setAttribute("aria-label", `Wybierz trasę ${route.prefix}`);
    const prefix = route.prefix;
    const vpc = route.vpc_id ? ` · VPC ${route.vpc_id}` : "";
    const nextHop = route.next_hop ? ` · NH ${route.next_hop}` : "";
    const nextHopInterface = route.next_hop_interface_id ? ` (${route.next_hop_interface_id})` : "";
    const family = route.route_type ? ` · EVPN Type ${route.route_type}` : (route.afi && route.safi ? ` · ${route.afi}/${route.safi}` : "");
    const resolution = route.underlay_cost !== undefined ? ` · koszt ${route.underlay_cost}, ECMP ${route.underlay_next_hops?.length ?? 0}` : "";
    const rd = route.rd ? ` · RD ${route.rd}` : "";
    const rt = route.route_target ? ` · RT ${route.route_target}` : "";
    const vni = route.vni ? ` · VNI ${route.vni}` : "";
    const asPath = route.as_path?.length ? ` · AS_PATH ${route.as_path.join(" ")}` : "";
    const origin = route.origin_id ? ` · origin ${route.origin_id}` : "";
    const policy = route.local_preference !== undefined ? ` · LP ${route.local_preference}, MED ${route.med ?? 0}, ORIGIN ${route.origin_code ?? 0}` : "";
    const peer = route.received_from ? ` · od ${route.received_from}` : "";
    const direction = route.from_id && route.to_id ? ` · ${route.from_id} → ${route.to_id}` : "";
    const pathNodes = route.propagation_path ?? route.path;
    const path = pathNodes?.length ? ` · ${pathNodes.join(" → ")}` : "";
    const label = document.createElement("strong"); label.textContent = `${prefix}${vpc}${family}${route.protocol==="static"?" · statyczna":""}`;
    const info = document.createElement("span"); info.textContent = `${rd}${rt}${vni}${origin}${peer}${direction}${nextHop}${nextHopInterface}${asPath}${policy}${resolution}${path}`.replace(/^ · /, "");
    if (simple) info.textContent = `${nextHop}${peer || (route.received_from === "" ? " · lokalna" : "")}${route.received_from === "" ? "" : asPath}${vni}`.replace(/^ · /, "");
    row.append(label, info);
    container.append(row);
    if (route.from_id && route.to_id) {
      const inspect = document.createElement("button"); inspect.type = "button"; inspect.className = "dc-inspector-link dc-update-inspect";
      inspect.dataset.updateId = route.id; inspect.textContent = "Inspektuj ten UPDATE"; container.append(inspect);
    }
  }
}
