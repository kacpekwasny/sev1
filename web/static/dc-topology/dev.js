import { mountTopologyApp } from "/static/dc-topology/app.js";

const root = document.querySelector("#dc-topology-app");
const app = mountTopologyApp(root);

window.addEventListener("pagehide", () => app.destroy(), { once: true });
