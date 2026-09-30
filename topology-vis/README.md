# DC topology visualizer

The descriptions below cover the current implementation baseline. The requested
2026-09-30 redesign is planned in [LUNA_GUIDE.md](LUNA_GUIDE.md),
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), and [DECISIONS.md](DECISIONS.md):
a topology-first JavaScript workspace, popup inspection, small device drag
adjustments, initial expected route tables, and optional illustrative route flow.
That rework has not been implemented by this documentation update.

The visualizer is an independent development harness for the `sev1` site. From
the repository root, start it with:

```sh
go run ./topology-vis/cmd/dc-topology
```

It listens on `http://127.0.0.1:8084`. Use `-addr 127.0.0.1:8085` to choose
another address. The harness loads `topology-vis/examples/default.yaml` and
serves the browser modules from `topology-vis/web/static/dc-topology/`.

The Go package in `topology-vis/internal/dctopology/` validates schema v1 YAML
and builds the canonical topology, VM placements, BGP sessions, route state,
forwarding entries, and deterministic traffic paths. The browser module exports
`mountTopologyApp(root, { onCommand })`, returns `send`, `setState`, and
`destroy`, and keeps display choices out of the model. There is no added
frontend package manager or runtime dependency.

The default fixture has 28 physical devices, eight hosts, 60 cables, 16 route
server VMs, three customer VMs, and 160 BGP sessions. The simulator models
physical underlay BGP, EVPN Type 5, VXLAN, isolated VPC route targets, selected
customer IPv4/IPv6 unicast peering, underlay ECMP, data flows, and physical
paths for BGP control traffic. Route advertisements and packet movement have
separate playback. Count controls rebuild the model; YAML export preserves the
active configuration. Reducing the customer VM count removes overrides, peer
selections, and traffic examples that refer to deleted VMs. Fabric links and BGP sessions can be shown independently,
and collapsing route-server clusters changes only their drawing.

Use these commands for checks:

```sh
GOCACHE=/tmp/topology-vis-go-cache go test ./topology-vis/...
GOCACHE=/tmp/topology-vis-go-cache go test ./...
GOCACHE=/tmp/topology-vis-go-cache go vet ./...
GOCACHE=/tmp/topology-vis-go-cache go build -o /tmp/dc-topology ./topology-vis/cmd/dc-topology
node --input-type=module --check < topology-vis/web/static/dc-topology/app.js
node --input-type=module --check < topology-vis/web/static/dc-topology/dev.js
```

The capped model's compact `/api/model` response measured 1,650,277 JSON bytes
on 2026-09-30 (128 physical devices, 432 cables, 88 VMs, and 1,040 sessions).
Detailed speaker tables, forwarding entries, session announcements, and a
selected route's propagation are loaded through `/api/inspector` when needed.
This is a serialized-size check, not a browser responsiveness measurement.

The browser module is ready for a site adapter. Step 12 still needs to mount it
at `/topologie/dc/` and add navigation while preserving the existing topology
pages. The current workspace grants write access only under `topology-vis/`, so
the reusable implementation remains nested here until the parent `internal/`,
`web/`, and `cmd/` paths are writable. The site integration has not been
verified.

Automated syntax checks do not exercise browser rendering. A browser smoke test
at desktop and narrow widths, including selection, layer toggles, route and
packet playback, count rebuilds, and export/reload, remains outstanding.
