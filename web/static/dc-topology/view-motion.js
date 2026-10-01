const NS = 'http://www.w3.org/2000/svg';
const STORAGE_KEY = 'sev1.topology.view-motion';
export const defaultMotionSettings = Object.freeze({ enabled: true, visibility: true, grouping: true, placement: true, duration: 450 });

export function normalizeMotionSettings(value) {
  const settings = { ...defaultMotionSettings };
  if (!value || typeof value !== 'object') return settings;
  for (const key of ['enabled', 'visibility', 'grouping', 'placement']) if (typeof value[key] === 'boolean') settings[key] = value[key];
  if ([200, 450, 800].includes(value.duration)) settings.duration = value.duration;
  return settings;
}
export function loadMotionSettings(storage) {
  try { return normalizeMotionSettings(JSON.parse(storage.getItem(STORAGE_KEY))); }
  catch { return { ...defaultMotionSettings }; }
}
export function saveMotionSettings(storage, settings) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(normalizeMotionSettings(settings))); } catch { /* Private storage may be unavailable. */ }
}

// Each cluster retains its real VM membership so merging/splitting follows identity.
export function sceneEntries(svg, positions) {
  if (!svg || !positions) return [];
  const items = new Map(positions.displayItems.map(item => [item.id, item]));
  return [...svg.querySelectorAll('.dc-node, .dc-vm')].map(element => {
    const id = element.dataset.entityId, item = items.get(id);
    const point = positions.entityPoints.get(item?.members[0].id ?? id);
    const scroller = element.closest('.dc-host-vm-scroll');
    const box = element.getBoundingClientRect(), viewport = scroller?.getBoundingClientRect();
    return { key: `${element.dataset.entityType}/${id}`, id, element, point: { x: point.x, y: point.y },
      members: item ? item.members.map(vm => vm.id) : [id], onHost: item?.onHost, role: item?.role,
      visible: !viewport || box.bottom > viewport.top && box.top < viewport.bottom };
  });
}

export function transitionKind(before, after) {
  if (before.some(item => item.key !== after.key)) return 'grouping';
  if (before.some(item => item.onHost !== after.onHost)) return 'placement';
  return null;
}

function copyAppearance(element) {
  const clone = element.cloneNode(true);
  const source = [element, ...element.querySelectorAll('*')], target = [clone, ...clone.querySelectorAll('*')];
  source.forEach((node, index) => {
    const copy = target[index], style = getComputedStyle(node);
    for (const property of ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'letter-spacing', 'filter']) copy.style.setProperty(property, style.getPropertyValue(property));
    for (const attribute of [...copy.attributes]) if (attribute.name === 'id' || attribute.name.startsWith('data-') || ['role', 'tabindex', 'aria-label', 'aria-description'].includes(attribute.name)) copy.removeAttribute(attribute.name);
    copy.removeAttribute('class');
  });
  clone.setAttribute('class', 'dc-motion-entity');
  clone.setAttribute('aria-hidden', 'true');
  return clone;
}

const lerp = (a, b, progress) => ({ x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress });
const ease = progress => progress * progress * (3 - 2 * progress);

