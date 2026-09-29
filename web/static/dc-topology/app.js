const COMMAND_EVENT = "dc-topology:command";

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/**
 * Mount the topology view into an existing page element.
 *
 * The Go application owns configuration and simulation state. The browser
 * module owns presentation state and sends user commands through onCommand.
 * The returned methods let the host deliver state and dispose the view when
 * its page or htmx fragment is removed.
 */
export function mountTopologyApp(root, { onCommand = () => {} } = {}) {
  if (!(root instanceof HTMLElement)) {
    throw new TypeError("mountTopologyApp wymaga elementu HTML");
  }
  if (typeof onCommand !== "function") {
    throw new TypeError("onCommand musi być funkcją");
  }

  const lifetime = new AbortController();
  const shell = createElement("section", "dc-shell");
  shell.setAttribute("aria-labelledby", "dc-shell-title");
  const header = createElement("div", "dc-shell-head");
  header.append(createElement("h2", "", "Widok sieci"));
  const label = createElement("span", "tag dc-state-label", "oczekiwanie na konfigurację");
  label.setAttribute("aria-live", "polite");
  header.append(label);

  const empty = createElement("div", "dc-empty");
  empty.setAttribute("role", "status");
  const mark = createElement("span", "dc-empty-mark", "DC");
  mark.setAttribute("aria-hidden", "true");
  empty.append(mark);
  empty.append(createElement("h3", "", "Brak wczytanej konfiguracji"));
  empty.append(createElement("p", "", "Wczytywanie YAML i budowa modelu sieci pojawią się w następnym kroku."));
  header.querySelector("h2").id = "dc-shell-title";
  shell.append(header, empty);
  root.replaceChildren(shell);

  root.addEventListener(COMMAND_EVENT, (event) => onCommand(event.detail), {
    signal: lifetime.signal,
  });

  let disposed = false;
  return {
    send(command) {
      if (disposed) return;
      root.dispatchEvent(new CustomEvent(COMMAND_EVENT, {
        bubbles: true,
        detail: command,
      }));
    },
    setState(state) {
      if (disposed) return;
      const ready = state !== null && state !== undefined;
      shell.dataset.state = ready ? "ready" : "empty";
      label.textContent = ready ? "model gotowy" : "oczekiwanie na konfigurację";
      empty.hidden = Boolean(ready);
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      lifetime.abort();
      shell.remove();
    },
  };
}
