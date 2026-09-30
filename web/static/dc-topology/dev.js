import { mountTopologyApp } from "/static/dc-topology/app.js";

// Both the site page and the isolated harness mount the same JavaScript app.
const root = document.querySelector("#dc-topology-app");
const apiBase = root.dataset.apiBase || "/api";
const requests = new AbortController();
let commandQueue = Promise.resolve();
const app = mountTopologyApp(root, { onCommand(command) {
  if (command.type === "load_inspector") return loadInspector(command);
  if (command.type === "explore") return loadExploration(command);
  // Keep configuration writes and their following reads in user-action order.
  commandQueue = commandQueue.then(() => handleCommand(command));
} });
root.querySelector("#dc-export").href = `${apiBase}/config.yaml`;
window.addEventListener("pagehide", (event) => {
  if (event.persisted) return; // The back/forward cache freezes and resumes this app.
  requests.abort();
  app.destroy();
});

async function loadInspector(command) {
  const query = new URLSearchParams({ kind: command.kind, id: command.id });
  try {
    const data = await request(`/inspector?${query}`);
    app.setState({ inspectorData: { ...data, kind: command.kind, id: command.id, revision: command.revision } });
  } catch (error) {
    if (error.name === "AbortError") return;
    app.setState({ inspectorData: { ok: false, kind: command.kind, id: command.id,
      revision: command.revision, message: `Nie udało się wczytać szczegółów: ${error.message}` } });
  }
}

async function loadExploration(command) {
  const { kind, from, to, route, family, requestID, revision } = command;
  try {
    const query = new URLSearchParams({kind,from,to,route,family});
    const data = await request(`/explore?${query}`);
    app.setState({explorationData:{...data,kind,requestID,revision}});
  } catch(error) {
    if (error.name !== "AbortError") app.setState({explorationData:{ok:false,kind,requestID,revision,message:error.message}});
  }
}

async function handleCommand(command) {
  app.setState({ busy: true, message: command.type === "initialize" ? "Wczytuję przykład…" : "Sprawdzam konfigurację i przeliczam oczekiwane tablice…", error: false });
  try {
    if (command.type === "initialize") {
      const [yaml, status, model] = await Promise.all([
        request("/config.yaml", { raw: true }), request("/status"), request("/model"),
      ]);
      app.setState({ configYAML: yaml, summary: status.summary, model, message: "Topologia i oczekiwane tablice są gotowe.", error: false });
      return;
    }
    let result;
    if (command.type === "update_counts") {
      result = await request("/counts", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command.counts, config_yaml: command.yaml }) });
    } else if (command.type === "load_config" || command.type === "reset_default") {
      const yaml = command.type === "reset_default" ? await request("/default.yaml", { raw: true }) : command.yaml;
      result = await request("/config", { method: "POST", headers: { "Content-Type": "application/yaml; charset=utf-8" }, body: yaml });
    } else return;
    const [model, yaml] = await Promise.all([request("/model"), request("/config.yaml", { raw: true })]);
    app.setState({ configYAML: yaml, summary: result.summary, model, message: "Topologia i oczekiwane tablice tras zostały przeliczone.", error: false });
  } catch (error) {
    if (error.name !== "AbortError") app.setState({ message: error.message, error: true });
  } finally {
    app.setState({ busy: false });
  }
}

async function request(path, { raw = false, ...options } = {}) {
  const response = await fetch(`${apiBase}${path}`, { cache: "no-store", signal: requests.signal, ...options });
  if (raw) {
    const body = await response.text();
    if (!response.ok) throw new Error(body || `HTTP ${response.status}`);
    return body;
  }
  let body;
  try { body = await response.json(); } catch { throw new Error(`Serwer zwrócił niepoprawną odpowiedź (HTTP ${response.status}).`); }
  if (!response.ok || body.ok === false) {
    const issues = (body.errors ?? []).map((issue) => `• ${issue.path}: ${issue.message}`).join("\n");
    throw new Error([body.message ?? `HTTP ${response.status}`, issues].filter(Boolean).join("\n"));
  }
  return body;
}
