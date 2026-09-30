const NS = "http://www.w3.org/2000/svg";

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
        <label title="Ilustracja po sesjach BGP; tablice tras pozostają bez zmian."><input id="dc-show-route-flow" type="checkbox"> Przepływ tras</label>
        <button id="dc-layout-reset" class="dc-tool-button" type="button">Reset układu</button>
        <button id="dc-fit" class="dc-tool-button" type="button">Dopasuj</button>
        <label class="dc-zoom"><span class="dc-sr-only">Powiększenie</span><input id="dc-zoom" type="range" min="50" max="150" value="85" step="5"><output id="dc-zoom-value">85%</output></label>
      </div>
      <div class="dc-workspace">
        <div id="dc-graph" class="dc-graph-scroll"><p class="dc-empty">Buduję widok topologii…</p></div>
        <aside id="dc-inspector" class="dc-inspector" role="dialog" aria-labelledby="dc-inspector-heading" tabindex="-1" hidden>
          <div class="dc-inspector-bar"><span class="dc-kicker">INSPEKTOR / OCZEKIWANY STAN</span>
            <button id="dc-inspector-close" class="dc-icon-button" type="button" aria-label="Zamknij inspektor">×</button></div>
          <div id="dc-details" class="dc-details"></div>
        </aside>
      </div>
      <div class="dc-graph-footer"><span class="dc-legend"><i class="legend-switch"></i> fabric <i class="legend-host"></i> host <i class="legend-vm"></i> route server <i class="legend-customer"></i> VM klienta</span>
        <span class="dc-canvas-note"><span aria-hidden="true">◎</span> Kliknij: szczegóły · przeciągnij: ustawienie</span>
        <span id="dc-flow-note">Adresy i tablice są obliczanym przykładem.</span></div>
      <div id="dc-traffic-list" class="dc-traffic-list" aria-label="Scenariusze ruchu"></div>
      <div class="dc-playback" role="group" aria-label="Sterowanie ilustracją pakietu">
        <button id="dc-play" class="dc-button" type="button" disabled>Odtwórz pakiet</button>
        <button id="dc-rewind" class="dc-button secondary" type="button" disabled>Od początku</button>
        <label>Tempo <select id="dc-speed"><option value="0.5">0,5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
        <span id="dc-play-status" aria-live="polite">Wybierz przepływ lub sesję BGP.</span>
      </div>
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
    const target = element || [...trafficList.querySelectorAll("[data-traffic-id]")].find((item) => item.dataset.trafficId === selection?.id);
    target?.focus({ preventScroll: true });
  }

  function openInspector() {
    if (inspectorEl.hidden) returnFocus = selected;
    inspectorEl.hidden = false;
    root.querySelector("#dc-inspector-close").focus({ preventScroll: true });
  }

  function closeInspector() {
    inspectorEl.hidden = true;
    selected = null;
    resetAnimation();
    renderGraph();
    renderTrafficList();
    focusEntity(returnFocus);
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
  const illustration = { frame: 0, startedAt: 0, sequence: [] };
  const showInfraOnHosts = root.querySelector("#dc-show-infra-hosts");
  const collapseRouteServers = root.querySelector("#dc-collapse-rs");
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
  let inspectorSelectionKey = "";
  const animation = { playing: false, elapsed: 0, startedAt: 0, frame: 0 };

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
  const onLayerChange = () => {
    const layerHidden = (selected?.type === "traffic" || selected?.type === "session") && !showLinks.checked;
    if (animation.playing && (layerHidden || reducedMotion.matches)) pauseAnimation();
    renderGraph();
    renderInspector();
  };
  const onZoom = () => {
    zoomOutput.value = `${zoomInput.value}%`;
    renderGraph();
  };
  const onGraphClick = (event) => {
    if (event.detail > 0 && performance.now() < suppressClickUntil) { suppressClickUntil = 0; return; }
    const entity = event.target.closest("[data-entity-type]");
    if (!entity || !graphEl.contains(entity)) return;
    selected = { type: entity.dataset.entityType, id: entity.dataset.entityId };
    resetAnimation();
    loadSelectionInspector();
    renderTrafficList();
    renderGraph();
    renderInspector();
    openInspector();
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
    if (drag || !event.isPrimary || event.button !== 0) return;
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
    const route = event.target.closest("[data-route-id]");
    if (route && detailsEl.contains(route)) {
      selected = { type: "route", id: route.dataset.routeId };
      resetAnimation();
      loadInspector("route", selected.id);
      renderTrafficList();
      renderGraph();
      renderInspector();
      return;
    }
    const button = event.target.closest("[data-session-id]");
    if (!button || !detailsEl.contains(button)) return;
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
    selected = { type: "traffic", id: button.dataset.trafficId };
    resetAnimation();
    renderTrafficList();
    renderGraph();
    renderInspector();
    openInspector();
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
  listen(trafficList, "click", onTrafficClick);
  listen(playButton, "click", onPlaybackClick);
  listen(rewindButton, "click", onRewindClick);
  listen(speedSelect, "change", onSpeedChange);

  listen(root.querySelector("#dc-config-open"), "click", () => configDialog.showModal());
  listen(root.querySelector("#dc-config-close"), "click", () => configDialog.close());
  listen(root.querySelector("#dc-inspector-close"), "click", closeInspector);
  listen(window, "keydown", (event) => {
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
    else if (selected?.type === "route") loadInspector("route", selected.id);
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
    const table = state.model?.route_state?.tables?.find((item) => item.speaker_id === speakerID);
    if (table) appendSpeakerTable(container, state.model, speakerID);
    else appendInspectorLoading(container, "speaker", speakerID);
  }

  function selectedPath() {
    if (!state.model || !selected) return [];
    if (selected.type === "traffic") {
      return state.model.route_state?.traffic?.find((item) => item.id === selected.id)?.physical_node_ids ?? [];
    }
    if (selected.type === "session") {
      return state.model.route_state?.control_paths?.find((item) => item.session_id === selected.id)?.physical_node_ids ?? [];
    }
    return [];
  }

  // This is a curated illustration of the RS hierarchy, independent of route tables.
  function routeFlowSequence() {
    const model = state.model;
    if (!model) return [];
    const origin = model.route_state?.origins?.find((route) => route.route_type === 5 && route.origin_kind === "host");
    if (!origin) return [];
    let fromID = origin.next_hop_node_id;
    const sequence = [];
    for (const kind of ["host-rs-bolt", "rs-bolt-rs-ctrl", "border-rs-ctrl"]) {
      const session = model.bgp_sessions.find((item) => item.kind === kind &&
        (item.a.entity_id === fromID || item.b.entity_id === fromID) &&
        item.families.some((family) => family.route_types?.includes(5)));
      if (!session) return [];
      const toID = session.a.entity_id === fromID ? session.b.entity_id : session.a.entity_id;
      sequence.push({ sessionID: session.id, fromID, toID });
      fromID = toID;
    }
    return sequence;
  }

  function syncIllustration() {
    const active = showRouteFlow.checked && showSessions.checked && illustration.sequence.length > 0;
    flowNote.textContent = !showRouteFlow.checked ? "Adresy i tablice są obliczanym przykładem."
      : !showSessions.checked ? "Przepływ poglądowy — włącz warstwę Sesje BGP."
      : !illustration.sequence.length ? "Brak zgodnego przykładu przepływu tras w tej konfiguracji."
      : "Poglądowo: host → RS Bolt → RS Ctrl → border. Tablice pozostają stałe.";
    if (!active || reducedMotion.matches) {
      if (illustration.frame) cancelAnimationFrame(illustration.frame);
      illustration.frame = 0;
      graphEl.querySelector("#dc-route-marker")?.setAttribute("visibility", "hidden");
      return;
    }
    updateIllustrationMarker(performance.now());
    if (!illustration.frame) {
      illustration.startedAt = performance.now();
      const tick = (now) => {
        if (destroyed) return;
        updateIllustrationMarker(now);
        illustration.frame = requestAnimationFrame(tick);
      };
      illustration.frame = requestAnimationFrame(tick);
    }
  }

  function updateIllustrationMarker(now) {
    const marker = graphEl.querySelector("#dc-route-marker");
    const sequence = illustration.sequence;
    if (!marker || !sequence.length || !showRouteFlow.checked || !showSessions.checked || reducedMotion.matches) return;
    const scaled = (Math.max(0, now - illustration.startedAt) % (sequence.length * 1100)) / 1100;
    const step = sequence[Math.floor(scaled)];
    const from = currentPositions?.entityPoints.get(step.fromID);
    const to = currentPositions?.entityPoints.get(step.toID);
    if (!from || !to) { marker.setAttribute("visibility", "hidden"); return; }
    const fraction = scaled % 1;
    marker.setAttribute("cx", String(from.x + (to.x - from.x) * fraction));
    marker.setAttribute("cy", String(from.y + (to.y - from.y) * fraction));
    marker.setAttribute("visibility", "visible");
  }

  function animationDuration() {
    return Math.max(0, selectedPath().length - 1) * 900;
  }

  function animationElapsed(now = performance.now()) {
    return animation.elapsed + (animation.playing ? (now - animation.startedAt) * animation.speed : 0);
  }

  function updateAnimationMarker(now = performance.now()) {
    const marker = graphEl.querySelector("#dc-packet-marker");
    const path = selectedPath();
    if (!marker || path.length < 2 || !state.model || !showLinks.checked) {
      if (marker) marker.setAttribute("visibility", "hidden");
      return;
    }
    const positions = currentPositions;
    if (!positions) return;
    const points = path.map((id) => positions.nodes.get(id)).filter(Boolean);
    if (points.length < 2) { marker.setAttribute("visibility", "hidden"); return; }
    const duration = (points.length - 1) * 900;
    const progress = Math.min(1, animationElapsed(now) / duration);
    const scaled = progress * (points.length - 1);
    const segment = Math.min(points.length - 2, Math.floor(scaled));
    const fraction = progress >= 1 ? 1 : scaled - segment;
    const a = points[segment], b = points[segment + 1];
    marker.setAttribute("cx", String(a.x + (b.x - a.x) * fraction));
    marker.setAttribute("cy", String(a.y + (b.y - a.y) * fraction));
    marker.setAttribute("visibility", "visible");
  }

  function updatePlaybackControls() {
    const path = selectedPath();
    const canPlay = path.length > 1 && showLinks.checked;
    playButton.disabled = !canPlay;
    rewindButton.disabled = !canPlay;
    playButton.textContent = animation.playing ? "Wstrzymaj pakiet" : "Odtwórz pakiet";
    if (animation.playing) return;
    if (!selected || !["traffic", "session"].includes(selected.type)) playStatus.textContent = "Wybierz przepływ lub sesję BGP, aby prześledzić pakiet.";
    else if (!showLinks.checked) playStatus.textContent = "Włącz łącza fizyczne, aby zobaczyć drogę pakietu.";
    else if (path.length === 1) playStatus.textContent = "Dostarczenie lokalne — bez przejścia przez fabric.";
    else if (!path.length) playStatus.textContent = "Brak osiągalnej ścieżki w tej konfiguracji.";
    else playStatus.textContent = `${path.length - 1} hopów · poglądowa droga pakietu.`;
  }

  function startAnimation() {
    const path = selectedPath();
    if (path.length < 2 || !showLinks.checked || animation.playing) return;
    if (reducedMotion.matches) {
      playStatus.textContent = "Animacja wyłączona przez ustawienie ograniczenia ruchu; ścieżka pozostaje podświetlona.";
      return;
    }
    const duration = animationDuration();
    if (animation.elapsed >= duration) animation.elapsed = 0;
    animation.playing = true;
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
      modelRevision++;
      inspectorLoaded.clear();
      inspectorPending.clear();
      inspectorErrors.clear();
      endDrag(null, true);
      viewOffsets.clear();
      inspectorEl.hidden = true;
      selected = null;
      resetAnimation();
    }
    state = { ...state, ...next };
    if (next.busy !== undefined) {
      for (const button of root.querySelectorAll("#dc-config-form button, #dc-count-form button")) button.disabled = Boolean(next.busy);
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
      button.classList.toggle("active", selected?.type === "traffic" && selected.id === flow.id);
      button.textContent = `${flow.id}${flow.reachable ? " · osiągalny" : " · brak trasy"}`;
      trafficList.append(button);
    }
  }

  function renderGraph() {
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
    const svg = document.createElementNS(NS, "svg");
    const zoom = Number(zoomInput.value) / 100;
    svg.setAttribute("class", "dc-topology-svg");
    svg.setAttribute("viewBox", `0 0 ${positions.width} ${positions.height}`);
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", `Topologia fizyczna: ${model.nodes.length} urządzeń i ${model.physical_links.length} łączy`);
    svg.style.width = `${Math.ceil(positions.width * zoom)}px`;
    svg.style.height = `${Math.ceil(positions.height * zoom)}px`;

    currentPositions = positions;
    const nodeByID = new Map(model.nodes.map((node) => [node.id, node]));
    const interfaceByID = new Map(model.interfaces.map((iface) => [iface.id, iface]));
    const routeSessionIDs = selected?.type === "route"
      ? new Set((model.route_state?.advertisements ?? []).filter((item) => item.route_id === selected.id).map((item) => item.session_id))
      : new Set();
    illustration.sequence = showRouteFlow.checked ? routeFlowSequence() : [];
    const illustrationIDs = new Set(illustration.sequence.map((step) => step.sessionID));
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
      svg.append(svgText(12, y, label, "dc-row-label"));
    }

    const edgeLayer = svgElement("g", { class: "dc-edges" });
    if (showLinks.checked) {
      for (const link of model.physical_links) {
        const a = positions.nodes.get(link.a_node_id);
        const b = positions.nodes.get(link.b_node_id);
        if (!a || !b) continue;
        let selectedClass = selected?.type === "link" && selected.id === link.id ? " selected" : "";
        if (selected?.type === "traffic") {
          const flow = model.route_state?.traffic?.find((item) => item.id === selected.id);
          if (flow?.physical_link_ids.includes(link.id)) selectedClass += " flow-path";
        }
        if (selected?.type === "session") {
          const path = model.route_state?.control_paths?.find((item) => item.session_id === selected.id);
          if (path?.physical_link_ids.includes(link.id)) selectedClass += " flow-path";
        }
        const group = svgElement("g", {
          class: `dc-edge${selectedClass}`, role: "button", tabindex: "0",
          "data-entity-type": "link", "data-entity-id": link.id,
          "aria-label": `Łącze ${nodeByID.get(link.a_node_id)?.label} — ${nodeByID.get(link.b_node_id)?.label}`,
        });
        const direction = Math.sign(b.y - a.y) || 1;
        const x1 = a.x, y1 = a.y + direction * a.height / 2;
        const x2 = b.x, y2 = b.y - direction * b.height / 2;
        group.append(svgElement("line", { x1, y1, x2, y2, class: "dc-edge-hit" }));
        group.append(svgElement("line", { x1, y1, x2, y2, class: "dc-edge-line" }));
        edgeLayer.append(group);
      }
    }
    svg.append(edgeLayer);

    if (showSessions.checked) {
      const sessionLayer = svgElement("g", { class: "dc-sessions" });
      for (const session of model.bgp_sessions) {
        const step = illustration.sequence.find((item) => item.sessionID === session.id);
        const a = positions.entityPoints.get(step?.fromID ?? session.a.entity_id);
        const b = positions.entityPoints.get(step?.toID ?? session.b.entity_id);
        if (!a || !b) continue;
        const selectedClass = (selected?.type === "session" && selected.id === session.id ? " selected" :
          selected?.type === "route" && routeSessionIDs.has(session.id) ? " route-path" : "") +
          (illustrationIDs.has(session.id) ? " illustrative" : "");
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

    svg.append(rsLayer);
    const nodeLayer = svgElement("g", { class: "dc-nodes" });
    const vmCountByHost = new Map();
    for (const vm of model.vms) vmCountByHost.set(vm.host_id, (vmCountByHost.get(vm.host_id) ?? 0) + 1);
    for (const node of model.nodes) {
      const point = positions.nodes.get(node.id);
      if (!point) continue;
      const selectedClass = selected?.type === "node" && selected.id === node.id ? " selected" : "";
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

    const vmLayer = svgElement("g", { class: "dc-vms" });
    for (const item of positions.displayItems) {
      const point = positions.displayPoints.get(item.id);
      if (!point) continue;
      const selectedClass = selected?.type === item.entityType && selected.id === item.id ? " selected" : "";
      const group = svgElement("g", {
        class: `dc-vm ${item.role}${item.entityType === "cluster" ? " cluster" : ""}${selectedClass}`, transform: `translate(${point.x} ${point.y})`,
        role: "button", tabindex: "0", "data-entity-type": item.entityType, "data-entity-id": item.id,
        "data-host-id": item.hostID, "data-on-host": item.onHost,
        "aria-label": `${item.label}${item.onHost ? `, host ${item.hostID}` : ", widok abstrakcyjny"}`,
        "aria-description": "Enter: szczegóły. Strzałki: przesuń. Home: przywróć pozycję.",
      });
      group.append(svgElement("rect", { x: -47, y: -12, width: 94, height: 24, rx: 7 }));
      group.append(svgText(0, 4, item.label, "dc-vm-label"));
      vmLayer.append(group);
    }
    svg.append(vmLayer);
    svg.append(svgElement("circle", { id: "dc-packet-marker", class: "dc-packet-marker", r: 7, visibility: "hidden" }));
    svg.append(svgElement("circle", { id: "dc-route-marker", class: "dc-route-marker", r: 7, visibility: "hidden" }));
    graphEl.replaceChildren(svg);
    updateAnimationMarker();
    updatePlaybackControls();
    syncIllustration();
  }

  function renderInspector(nodeByID, interfaceByID) {
    const key = selected ? `${selected.type}/${selected.id}` : "";
    const keep = key === inspectorSelectionKey;
    const opened = keep ? [...detailsEl.querySelectorAll("details[open]")].map((item) => item.querySelector("summary")?.textContent.split(" · ")[0]) : [];
    const scroll = keep ? detailsEl.scrollTop : 0;
    renderInspectorContent(nodeByID, interfaceByID);
    for (const item of detailsEl.querySelectorAll("details")) {
      if (opened.includes(item.querySelector("summary")?.textContent.split(" · ")[0])) item.open = true;
    }
    detailsEl.scrollTop = scroll;
    inspectorSelectionKey = key;
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
      const summary = document.createElement("summary"); summary.textContent = `Interfejsy (${node.interface_ids.length})`;
      interfaces.append(summary);
      for (const id of node.interface_ids) {
        const iface = (interfaceByID ?? new Map(state.model.interfaces.map((item) => [item.id, item]))).get(id);
        if (!iface) continue;
        const row = document.createElement("p");
        row.textContent = `${iface.name} ↔ ${iface.peer_node_id}: ${formatAddress(iface)}`;
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
          appendForwardingTable(detailsEl, state.model, node.id, "Tablica forwarding hosta");
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
      appendEndpointSessions(detailsEl, state.model, vm.id);
      appendSpeakerTableOrLoading(detailsEl, vm.id);
      if (vm.role === "customer") {
        if (inspectorLoaded.has(`${modelRevision}/speaker/${vm.id}`)) {
          appendForwardingTable(detailsEl, state.model, vm.id, "Widok forwarding VPC (NVE hosta; nie tabela systemu gościa)");
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
      if (controlPath) appendControlPath(detailsEl, session, controlPath);
      return;
    }
    if (selected.type === "route") {
      const route = state.model.route_state?.origins?.find((item) => item.id === selected.id);
      if (!route) { selected = null; return renderInspector(); }
      appendInspectorTitle("Oczekiwana trasa i eksport", `${route.prefix} · ${route.id}`);
      const identity = document.createElement("p");
      identity.textContent = `${route.afi}/${route.safi}${route.route_type ? ` Type ${route.route_type}` : ""} · origin ${route.origin_id} (${route.origin_label}) · next hop ${route.next_hop} · AS ${route.origin_asn}`;
      const context = document.createElement("p");
      context.textContent = route.vpc_id
        ? `VPC ${route.vpc_id} · RD ${route.rd} · RT ${route.route_target} · VNI ${route.vni}`
        : "Underlay · bez kontekstu VPC/VNI";
      detailsEl.append(identity, context);
      const ads = (state.model.route_state?.advertisements ?? []).filter((item) => item.route_id === route.id);
      const routeLoaded = inspectorLoaded.has(`${modelRevision}/route/${route.id}`);
      const note = document.createElement("p");
      note.textContent = routeLoaded ? `${ads.length} oczekiwanych eksportów przez sesje BGP. To obliczony stan konfiguracji.`
        : inspectorErrors.get(`${modelRevision}/route/${route.id}`) || "Wczytuję oczekiwane eksporty tej trasy…";
      detailsEl.append(note);
      if (routeLoaded) appendRouteRows(detailsEl, ads);
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
  if (vm.role === "rs_bolt") return `RS Bolt ${vm.served_bolt}/${vm.member}`;
  return `${vm.role === "rs_ctrl" ? "RS Ctrl" : "RS User"} ${vm.member}`;
}

function appendSpeakerTable(container, model, speakerID) {
  const table = model.route_state?.tables?.find((item) => item.speaker_id === speakerID);
  if (!table) return;
  const locallyOriginated = table.locally_originated ?? [];
  const received = table.received ?? [];
  const selected = table.selected ?? [];
  const details = document.createElement("details");
  details.className = "dc-interface-details";
  const summary = document.createElement("summary");
  summary.textContent = `Oczekiwana tablica BGP · ${selected.length} wybranych · ${received.length} odebranych`;
  details.append(summary);
  const groups = [
    ["Najlepsze ścieżki", selected],
    ["Trasy lokalne", locallyOriginated],
    ["Trasy odebrane", received],
  ];
  for (const [label, entries] of groups) {
    const title = document.createElement("p"); title.className = "dc-route-group-title"; title.textContent = label;
    details.append(title);
    appendRouteRows(details, entries);
  }
  container.append(details);
}

function appendForwardingTable(container, model, ownerID, title) {
  const entries = (model.route_state?.forwarding ?? []).filter((item) => item.owner_id === ownerID);
  const details = document.createElement("details");
  details.className = "dc-interface-details";
  const summary = document.createElement("summary"); summary.textContent = `${title} · ${entries.length} wpisów`;
  details.append(summary);
  if (ownerID.startsWith("customer-") && entries.length === 0) {
    const note = document.createElement("p"); note.textContent = "Brak wpisów w tej konfiguracji."; details.append(note);
  }
  appendRouteRows(details, entries);
  container.append(details);
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

function appendControlPath(container, session, path) {
  const details = document.createElement("details"); details.className = "dc-interface-details";
  const summary = document.createElement("summary"); summary.textContent = "Fizyczna droga pakietu BGP";
  const endpoints = document.createElement("p");
  endpoints.textContent = `Jedna sesja logiczna: ${session.a.label} → ${session.b.label} · ${session.transport}`;
  const physical = document.createElement("p");
  physical.textContent = path.reachable ? `Węzły underlay: ${path.physical_node_ids.join(" → ") || "obie końcówki na tym samym hoście"}` : `Brak drogi: ${trafficReasonText(path.reason)}`;
  const links = document.createElement("p"); links.textContent = `Łącza fizyczne: ${path.physical_link_ids.join(", ") || "brak"}`;
  details.append(summary, endpoints, physical, links);
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

function appendRouteRows(container, entries) {
  if (!entries?.length) {
    const empty = document.createElement("p"); empty.textContent = "Brak tras."; container.append(empty); return;
  }
  for (const route of entries) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "dc-route-row";
    row.dataset.routeId = route.route_id ?? route.id;
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
    const label = document.createElement("strong"); label.textContent = `${prefix}${vpc}${family}`;
    const info = document.createElement("span"); info.textContent = `${rd}${rt}${vni}${origin}${peer}${direction}${nextHop}${nextHopInterface}${asPath}${policy}${resolution}${path}`.replace(/^ · /, "");
    row.append(label, info);
    container.append(row);
  }
}
