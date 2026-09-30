# Visualizer progress

Updated: 2026-09-30

## Current status

R00–R09 and the revised Steps 00–13 are implemented and verified. The explorer is
integrated at `/topologie/dc/`, linked from Topologie, and shares its source with
the standalone harness. Git and parent-site writes are available. D03 remains
absent; the original `TODO.md` is unchanged.

Baseline: user commit `9c50463`. Working rework commits:

- `0468b7a` — JavaScript workspace and popup inspection.
- `cf51c7c` — bounded dragging, keyboard controls, and layout reset/fit.
- `d8b54dd` — expected route snapshots and optional illustrative route flow.
- `295c4dd` — site integration, source relocation, and browser isolation.
- `993aeba` — D12/R07 RS tiers, contained host badges, and separated outlines.
- `252c732` — D13/R08 endpoint/message/table inspection.
- `9ad9761` — D14/R09 placement and interactive inspection.

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

RS Bolt members now stay in their served bolt and RS Ctrl spans all configured
bolts, with compatible explicit placements retained and invalid placements rejected.
EVPN Type-5 next hops and VXLAN outer endpoints use IPv4; BGP transport stays IPv6.
Packet endpoints can be picked directly on devices/individual VMs. Inspector popups
support mouse/touch/keyboard movement with cancellation, reset and resize bounds.
Binary packet maps expose clickable Ethernet/IP/ICMP/UDP/VXLAN fields, including
lengths/checksums computed from the sample bytes and documented sample defaults.
Session inspection includes a separately labeled TCP/BGP KEEPALIVE bit map.
Back navigation restores table mode, open sections and scroll. AFI/SAFI sections
have visible nesting; GUI and CLI routes retain their speaker/candidate context.
Purple arrows show that RIB's expected learning path; yellow arrows show its
next-hop path and target VM attachment. Path overlays follow display anchors.

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
  R09 rechecks containment with the revised RS placement policies.
- `tests/exploration.mjs` — passed: selectable directional updates, decoded
  attributes, route choices, collapsed projections, IPv4/IPv6/VXLAN/local/fabric
  packets, BGP transport headers, TAP paths, playback/reopening, out-of-order responses, immutable YAML,
  and narrow popup/control layout. R09 adds click-picked endpoints, binary field
  explanations, GUI/Linux back navigation, purple/yellow provenance, and mouse/
  touch/keyboard popup movement, cancellation and viewport clamping. New Go tests
  cover placement policies with 1–4 bolts/small host counts, compatible explicit
  placement, invalid coverage, IPv4 EVPN next hops and IPv4 VXLAN outer headers.
- `tests/packet-bits.mjs` — passed: every serialized bit belongs to a field, IPv4/
  IPv6 and UDP lengths/checksums agree with the bytes, UTF-8 Echo payloads encode
  correctly, VXLAN VNI fields match, and next-hop highlights cannot use unrelated
  hosts as transit.
- Latest local measurement: default page load 231 ms; capped scenario load and
  initial calculation 2,612 ms. Capped model: 128 devices, 432 cables, 88 VMs,
  1,040 sessions. These are local observations, not an SLA.
- Embedded production page checked from `/tmp` with an absolute `-content` path;
  standalone harness checked with shared assets at desktop/narrow widths.
- Screenshots inspected under `/tmp/dc-topology-browser/`. No unexpected browser
  errors; the deliberate invalid-YAML case returns HTTP 400 as expected.

The in-app browser Node REPL is unavailable; installed headless Chrome was the
verification fallback. Other browsers/devices have not been checked. No deployment
or push was performed. The next work should follow a new user request, rather than
repeat completed rework milestones.

## Latest request — separately committed points

1. Multi-route flow: implemented. The switch shows a bounded stream of up to 24
   independent prefix illustrations, staggered over actual RS sessions. A selected
   UPDATE remains an additional focused stream. Tables/YAML remain unchanged.
   Desktop/narrow Chrome walkthrough and Go tests passed.
2. RS ASN prepending: pending.
3. Compact device-adjacent traffic actions: pending.
4. Originated-route sections: pending.
5. Route/packet path previews on hover: pending.
