# Visualizer progress

Updated: 2026-09-30

## Current status

R00–R08 and the revised Steps 00–13 are implemented and verified. The explorer is
integrated at `/topologie/dc/`, linked from Topologie, and shares its source with
the standalone harness. Git and parent-site writes are available. D03 remains
absent; the original `TODO.md` is unchanged.

Baseline: user commit `9c50463`. Working rework commits:

- `0468b7a` — JavaScript workspace and popup inspection.
- `cf51c7c` — bounded dragging, keyboard controls, and layout reset/fit.
- `d8b54dd` — expected route snapshots and optional illustrative route flow.
- `295c4dd` — site integration, source relocation, and browser isolation.
- `993aeba` — D12/R07 RS tiers, contained host badges, and separated outlines.
- D13/R08 endpoint/message/table inspection is in the commit containing this checkpoint.

## Delivered behavior

The topology is the main JavaScript workspace, with compact layer controls and a
configuration dialog. Device/VM/cluster/link/session/route inspectors open over
the canvas, support close/Escape and focus return, and keep stale responses from
replacing a newer selection. Dragging is bounded to 48 layout units, with edge/VM
anchor tracking, pointer/touch cancellation, arrow/Home controls, reset, and fit.
Compact centered border/stem rows lead into closer bolt components. Taller hosts
contain VM badges above their names. Abstract RS cards form tiers over the fabric:
Bolt above its served leaves, Ctrl centered, User at the top right. Cards retain
individual members or collapse to one icon. Explicit rack/bolt rectangles keep
sibling outlines separate and racks inside their bolt. Tighter cell drag bounds
preserve containment while host movement carries its badges. The interaction hint
sits below the canvas so it cannot obscure host labels.

Go calculates expected route/forwarding snapshots on initial load and configuration
rebuild. Route flow is an independent, initially disabled illustrative switch using
valid RS hierarchy sessions; hidden layers and reduced motion stop its clock.
YAML export and route tables are unaffected by dragging, clustering, or animation.
Packet examples remain separate. Browser edits use isolated, bounded in-memory
workspaces; expired workspaces report errors instead of mismatched tables.

Two endpoint explorers now query the snapshot for directed UPDATE propagation
and IPv4/IPv6 packet travel. UPDATE steps expose NLRI, next hop, AS_PATH, and EVPN
attributes; session export rows can inspect an individual UPDATE. Packet inspection
shows ICMP/header/encapsulation fields, ECMP choice, and interfaces per hop. Local
delivery includes TAP/vNIC hops; custom popup dismissal preserves packet playback.
BGP session inspection also exposes its IPv6/TCP header and local attachments.
Late responses cannot overwrite new selections. Cross-VPC traffic stays blocked.

Host TAPs and VM eth0 interfaces are separate local attachments. All hosts retain
EVPN in their global RIB; forwarding still imports only attached tenant contexts.
Host underlay reception no longer depends on VPC attachment, and unrelated hosts
cannot be fabric transit. Underlay AS_PATH ordering is corrected. Host inspection
opens EVPN separately and offers concise GUI cards or Linux/FRR-style text for
the same expected tables. Packet headers and CLI output are educational views.

Domain: `internal/content/dctopology/`. Presentation: `web/static/dc-topology/`.
Site adapter: `internal/web/dc_topology.go`. Fixture: `content/dc-topology/default.yaml`.
Run `go run . -dev` and open `/topologie/dc/`, or `go run ./cmd/dc-topology` on 8084.

## Verification

- `GOCACHE=/tmp/topology-vis-go-cache go test ./...` — passed; includes route/VPC/
  ECMP fixtures, atomic config/count updates, browser isolation/eviction, and site
  template/API/asset coverage.
- `GOCACHE=/tmp/topology-vis-go-cache go vet ./...` — passed.
- Site and standalone harness builds to `/tmp` — passed.
- Race checks for `internal/content/dctopology`, `internal/live`, and `internal/web`
  — passed; affected packages rerun after workspace-expiry handling changed.
- Node module syntax and `git diff --check` — passed.
- `topology-vis/tests/browser.mjs` in installed Chrome 148.0.7778.216 via external
  Playwright — passed at 1280×900 and 390×844. Checks cover popup/route tables,
  stale responses, mouse/touch/keyboard dragging, invariant tables/export, layer
  and RS combinations, reduced motion, packet paths, invalid/zero-count rebuilds,
  export/reload, browser isolation, capped layout, and listener/animation teardown.
  R07 adds geometric containment, centered rows, RS tier placement, disjoint
  sibling outlines, badge/host tracking, immediate movement away from cell limits,
  and small/co-located/mixed host counts, across all four RS display combinations.
  R08 additionally checks host TAPs, visible EVPN, and Linux/FRR formatting.
- `tests/exploration.mjs` — passed: selectable directional updates, decoded
  attributes, route choices, collapsed projections, IPv4/IPv6/VXLAN/local/fabric
  packets, BGP transport headers, TAP paths, playback/reopening, out-of-order responses, immutable YAML,
  and narrow popup/control layout. New Go tests cover endpoint/API validation,
  read-only exploration, border prefixes, VPC rejection, and host transit exclusion.
- Latest local measurement: default page load 212 ms; capped scenario load and
  initial calculation 2,509 ms. Capped model: 128 devices, 432 cables, 88 VMs,
  1,040 sessions. These are local observations, not an SLA.
- Embedded production page checked from `/tmp` with an absolute `-content` path;
  standalone harness checked with shared assets at desktop/narrow widths.
- Screenshots inspected under `/tmp/dc-topology-browser/`. No unexpected browser
  errors; the deliberate invalid-YAML case returns HTTP 400 as expected.

The in-app browser Node REPL is unavailable; installed headless Chrome was the
verification fallback. Other browsers/devices have not been checked. No deployment
or push was performed. The next work should follow a new user request, rather than
repeat completed rework milestones.
