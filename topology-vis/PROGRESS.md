# Visualizer progress

Updated: 2026-09-30

## Current status

R00–R15 and the revised Steps 00–13 are implemented and verified. The explorer is
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
rebuild. Route flow is an independent, initially disabled stream of prefix illustrations
using valid RS hierarchy sessions; hidden layers and reduced motion stop its clock.
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
cannot be fabric transit. Every eBGP export, including RS hops, prepends its ASN in nearest-first order. Host inspection
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
- Latest local measurement: default page load 227 ms; capped scenario load and
  initial calculation 2,563 ms. Capped model: 128 devices, 432 cables, 88 VMs,
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

1. Multi-route flow: implemented in `f7054b4`. The switch shows a bounded stream of up to 24
   independent prefix illustrations, staggered over actual RS sessions. A selected
   UPDATE remains an additional focused stream. Tables/YAML remain unchanged.
   Desktop/narrow Chrome walkthrough and Go tests passed.
2. RS ASN prepending: implemented in `cc59d8f`. Received RIBs and UPDATEs include all eBGP
   sending ASNs, including RS Bolt/Ctrl/User, while EVPN next hop stays unchanged.
   Full Go tests verify each intermediate AS_SEQUENCE and its ordering.
3. Compact device-adjacent traffic actions: implemented in `bf88653`. Clicking a node/VM shows
   a small anchored send action with IPv4/IPv6 choice; the next device click sends
   the sample. A collapsed RS offers concrete member selection. Advanced manual
   forms start closed. Desktop/narrow/touch walkthroughs and Go tests passed.
4. Originated-route sections: implemented in `c544a80` for every physical node and VM, in GUI
   and Linux modes. Entries use canonical origin ownership; an RS with no local
   NLRI explicitly states that its service prefixes are originated by its host.
   Browser checks cover host, customer and empty RS sections; Go tests/build pass.
5. Route/packet path previews on hover: implemented in `b23d100`, in GUI, Linux and originated
   route rows. Purple learned and yellow forwarding paths preview without fetching
   route details or changing inspector selection/tables/history; leaving restores
   the selected view. Keyboard focus also previews; touch continues to use clicks.
   Previews suppress unrelated packet markers and stop the decorative stream while
   hovered. Redundant preview clearing does not redraw away restored device focus
   after closing the inspector. GUI/Linux hover and keyboard-focus checks, desktop/
   narrow/touch walkthroughs against embedded production assets, Go tests/build,
   vet, and packet-bit checks pass.

## Playback refinements — separately committed points

1. Custom-endpoint packet playback: implemented in `4b5c1f7`.
   Reproduced a blocked Play click under reduced motion; an explicit click now
   starts the packet without enabling decorative motion. Delayed media-query
   events cannot cancel a Play click that already opted into reduced-motion playback. Physical-layer hiding
   also pauses custom packets. Chrome checks verify position changes, pause,
   rewind, and layer hiding; desktop/narrow/touch walkthrough and Go tests pass.
2. Sequential route-flow illustration: implemented in `ea5ea52`.
   A single UPDATE marker completes one route's hierarchy path before the next
   prefix starts. Current route metadata and focused UPDATE step follow that
   marker. Chrome checks verify one marker, movement, prefix succession, all RS
   projections, hidden layers, reduced motion, unchanged tables/YAML and teardown;
   desktop/narrow walkthroughs and Go tests pass.
3. Inspect-packet scrolling and viewport visibility: implemented in this
   checkpoint's commit. Opens containing sections, brings the overlay below
   navigation, scrolls its body to packet fields and focuses their heading.
   Selection-scoped deferred reveal handles fetched packets and late session
   exports without reopening a dismissed popup. Chrome checks cover cached/
   fetched packets, repeated clicks from a scrolled body, BGP fields before/after
   a delayed response, and fields actually visible on desktop/narrow screens.
   Go tests, embedded build, vet and packet-bit checks pass.

## D17 refinements — one commit per requested step

1. Hide underlay: implemented in this checkpoint. The checkbox hides fabric
   switches and attached physical links while preserving hosts/VMs, valid overlay
   sessions, routes and YAML. Hidden physical paths pause packet playback.
   Desktop/narrow Chrome checks and Go tests pass.
2. Outside pointer presses dismiss the compact send-action popup, including
   presses in the inspector or outside the app. Controls inside it stay usable.
   Desktop/narrow Chrome checks and Go tests pass.
3. Every inspector disclosure groups its children with a consistent indented
   branch and tinted left border, including RIBs, sessions, interfaces and bits.
   Desktop/narrow Chrome checks and Go tests pass.
