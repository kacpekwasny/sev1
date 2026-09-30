# DC topology explorer

Run the site from the repository root:

```sh
go run . -dev
```

Open **http://localhost:8081/topologie/dc/**, also linked from Topologie.
The explorer uses local JavaScript modules and SVG; it has no htmx interactions,
CDN, frontend package manager, or frontend build step.

For independent development, the same renderer and domain package run in a harness:

```sh
go run ./cmd/dc-topology                  # http://127.0.0.1:8084/
go run ./cmd/dc-topology -addr 127.0.0.1:8085
```

The default YAML is [default.yaml](../content/dc-topology/default.yaml).
It describes 28 physical devices (including eight hosts), 60 cables, 16 RS VMs,
three customer VMs, and 160 BGP sessions. Go validates configuration and calculates
an initial expected route/forwarding snapshot. It recalculates on YAML load or
count rebuild; there is no protocol clock, convergence simulator, or live routing
collection. The examples include EVPN Type 5, VPC isolation, VXLAN context,
underlay ECMP, customer IPv4/IPv6 peering, and data/control packet paths.

Click a device, VM, cluster, link, or session to open a popup over the topology.
Expected BGP/forwarding tables and exports load on demand inside the popup.
Escape or the close button dismisses it and restores focus. The topology remains
visible; on narrow screens the popup fills most of the canvas width.

Drag a device to make a small visual adjustment, bounded to a 48-layout-unit radius.
Its connected lines follow. Arrow keys move a focused icon, Shift increases the
step, and Home restores its anchor. Reset układu clears offsets; Dopasuj adjusts
zoom to the canvas width. Moving a host carries its displayed VM anchors.
Dragging changes only the drawing, and offsets clear on a configuration rebuild.

Łącza and Sesje BGP are independent switches. RS grouping retains four actual
members per cluster. With RS na hostach enabled, a collapsed icon anchors to the
first member's real host; the other members keep their own placements and tables.

Przepływ tras is off initially. Enable it with the BGP layer to show a fixed,
illustrative host → RS Bolt → RS Ctrl → border sequence on valid sessions.
It does not learn routes or change tables. Reduced-motion settings keep static
direction arrows. Packet examples use their calculated physical paths separately.

Konfiguracja opens YAML editing, count controls, reset, and export. Invalid input
preserves the last valid scenario. Export/reload reproduces its network and expected
tables, preserving all RS members and actual placements even when dragged/collapsed.
Reducing the customer count removes references to deleted customer VMs.

Edited scenarios are private to the browser and stay in memory. They expire after
30 idle minutes or server restart; at most 16 edited scenarios are retained, with
the oldest evicted when necessary. An expired scenario reports an error instead
of silently returning different tables. Reload YAML or restore the example to
continue; export YAML to retain a scenario. The default fixture is read at server
startup; restart after editing it. Production embeds browser assets under `web/`,
while the YAML ships with `content/` and follows the site's `-content` flag.

The canonical model and expected-state calculator live in
`internal/content/dctopology/`, browser layout/interactions in
`web/static/dc-topology/`, and site wiring in `internal/web/dc_topology.go`.
`mountTopologyApp(root, { onCommand })` returns `send`, `setState`, and `destroy`;
the adapter serializes configuration changes and aborts requests on teardown.

Run the normal checks from the Git root:

```sh
go test ./...
go vet ./...
go build .
go build ./cmd/dc-topology
go test -race ./internal/content/dctopology ./internal/live ./internal/web
node --input-type=module --check < web/static/dc-topology/app.js
node --input-type=module --check < web/static/dc-topology/dev.js
```

The optional browser walkthrough in [tests/browser.mjs](tests/browser.mjs) uses an
external Playwright installation and installed Chrome. It does not add dependencies
to the application. With Playwright available outside the repo and the site running:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
TOPOLOGY_URL=http://127.0.0.1:8081/topologie/dc/ \
node topology-vis/tests/browser.mjs
```

The walkthrough checks desktop/narrow popup behavior, stale responses, mouse/touch
and keyboard dragging, invariant tables/export, layers/clusters, reduced motion,
packet illustration, invalid/zero-count rebuilds, YAML reload, browser isolation,
capped scale, and teardown. Screenshots default to `/tmp/dc-topology-browser`.
Measured timings are local observations, not a performance guarantee; see
[PROGRESS.md](PROGRESS.md) for the latest verification.
