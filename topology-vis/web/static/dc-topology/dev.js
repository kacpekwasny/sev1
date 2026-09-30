import { mountTopologyApp } from "/static/dc-topology/app.js";

const root = document.querySelector("#dc-topology-app");
const app = mountTopologyApp(root, { onCommand: handleCommand });
window.addEventListener("pagehide", () => app.destroy(), { once: true });

async function handleCommand(command) {
  if (command.type === "load_inspector") {
    const query = new URLSearchParams({ kind: command.kind, id: command.id });
    try {
      const data = await request(`/api/inspector?${query}`);
      app.setState({ inspectorData: { ...data, kind: command.kind, id: command.id, revision: command.revision } });
    } catch (error) {
      app.setState({
        inspectorData: { ok: false, kind: command.kind, id: command.id, revision: command.revision, message: error.message },
        message: `Nie udało się wczytać szczegółów: ${error.message}`,
        error: true,
      });
    }
    return;
  }
  if (command.type === "initialize") {
    try {
      const [yaml, status, model] = await Promise.all([
        request("/api/default.yaml", { raw: true }),
        request("/api/status"),
        request("/api/model"),
      ]);
      app.setState({ configYAML: yaml, summary: status.summary, model, message: "Przykładowa konfiguracja jest gotowa.", error: false });
    } catch (error) {
      app.setState({ message: `Nie udało się wczytać modelu: ${error.message}`, error: true });
    }
    return;
  }
  if (command.type === "reset_default") {
    try {
      const yaml = await request("/api/default.yaml", { raw: true });
      const result = await request("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/yaml; charset=utf-8" },
        body: yaml,
      });
      const model = await request("/api/model");
      app.setState({ configYAML: yaml, summary: result.summary, model, message: "Przywrócono konfigurację przykładową.", error: false });
    } catch (error) {
      app.setState({ message: `Nie udało się przywrócić przykładu: ${error.message}`, error: true });
    }
    return;
  }
  if (command.type === "load_config") {
    app.setState({ message: "Sprawdzam konfigurację…", error: false });
    try {
      const result = await request("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/yaml; charset=utf-8" },
        body: command.yaml,
      });
      const [model, exported] = await Promise.all([
        request("/api/model"),
        request("/api/config.yaml", { raw: true }),
      ]);
      app.setState({ summary: result.summary, model, configYAML: exported, message: "Konfiguracja poprawna. Model został przebudowany.", error: false });
      return;
    } catch (error) {
      app.setState({ message: error.message, error: true });
    }
  }
  if (command.type === "update_counts") {
    app.setState({ message: "Przebudowuję topologię i przeliczam routing…", error: false });
    try {
      const result = await request("/api/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...command.counts, config_yaml: command.yaml }),
      });
      const [model, exported] = await Promise.all([
        request("/api/model"),
        request("/api/config.yaml", { raw: true }),
      ]);
      app.setState({ summary: result.summary, model, configYAML: exported, message: "Topologia i oczekiwane tablice tras zostały przeliczone.", error: false });
    } catch (error) {
      app.setState({ message: error.message, error: true });
    }
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  if (options.raw) {
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