4. Inspector resize handle supports pointer/touch input and keyboard dimensions;
   Home restores defaults, cancellation restores the preceding size, and dimensions
   stay bounded by the workspace. Desktop/narrow checks and Go tests pass.
5. Back-arrow buttons discard inherited form padding and retain their square
   dimensions, so the glyph is centered. Shared close buttons benefit as well.
   Desktop/narrow inspector walkthrough and Go tests pass.
6. Hover/focus a session row to preview its exact graph connection without
   navigating or fetching data. It also works while the general BGP layer is
   hidden; leaving restores that layer's state. Desktop/narrow checks and Go tests pass.
7. Host names use `h2001`-style slugs throughout inspector text, GUI/Linux tables,
   provenance, controls and accessibility labels. Canonical API/config IDs remain
   stable. Desktop/narrow checks and Go tests pass.
8. Border exports no BGP routes, including underlay identities. Configured uplink
   destinations remain reachable as explicitly labeled static forwarding entries;
   they do not enter BGP RIBs or animated UPDATEs. Tests cover zero border exports,
   static alternatives, tenant isolation and retained packet reachability. Go tests pass.
9. Customer VM unicast exports now appear in the sequential route-flow queue:
   VM → RS User → compatible RS Ctrl. Existing IPv4/IPv6 expected exports remain
   canonical; browser checks verify every default customer's VM → RS User export
   and the stream's endpoints. Desktop/narrow checks and Go tests pass.
10. Static IPv4/IPv6 routes to each border identity exist in underlay and each VPC,
    even without configured uplink prefixes. Inspector sections label these routes
    as static in GUI/Linux modes. Tests cover customer, host, RS and stem packets
    to both borders in both families, with zero border exports; Go tests/build pass.
11. Packet markers follow the exact yellow port/TAP segments shared with link
    drawing. Transit hops jump between ingress and egress instead of animating
    through node centers. Geometry updates on drag/projection; desktop/narrow
    browser checks place the marker on the drawn yellow track. Go tests pass.
12. RS names are `rs<bolt><member padded to 3 digits>`, `rsctrl<member>` and
    `rsuser<member>` in model labels, graph badges, sessions, inspectors and paths.
    Canonical IDs remain stable. Go checks include the exact requested examples;
    desktop/narrow browser checks cover model, graph and inspector names.

Steps 1–11 were committed as `62e6e32`, `6a553f5`, `134ac51`, `dd8ed2c`,
`c3cffbc`, `cfa0c07`, `e8ec4d4`, `333ed7c`, `8de5b53`, `b003f9e`, and
`88e9cbb`, in that order. Step 12 is the commit containing this checkpoint.

Final D17 verification: `go test ./...`, embedded site build, and `go vet ./...`
pass. All three Chrome walkthroughs (`browser.mjs`, `exploration.mjs`, and
`refinements.mjs`) pass at 1280×900 and 390×844 with no page errors. Older
expectations now check six retained EVPN routes and incoming session UPDATEs,
since border destinations are static and border exports are empty. Packet-bit
checks pass. Desktop/narrow screenshots were inspected. The fresh production
binary was tested with content on disk and embedded assets from outside the repo.
Latest local default load was 168 ms; maximum rebuild was 2,702 ms (128 devices,
432 cables, 88 VMs, 1,040 sessions). No shared-state changes required a new race run.

## D18 inspector refinements

1. Destination action popup is narrower (196 px instead of 230 px), with smaller
   spacing and controls. The grouped-RS member selector fits the compact width.
   Desktop/narrow screenshots and controls checked; Chrome refinements and Go
   tests pass.
2. Hover/focus any fragment of a packet field to highlight that whole field across
   all rows, including IPv6 addresses, Ethernet MACs, payloads and BGP markers.
   Click selection and its field explanation remain independent of hover.
   Chrome checks cover IPv6 four-row addresses, MACs, payloads, focus/leave and
   retained click selection; endpoint walkthrough, packet-bit and Go tests pass.
3. Host RIB route-detail question — answered without changing route inspection.
   The list contains expected exports of the selected route across topology-wide
   BGP sessions, rather than extra routes in the inspected host's RIB.
4. Disclosure children now add only 6 px per level (previously 16 px); removed
   extra RIB-family indents that compounded the nesting. Branch lines and tinted
   backgrounds retain visible parent/child relationships in every disclosure.
   Desktop/narrow screenshots checked; Chrome refinements and Go tests pass.

Commits: `cf181a2` (smaller action popup), `380f11d` (whole packet-field hover),
and the commit containing this checkpoint (shallow indentation). RIB route-detail
behavior was left unchanged as requested. Final Go tests and embedded build pass;
the full browser and endpoint walkthroughs pass against the fresh embedded binary,
with no page errors. Packet-bit checks and desktop/narrow wrapped IPv6 hover pass.

