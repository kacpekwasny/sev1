// Small force-directed graph of the notes. No library on purpose: it is
// ~100 lines of physics and stays readable.
(function () {
  const canvas = document.getElementById("graph");
  const hint = document.getElementById("graph-hint");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const colors = ["#35d0a5", "#ff7a45", "#7aa2f7", "#ffd166", "#c3a6ff"];
  let nodes = [], edges = [], dragged = null, dragMoved = false, hovered = null;

  fetch("/api/graf.json")
    .then((r) => r.json())
    .then((data) => {
      const tags = [...new Set(data.nodes.map((n) => n.tag))];
      nodes = data.nodes.map((n, i) => ({
        ...n,
        x: canvas.width / 2 + Math.cos(i) * 200 + Math.random() * 20,
        y: canvas.height / 2 + Math.sin(i) * 200 + Math.random() * 20,
        vx: 0, vy: 0,
        r: 5 + Math.min(n.size, 8) * 1.6,
        color: colors[Math.max(0, tags.indexOf(n.tag)) % colors.length],
      }));
      const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
      edges = data.edges
        .map((e) => ({ a: byId[e.from], b: byId[e.to] }))
        .filter((e) => e.a && e.b);
      hint.textContent = nodes.length + " notatek, " + edges.length + " połączeń";
      requestAnimationFrame(tick);
    })
    .catch(() => (hint.textContent = "nie udało się wczytać grafu"));

  function step() {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    for (const n of nodes) {
      // pull everything gently towards the middle
      n.vx += (cx - n.x) * 0.0007;
      n.vy += (cy - n.y) * 0.0007;
    }
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = Math.max(dx * dx + dy * dy, 100);
        const force = 1800 / d2; // repulsion, so labels do not overlap
        const d = Math.sqrt(d2);
        dx /= d; dy /= d;
        a.vx -= dx * force; a.vy -= dy * force;
        b.vx += dx * force; b.vy += dy * force;
      }
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const pull = (d - 120) * 0.004; // spring towards the ideal edge length
      e.a.vx += (dx / d) * pull; e.a.vy += (dy / d) * pull;
      e.b.vx -= (dx / d) * pull; e.b.vy -= (dy / d) * pull;
    }
    for (const n of nodes) {
      if (n === dragged) { n.vx = n.vy = 0; continue; }
      n.vx *= 0.85; n.vy *= 0.85;
      n.x += n.vx; n.y += n.vy;
      n.x = Math.min(canvas.width - 20, Math.max(20, n.x));
      n.y = Math.min(canvas.height - 20, Math.max(20, n.y));
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#2a3340";
    ctx.lineWidth = 1;
    for (const e of edges) {
      ctx.beginPath();
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      ctx.stroke();
    }
    ctx.font = "13px ui-monospace, monospace";
    for (const n of nodes) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.fill();
      ctx.fillStyle = n === hovered ? "#e6edf3" : "#92a0b0";
      ctx.fillText(n.title, n.x + n.r + 4, n.y + 4);
    }
  }

  function tick() { step(); draw(); requestAnimationFrame(tick); }

  function at(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    return nodes.find((n) => Math.hypot(n.x - x, n.y - y) < n.r + 6) || null;
  }

  canvas.addEventListener("pointerdown", (e) => {
    dragged = at(e); dragMoved = false;
    if (dragged) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    hovered = dragged || at(e);
    canvas.style.cursor = hovered ? "pointer" : "grab";
    if (!dragged) return;
    const rect = canvas.getBoundingClientRect();
    dragged.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    dragged.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    dragMoved = true;
  });
  canvas.addEventListener("pointerup", (e) => {
    if (dragged && !dragMoved) window.location.href = "/notatki/" + dragged.id;
    dragged = null;
  });
})();