export function createViewTransitions() {
  let active = null;
  function finish() {
    if (!active) return;
    cancelAnimationFrame(active.frame);
    for (const restore of active.restore) restore();
    active.layer.remove();
    active.svg.removeAttribute('data-motion-active');
    active.svg.removeAttribute('data-motion-progress');
    active = null;
  }
  function capture(svg, positions) {
    const entries = sceneEntries(svg, positions);
    for (const entry of entries) {
      const moving = active?.targets.get(entry.key);
      if (moving) entry.point = lerp(moving.from, moving.to, active.progress);
      if (entry.visible) entry.clone = copyAppearance(entry.element);
    }
    return entries;
  }
  function run(before, svg, positions, settings) {
    if (!before?.length || !settings.enabled) return;
    const after = sceneEntries(svg, positions), oldMembers = new Map(), newMembers = new Map();
    for (const entry of before) for (const id of entry.members) oldMembers.set(id, entry);
    for (const entry of after) for (const id of entry.members) newMembers.set(id, entry);
    const layer = document.createElementNS(NS, 'g');
    layer.setAttribute('class', 'dc-motion-layer'); layer.setAttribute('aria-hidden', 'true');
    const tasks = [], restore = [], targets = new Map();
    const pop = (entry, disappearing = false) => {
      if (!entry.visible) return;
      const element = disappearing ? entry.clone : entry.element;
      if (disappearing) layer.append(element);
      const transform = element.getAttribute('transform');
      const opacity = element.style.opacity;
      if (!disappearing) restore.push(() => { element.setAttribute('transform', transform); element.style.opacity = opacity; });
      element.dataset.motionType = 'visibility';
      if (!disappearing) restore.push(() => delete element.dataset.motionType);
      tasks.push(progress => {
        const amount = disappearing ? 1 - progress : progress;
        element.setAttribute('transform', `translate(${entry.point.x} ${entry.point.y}) scale(${.88 + .12 * amount})`);
        element.style.opacity = String(amount);
      });
    };
    for (const entry of after) {
      const sources = [...new Set(entry.members.map(id => oldMembers.get(id)).filter(Boolean))];
      if (!sources.length) { if (settings.visibility) pop(entry); continue; }
      const grouping = sources.some(source => source.key !== entry.key);
      const placement = entry.role && entry.role !== 'customer' && sources.some(source => source.onHost !== entry.onHost);
      if (!(grouping && settings.grouping || placement && settings.placement)) continue;
      const kind = transitionKind(sources, entry);
      const center = { x: sources.reduce((sum, source) => sum + source.point.x, 0) / sources.length,
        y: sources.reduce((sum, source) => sum + source.point.y, 0) / sources.length };
      targets.set(entry.key, { from: center, to: entry.point });
      const opacity = entry.element.style.opacity;
      restore.push(() => { entry.element.style.opacity = opacity; });
      entry.element.style.opacity = '0';
      for (const source of sources) {
        if (!source.visible && !entry.visible) continue;
        const ghost = source.key !== entry.key && sources.length === 1 ? copyAppearance(entry.element) : source.clone?.cloneNode(true) ?? copyAppearance(entry.element);
        ghost.dataset.motionType = kind;
        ghost.dataset.motionTarget = entry.id;
        layer.append(ghost);
        tasks.push(progress => {
          const point = lerp(source.point, entry.point, progress);
          ghost.setAttribute('transform', `translate(${point.x} ${point.y}) scale(${grouping ? 1 - .12 * progress : 1})`);
          ghost.style.opacity = String(entry.visible ? grouping ? 1 - Math.max(0, (progress - .65) / .35) : 1 : 1 - progress);
        });
      }
      tasks.push(progress => { entry.element.style.opacity = String(Math.max(0, (progress - .8) / .2)); });
    }
    if (settings.visibility) for (const entry of before) {
      if (entry.members.every(id => !newMembers.has(id))) pop(entry, true);
    }
    if (!tasks.length) return;
    // Sessions follow the same VM identities while the cards travel or merge.
    const lines = [...svg.querySelectorAll('.dc-session line, .dc-route-paths line')].map(line => {
      const owner = line.closest('[data-from]');
      const from = oldMembers.get(owner?.dataset.from)?.point, to = oldMembers.get(owner?.dataset.to)?.point;
      if (!from || !to) return null;
      const end = ['x1', 'y1', 'x2', 'y2'].map(name => Number(line.getAttribute(name)));
      const shift = line.classList.contains('dc-route-learned') ? -4 : line.classList.contains('dc-route-points-to') ? 4 : 0;
      const start = [from.x + shift, from.y, to.x + shift, to.y];
      if (start.every((value, index) => value === end[index])) return null;
      restore.push(() => ['x1', 'y1', 'x2', 'y2'].forEach((name, index) => line.setAttribute(name, end[index])));
      return { line, start, end };
    }).filter(Boolean);
    svg.append(layer); svg.dataset.motionActive = 'true';
    active = { svg, layer, restore, targets, oldMembers, positions, frame: 0, progress: 0 };
    const started = performance.now(), current = active;
    const tick = now => {
      if (active !== current) return;
      const time = Math.max(0, Math.min(1, (now - started) / settings.duration)), progress = ease(time);
      current.progress = progress;
      svg.dataset.motionProgress = String(progress);
      for (const task of tasks) task(progress);
      for (const { line, start, end } of lines) ['x1', 'y1', 'x2', 'y2'].forEach((name, index) => line.setAttribute(name, start[index] + (end[index] - start[index]) * progress));
      if (time === 1) finish(); else current.frame = requestAnimationFrame(tick);
    };
    tick(started);
  }
  function point(id, fallback) {
    const from = active?.oldMembers.get(id)?.point, to = active?.positions.entityPoints.get(id);
    return from && to ? lerp(from, to, active.progress) : fallback;
  }
  return { capture, run, finish, point };
}