## D19 border visibility suboption

Zostaw border is a child of underlay visibility, shown when underlay is hidden
and enabled by default. Borders and their eight default RS Ctrl session endpoints
remain visible; Sesje BGP still controls the session layer. Uncheck the child to
hide borders too. A shared node-visibility rule drives drawing and hidden-path
playback checks. Configuration, routes, and model IDs stay unchanged.

Go tests, embedded build, JS syntax and diff checks pass. Chrome refinements pass
at desktop/narrow widths, including default border retention, exact border–Ctrl
sessions, hiding/restoring borders, parent/child control visibility, and invariant
YAML. Screenshots at both widths were inspected against the fresh embedded preview.

## D20 inspection refinements

1. One purple direction marker follows the hovered/inspected RIB candidate's
   learned propagation path. It works with the general route-flow switch off;
   active inspection suppresses that general stream. Reduced motion keeps a
   stationary direction arrow. The marker renders above nodes and VM badges.
   Chrome verifies hover movement/direction, click retention, leaving/back, cached
   metadata, and reduced motion; desktop/narrow endpoint walkthrough and Go tests pass.
2. Inspector resizes from four edges and four corners. North/west resizing keeps
   the opposite edge anchored; responsive limits match the CSS popup dimensions.
   Mouse/keyboard/touch input, cancellation, dismissal, rebuild and teardown keep
   pointer state bounded and cleaned up.
   Desktop/narrow Chrome refinements verify each edge, a corner, anchored opposite
   edges, keyboard reset, and touch cancellation restoring dimensions.
3. Route details show only the selected RIB candidate, its attributes, learned
   propagation and next-hop context. Removed the global export list and the
   route-inspector fetch it required. Session-specific exports and UPDATE inspection
   remain available. This supersedes the former answer-only constraint.
   Chrome checks verify absent export rows, no global route fetch on click,
   candidate AS_PATH/context, preserved purple/yellow paths and GUI/Linux back
   navigation. Desktop/narrow browser and endpoint walkthroughs pass.

D20 commits: `10b620c` (directional route propagation), `8d73174` (edge/corner
resize), and `451aa76` (focused route details).

## D21 flow refinements — complete

1. Repaired traffic playback: clamp the first rAF clock to avoid a negative segment
   index; sending traffic and preset clicks play once ready. Presets decode their
   saved ECMP path, including local VM/TAP hops. Inspection reuses the packet
   without refetching or moving its marker. Desktop/narrow Chrome checks cover
   actual movement, pause, inspection, destination arrival, rewind and reduced
   motion; all existing walkthroughs and Go tests/build pass.
   Commit: `1d469b3`.
2. RS fanout uses compact expected-export examples for customer unicast and EVPN
   IPv4/IPv6. Parallel markers form one prefix wave; collapsed anchors deduplicate
   overlapping members. The initial snapshot and route tables stay unchanged.
   Domain tests verify every edge/depth against the canonical export; Chrome checks
   movement, single-prefix branching, grouping and reduced motion at both widths.
   Commit: `4299002`.
3. Complete delivery paths now end at hosts, customer VMs or borders. Dangling
   RS exports are omitted from illustrative paths, without removing any actual
   expected exports. Custom UPDATE inspection includes the complete prefix fanout
   even when its selected endpoint is an RS; decoded selected steps remain focused.
   Changing the prefix playlist restarts its clock at the source. Domain tests
   verify onward hops and terminal waves; desktop/narrow Chrome observes end-device
   arrival for default and RS-targeted custom flows. Existing walkthroughs, Go
   tests and build pass. Commit: `8757f2c`.
4. BGP sessions and flow start enabled. A compact selector cycles representative
   advertisements by family, origin role and VPC, or repeats one. The default
   configuration has 14 examples: EVPN first, customer unicast next, then fabric
   IPv4/IPv6. Prefix/origin/VPC/wave labels and current-wave emphasis distinguish
   each explanation; inspected UPDATEs override a prior example choice and repeat
   their prefix until the popup closes. Reduced motion uses static directions.
   Chrome 148 at 1280×900 and 390×844 verifies all examples, grouped/expanded
   fanout, real marker movement, end-device delivery and custom inspection.
   All five browser walkthroughs pass against embedded production assets, run
   from /tmp; packet bit checks, go test ./..., build and vet pass. The final
   route-flow check also verifies closing custom inspection resumes the samples.
   Commit: `6b2569d`.

Next: no pending D20/D21 work. Preview: http://127.0.0.1:8099/topologie/dc/.
Examples illustrate the expected snapshot; they do not simulate convergence.


## D22 — complete

1. RS User → customer VM exports are blocked in reachability and export policy.
   Customer tables retain their own origins without received peer routes; original
   unicast advertisements continue via User/Ctrl/Bolt to hosts. Domain tests verify
   directional sessions and the complete hierarchy. Go tests/build pass; Chrome
   checks exclude VM recipients at desktop/narrow widths.
   Commit: `827691e`.
2. Global host RIBs receive every compatible customer route from every local
   RS Bolt; import filtering remains in forwarding. Shipped defaults use VRF 0
   (public/default), VNI 3 and RT target:64512:0. Explicit positive/private VPCs
   retain their isolation and mappings. Public unicast keeps its VM next hop and
   records recursive EVPN route/VTEP resolution in table main, shown in GUI/Linux
   and route inspection. Public border egress remains direct underlay.
   Tests retain explicit private fixtures and add shipped-public-default tests:
   every RS Bolt/host/family export, six recursive routes on every host, IPv4
   VTEPs, VNI 3 traffic and non-VXLAN border egress. Go tests/build and all existing
   Chrome walkthroughs pass; focused desktop/narrow fanout/recursion check passes.
   Commit: `25932c1`.
3. Packet traversal connects each incoming cable/TAP contact to the outgoing
   contact with a short interior segment. The shared clock/geometry stays continuous
   across boundaries and clamps negative first-frame timestamps. Hop highlighting
   stays on the transit node; pause/inspect/rewind retain the same saved path.
   Geometry tests verify interior midpoints and no jumps on either side of every
   boundary. Real Chrome frames cross node interiors at desktop/narrow widths with
   both motion preferences; existing packet/yellow-track checks also pass.
   All Go tests, build, vet, packet-bit and geometry checks pass. Final production
   browser walkthroughs check embedded assets and both viewports.
   Commit: the commit containing this checkpoint.

No pending D22 work; preview remains http://127.0.0.1:8099/topologie/dc/.

## D23 — complete

Host VM entries highlight the matching topology badge on hover or keyboard focus,
including grouped RS clusters and abstract placement. Updating the badge class
preserves graph elements, inspector selection and playback. Preview cleanup uses
the existing inspector lifecycle. Chrome checks at 1280×900 and 390×844 verify
every hosted VM in all four projection modes, pointer departure, focus changes,
collapsed-list cleanup and Escape dismissal. Desktop/narrow screenshots reviewed.
Go tests and embedded production build pass.
Commit: the commit containing this checkpoint.

## D24 — complete

RIB next hops remain unchanged; kernel FIB entries resolve remote customer routes
through EVPN to an IPv4 VTEP and L3-SVI/VXLAN, with neighbor/FDB context. Local
unnumbered TAP host routes are static, local loopbacks use table local, and physical
loopbacks/IPv6-only RS service addresses use underlay ECMP. GUI includes these
kernel classes; Linux uses the same snapshot and preserves route inspection.
Tests cover network-prefix recursion, unresolved-route exclusion and VM/underlay
separation. Chrome checks GUI/Linux, hover/click/back and fabric FIBs at desktop
and narrow widths. Go tests/build/vet pass. Commit: `1d78b5c`.

Borders originate public IPv4/IPv6 defaults through fabric and Ctrl sessions.
Hosts select one per family and install physical underlay ECMP; specific VM/static
routes win, private guest views remain isolated, and RS User exports nothing to
customer VMs. External targets retain their requested address while packet paths
end at the chosen border. Defaults have labeled IPv4/IPv6 flow examples.
Domain tests verify both borders/families, propagation and AS_PATH, host kernel
resolution, longest-prefix choice, external targets and private isolation.
Chrome checks kernel GUI/Linux and border origins at both widths, plus default
flow selection, complete end-device waves and packet/UPDATE inspection.
The full walkthrough passes at 128 devices/1,040 sessions (about 2.6 s capped load).
Final embedded assets pass kernel inspection, refinements and packet playback at
both widths; screenshots reviewed. Go tests/build/vet pass, including IPv4/IPv6
external-packet destinations and distinct private border FDB mappings.
Commit: the commit containing this checkpoint.

## D25 — in progress

All physical links now use scoped link-local IPv6 and unnumbered BGP, without
IPv4/global IPv6 interface addresses. Removed the unused numbered-link allocator.
Loopbacks, VXLAN VTEPs and advertised families are preserved. Go tests and
embedded production build pass. Chrome verifies GUI/Linux FIBs, scoped
link-local nexthops and route inspection at desktop/narrow widths.
Commit: the commit containing this checkpoint. Configurable IPv6 identities are next.
