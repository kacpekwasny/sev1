# DC topology visualizer: implementation plan for GPT-Luna

Status on 2026-09-30: **R00–R18 are implemented.** The user committed the baseline as `9c50463`; rework commits and verification are recorded in [PROGRESS.md](PROGRESS.md). The milestones and older steps below remain the implementation/acceptance contract, not a request to repeat completed work. Read [DECISIONS.md](DECISIONS.md) and [LUNA_GUIDE.md](LUNA_GUIDE.md).

## Current rework contract and execution order

The latest user request supersedes prior BGP simulation/event-playback requirements and the htmx convention for this feature. Build an engaging JavaScript topology workspace, inspect entities in a popup over that workspace, compute expected route tables on initial load/rebuild, and make route flow a decorative, independently switched illustration. Devices support small visual position adjustments by dragging. Keep confirmed network semantics and YAML configuration intact. The user authorizes reasonable assumptions and autonomous execution; no framework or new build system is required by “dynamic JS”.

These milestones define the revised scope; consult progress before executing an unfinished increment:

| Milestone | Work | Acceptance and suggested commit |
| --- | --- | --- |
| R00 — Preserve baseline | Inspect status and staged changes; commit the existing implementation before redesign. If Git metadata is read-only, record the exact blocker and continue writable work. | Scoped staged diff; actual commit hash recorded. `feat(topology): add configured DC visualizer baseline` |
| R01 — JavaScript workspace | Recompose the UI around a dominant topology canvas, compact toolbar, role-based visual hierarchy, and a configuration drawer/dialog. Keep local assets, Polish copy, loading/error states, and responsive layout. No htmx visualizer interactions. | Inspect 1280×900 and 390×844; exercise controls and check console errors. `feat(topology): redesign JavaScript topology workspace` |
| R02 — Popup inspection | Move device/host/VM/link/session/cluster and route details into one overlay on the topology. Preserve on-demand data loading, tables, and selection highlights. Include close/Escape, focus restoration, and narrow-screen sheet behavior. | Topology stays visible; rapid selection never shows stale details; popup loading/errors and keyboard dismissal work. `feat(topology): inspect entities over the topology` |
| R03 — Bounded dragging | Add pointer dragging with a threshold that distinguishes clicks, bounded view offsets, edge tracking, touch/cancel handling, reset layout, and keyboard equivalents. | Drag then inspect; move connected endpoints; verify model and export are unchanged; check zoom, clustering, hidden layers, rebuild cleanup, and teardown. `feat(topology): add bounded device dragging` |
| R04 — Expected tables | Audit and simplify route computation/API/UI to initial expected snapshots. Reuse correct static calculations; remove convergence/event machinery and UI controls whose only purpose is simulated learning. Calculate on load/rebuild, serve cached expected data during inspection. | Hand-authored route fixtures, deterministic repeated loads, VPC isolation, and atomic invalid-config rejection pass. No animation changes tables. `refactor(topology): calculate expected route snapshots` |
| R05 — Optional illustrative flow | Replace route-announcement playback with a dedicated switch (D21 starts enabled). A fixed sequence projected onto valid current sessions is sufficient; mark it illustrative and respect reduced motion. Retain useful data/control traffic examples without building a protocol simulator. | Toggle off stops/clears animation; only actual connections are used; missing endpoints are handled; drag/collapse/layer changes update or suppress paths; tables never change. `feat(topology): add optional illustrative route flow` |
| R06 — Verify and integrate | Finish browser acceptance, docs, and `/topologie/dc/` integration when parent paths are writable. Preserve existing site routes and behavior. | Required Go/JS checks and desktop/narrow walkthrough; record actual scale measurements and outstanding blockers. `feat(topology): integrate redesigned DC explorer` |
| R07 — Refine layout | Apply D12: tiered abstract RS cards over the fabric, centered border/stem rows, tighter bolt components, VM badges above host labels in taller hosts, and disjoint sibling outlines. Constrain drags inside compact cells. | Check expanded/collapsed and hosted/abstract modes at default, capped, and small/co-located sizes. Verify containment, drag limits, host/badge tracking, and desktop/narrow appearance. `feat(topology): refine RS tiers and host layout` |
| R08 — Inspect endpoint flows and tables | Apply D13: select physical/VM endpoints for expected UPDATE propagation and packet travel; decode message attributes and packet headers/hops; model local TAP/vNIC attachments; retain host EVPN RIBs separately from tenant FIB import; provide GUI and Linux/FRR table formats. | Validate actual directional exports, IPv4/IPv6, local/VXLAN/border paths, tenant isolation, physical cable invariants, table formats, stale response handling, desktop/narrow popups, and Go/race checks. `feat(topology): inspect endpoint updates, packets, and host RIBs` |

| R09 — Refine interactive inspection | Apply D14: constrain RS Bolt placement, spread RS Ctrl, use IPv4 EVPN next hops/VTEPs, pick packet endpoints by click, drag popups, decode packet bits, restore table navigation and hierarchy, and highlight route provenance/next hop in both table modes. | Placement/validation and EVPN tests, wire lengths/checksums, purple/yellow path context, click picking/cancellation, mouse/touch/keyboard popup dragging, back navigation, desktop/narrow and embedded browser checks. `feat(topology): refine placement and interactive packet inspection` |

| R10 — Device-first flows and provenance | Apply D15: many route streams, RS ASN prepending, compact device-adjacent traffic sending, per-device originated routes, and hover/focus path previews. | Commit after each of the five points. Check stream multiplicity/invariants, all intermediate AS sequences, device target selection, canonical origin ownership, GUI/Linux hover without navigation/network reads, and restore/teardown behavior at desktop/narrow widths. |

| R11 — Refine playback and visibility | Apply D16: explicit custom packet playback, sequential UPDATE markers, and Inspect packet scrolling to visible fields. | Commit after each of the three points. Verify packet movement/pause/rewind under reduced motion, one route marker with successive prefixes and stable tables, and packet fields visible in the viewport at desktop/narrow widths, including asynchronous and session inspection. Consult PROGRESS for completion. |
| R12 — Refine visibility, inspection and routing | Apply D17: underlay hiding, outside dismissal, disclosure children, resize/back alignment, session hover, host/RS slugs, no border exports, customer exports to RS User, static routes to borders, and packet markers on yellow link geometry. | Twelve separate commits in user order. Check GUI/Linux navigation, desktop/narrow popup interaction, packet movement, customer exports, border reachability without BGP advertisements, and stable YAML/API IDs. Consult PROGRESS for completion and checks. |
| R13 — Compact inspector presentation | Apply D18: smaller destination action popup, whole wrapped-field hover/focus, and shallow child indentation. Answer the host RIB route-detail question without changing its exports view. | Three UI commits. Check desktop/narrow controls and hierarchy, four-row IPv6 fields, other wrapped fields, keyboard focus, and retained click selection. Consult PROGRESS for checks. |
| R14 — Keep borders in hidden-underlay view | Apply D19: subordinate border-retention toggle, checked by default while hiding underlay. | Verify borders and border–RS Ctrl sessions remain available, hide/restore behavior, independent BGP layer, desktop/narrow controls and unchanged YAML. |
| R15 — Focus route inspection | Apply D20: directed learned-path animation on hover/click, edge/corner inspector resizing, and remove topology-wide exports from route details. | Three commits. Check candidate context, direction/movement/reduced motion, GUI/Linux navigation, mouse/touch/keyboard resizing and cancellation at both widths. |
| R16 — Repair and explain flow | Apply D21: repair traffic playback/inspection teleport, show RS fanout, complete at end devices, and cycle advertisement examples by default. | Four commits after R15. Reproduce real playback failure and verify position continuity; use expected exports for branching and end-device delivery without simulating BGP convergence. |
| R17 — Correct customer and packet paths | Apply D22: import-only customer sessions, all-host RS Bolt fanout, unchanged unicast in the default VRF recursively resolved via VM EVPN, public VNI 3 defaults, and continuous packet traversal through nodes. | Three commits. Verify every Bolt/host/family export, recursive default-VRF forwarding, explicit private VPC isolation, and real packet frames across link-contact boundaries at both widths. |
| R18 — Preview hosted VMs | Apply D23: highlight topology VMs when hovering over the host inspector's VM entries; support keyboard focus and grouped RS projections. | Verify hosted/abstract and grouped/expanded modes at both widths, unchanged selection/playback, and preview cleanup. |


The 48-layout-unit drag bound, ephemeral offsets, popup behavior, and illustrative-flow defaults are specified in the guide and D11. These are authorized defaults that may be refined during usability checks. The latest user explicitly resumed implementation; the earlier instructions-only limit no longer applies.

## Intended outcome and evidence

The user wants a browser-based, dynamic, clickable view of a DC's physical network, hosts, customer and infrastructure VMs, BGP peerings, advertised routes, route tables, and traffic. YAML must describe/configure the model. Work must proceed in steps with a working commit after each verified increment. Independent development followed by integration into `sev1` remains approved. The latest request replaces protocol simulation with deterministic initial expected-table calculation from YAML.

The user's smaller default scenario supersedes the TODO's original four-border/four-stem/four-leaf/eight-spine example. The defaults and delegated modest limits are listed below. Two ToRs per rack and four members per RS cluster remain: four RS User VMs per DC, four RS Ctrl VMs per DC, and four RS Bolt VMs per bolt. Spine, bolt, rack, host, and VM controls are requested. Use distinct configuration names such as `spine_count` and `hosts_per_rack` instead of the repeated `S` labels in TODO.

The [original TODO](TODO.md) remains unchanged. Later answers establish single cables and full mesh between adjacent fabric tiers (leaf–ToR stays within its bolt), dual-ToR host attachment, and the full-member RS hierarchy. YAML-selected customer VMs peer with all four RS User members and exchange IPv4/IPv6 routes. Every border peers with all four RS Ctrl members and receives IPv4/IPv6/EVPN Type-5 routes, but exports none under D17; border destinations use static forwarding. Each fabric-switch adjacency carries eBGP. These route families are separate from session transport. D02/D05 are approved; D04/D06/D08/D10 defaults are documented as agent-selected under the user's authorization in `DECISIONS.md`.

Expected-table and forwarding context includes **EVPN Type 5, VXLAN, VPCs, and underlay ECMP**. BGP convergence, timed updates, and withdrawals are outside the revised scope. Both customer and RS VM placements may be explicit in YAML; omitted placements use deterministic round-robin across hosts, spreading members of each RS cluster across different hosts where possible. V counts customer VMs only.

Count controls rebuild the configured topology and expected tables, and the result must be exportable as YAML. RS cluster collapse is visual only: show one aggregate icon without changing the underlying network. BGP-session and physical-link visibility are independent switches. When clustering and “show infra VMs on actual hosts” are both enabled, place the aggregate icon on the first member's host.

## Default scenario and initial limits

Defaults are user supplied; maximums are selected under the user's instruction to choose something modest. Counts use the existing TODO hierarchy.

| Dimension | Default | Initial maximum |
| --- | ---: | ---: |
| Borders | 2 | 4 |
| Stems | 2 | 4 |
| Spines | 4 | 8 |
| Bolts | 2 | 4 |
| Leaves per bolt | 2 | 4 |
| Racks per bolt | 2 | 4 |
| ToRs per rack | 2 | 2 (fixed) |
| Hosts per rack | 2 | 4 |
| Customer VMs (V) | 3 | 64 |

V counts customer VMs only; infrastructure VMs are additional. Fabric dimensions must be positive; zero customer VMs is supported. Keep border, stem, and leaf counts configurable in YAML; this does not add unrequested UI controls. Preserve four-member RS clusters at both sizes.

At the default, there are eight hosts, 16 RS VMs, three customer VMs, and 60 physical cables: 47 devices/VMs, excluding group containers. At all maximums, there are 64 hosts, 24 RS VMs, and 432 physical cables. With 64 customer VMs this is 216 devices/VMs, excluding group containers, and 1,040 BGP sessions if all customer VMs opt into RS User peering. These are model-size budgets, not measured renderer performance. Measure the actual browser behavior in Step 13 before claiming responsiveness.

Host IDs are unique within each bolt and labels use the existing three-digit suffix. Address/label unit tests can use larger IDs from the TODO's examples without requiring such a large runnable scenario. The allowed generated scenario sizes fit that suffix.

## Relevant existing code

The first plan preceded application code; the integrated implementation now lives in `cmd/dc-topology/`, `internal/content/dctopology/`, and `web/static/dc-topology/`. The original lecture topology remains separate. This map describes the neighboring site code:

| Responsibility | Existing location relative to the Git root | Implication |
| --- | --- | --- |
| Model, YAML, cable expansion, sample routes | `internal/content/topology.go` | Separate semantic model from screen layout; assess compatible extension versus a separate DC model. |
| Domain tests | `internal/content/topology_test.go` | Preserve current fixtures and behavior when integrating. |
| SVG view/layout | `internal/web/topology.go` | Currently fixed tier rows and four views, not a dynamic DC explorer. |
| Topology fragment/pages | `web/templates/partials/topology.html`, `web/templates/pages/topology.html`, `web/templates/pages/topologies.html` | Preserve existing routes and fragments unless an approved design changes them. |
| Handlers and template data | `internal/web/server.go`, `internal/web/templates.go` | Inspect only the relevant handler/render paths when adding integration. |
| Sample config and browser assets | `content/topologies/spine-leaf.yaml`, `web/static/` | Keep existing content working and assets local. |

The current model allocates IPv4 /31 physical links and finds only direct/two-hop sample paths. It does not supply IPv6 DC addressing, VM placement, an RS hierarchy, or BGP route computation. Do not treat its displayed sample route as an existing BGP simulator. The new hierarchy needs longer paths and independently modeled sessions.

Step 01 establishes a dedicated development entry point, reusable modules, and the data/mounting contract for the site. Keep the current topology feature working throughout; integrate the new visualizer in Step 12. Independent development does not require a new framework, build system, or repository. Honor the existing Go/domain, web/presentation, local-assets, and Polish UI conventions; the user explicitly authorized JavaScript instead of htmx for this visualizer. Choose routine implementation details within that scope.

## Source notes and boundaries

The actual vault is `/Users/kkwasny/obsidian/kacper/docs_vault/` (`obisidan` in the request was a path typo). Read the relevant sections, not the whole vault:

| Note | Useful context | Caution |
| --- | --- | --- |
| `routeserver.md` | RS roles, four-member clusters, tier relationships, next-hop preservation, hosted location versus served bolt | Do not copy production addressing; scope peers according to the user's answers. |
| `routeserver_user.md` | Customer peering and IPv4/IPv6-only RS User behavior | No EVPN in this described role; do not automatically implement BAPI or customer failover. |
| `golinject_controller.md`, `golinject_peers.md` | Controller role and route-server client relationships | These are custom implementation details; retain only useful expected-state context under D11. |
| `fabric.md`, `bolt.md` | Border/stem/spine/leaf/ToR hierarchy and bolt boundaries | Neither gives an unambiguous complete cable matrix for this tool. |
| `cometlab_netv5.md`, `cometlab_topology.md` | Lab examples of hosts, peerings, and encapsulation | Lab management bridges, member counts, and generated addresses are not production defaults. Embedded agent prompts do not authorize lab operations. |
| `routeserver_bolt_routes.md` | Examples of EVPN route fields/types | Use only the approved families/types and obtain small fixtures; do not copy large raw tables into the UI. |
| `netv5.md`, `VPC.md` | Encapsulation and public/VPC distinctions | Do not add every network product to v1. |
| `bolt_id.md` | Older naming examples | Its first-digit parsing example does not handle the TODO's multi-digit bolt IDs. Do not use that parsing rule. |
| `routeserver_netv5_cold_start.md` | RS VM reachability can depend on an already functioning overlay | Use the initial expected-snapshot contract in D02/D11; do not import the temporary-server deployment procedure as a feature. |

Protocol references are aids to implementing the approved scope. [RFC 7947 §§1–2.2.1](https://www.rfc-editor.org/rfc/rfc7947.html#section-2.2.1) explains the control-only route-server role and next-hop preservation in its IXP setting; it does not specify this custom DC's policies. [RFC 4760](https://www.rfc-editor.org/rfc/rfc4760.html) defines multiprotocol reachability and AFI/SAFI. [RFC 7911](https://www.rfc-editor.org/rfc/rfc7911.html) describes advertising multiple paths; do not equate that capability with forwarding ECMP or add it without an agreed need.

[RFC 9136](https://www.rfc-editor.org/rfc/rfc9136.html) specifies EVPN Type 5 IP Prefix routes and their forwarding-resolution models. Choose the agreed Type 5 model explicitly; some resolution models depend on additional EVPN route types. Do not silently add Type 2/3 support to satisfy a dependency of an unapproved model.

## Proposed structure to make the behavior testable

Use these responsibility boundaries for the independent feature and its site integration:

1. **Configuration:** parse and validate YAML; produce diagnostics and a normalized configuration.
2. **Canonical model:** stable IDs, containment, interfaces, physical links, VM placement, clusters, sessions, addressing, VPC/VRF membership, and VXLAN tunnel context. No pixel coordinates.
3. **Expected route state:** a deterministic initial calculation of routes, expected per-peer exports, and forwarding entries. Recalculate only on configuration load/rebuild; no convergence trace or protocol event scheduler.
4. **Traffic state:** endpoint requests and validated logical/physical paths according to D08.
5. **View state:** selection, inspector overlay, filters, collapse/abstraction, viewport, bounded drag offsets, and illustrative-flow switch/clock. View interactions do not change canonical model or expected tables.
6. **Renderer and popup inspectors:** draw the current state, keep edges attached to adjusted endpoints, and explain selected entities over the topology. Decorative flow may use a curated sequence of actual connections; it does not decide routes.

Suggested YAML areas are `schema_version`, topology counts/rules, addressing rules or explicit addresses, VM/RS placement and fallback rules, VPC/VRF definitions and VM attachments, VXLAN endpoints/VNIs, BGP sessions/capabilities/policies, route/scenario data, and initial view settings. Define RD/RT data according to the selected Type 5 import/export model. Select actual key names and required fields in Step 02. Do not turn unresolved values into a supposedly runnable example. Do not require YAML to enumerate values that are deterministically derived from its declared rules.

## Synthetic addressing selected under D06 authorization

Use `2001:db8::/32` for simulated IPv6 identities, the prefix reserved for documentation by [RFC 3849](https://www.rfc-editor.org/rfc/rfc3849.html). Define this fictional layout in YAML:

`2001:db8:<role>:<scope>:<entity-high>:<entity-low>:0:1`

All placeholders are hextets: convert numeric identifiers to hexadecimal; keep human labels decimal. `scope` is a 16-bit bolt identifier for hosts/RS Bolt and zero for DC-wide entities. Split the unsigned 32-bit entity identifier into two 16-bit halves. Use role codes 1 = fabric switch, 2 = host, 3 = RS Bolt, 4 = RS Ctrl, 5 = RS User, 6 = customer VM, 7 = other infrastructure VM. For an RS, the entity identifier is its member number within its scope; for other DC-wide roles it is a unique role-local ID. Host ID allocation still follows the naming decision in D06. Reject overflow instead of wrapping.

Examples (identity /128s, not a decision about connected subnet sizes or route export policy):

| Entity | Expanded IPv6 address |
| --- | --- |
| Host in bolt 13, host ID 45 | `2001:db8:2:d:0:2d:0:1` |
| RS Bolt member 1 serving bolt 13 | `2001:db8:3:d:0:1:0:1` |
| RS Ctrl member 1 | `2001:db8:4:0:0:1:0:1` |
| RS User member 1 | `2001:db8:5:0:0:1:0:1` |
| Customer VM 65536 | `2001:db8:6:0:1:0:0:1` |

For simulated IPv4 identities, allocate from distinct pools within the private `10.0.0.0/8` block described by [RFC 1918](https://www.rfc-editor.org/rfc/rfc1918.html): fabric switches `10.0.0.0/12`, hosts `10.16.0.0/12`, infrastructure/RS VMs `10.32.0.0/12`, customer VMs `10.64.0.0/10`. Assign positive allocation indices from stable entity identities or explicit YAML indices, starting at offset 1; validate collisions and exhaustion. Do not renumber surviving entities by their positions in a newly sorted node list. Define the exact ID-to-index mapping using the confirmed bolt-scoped host IDs and fixed allocation slots that cover the limits above; a fresh load must reproduce allocations from YAML alone. Treat these as identity /32s; do not derive gateway/subnet policy from the pool boundaries.

Unnumbered sessions use modeled link-local endpoints plus explicit interface IDs; endpoint identity must include that interface scope. A global synthetic loopback is not a substitute for an unnumbered endpoint. VPC interface addresses and prefixes belong to their routing context and may overlap between separate VPCs; keep those separate from globally unique entity identities. Any additional connected subnet, tunnel, tenant, or route-origin allocation must also be synthetic and follow the approved forwarding scope. Do not copy raw production outputs from the vault into fixtures, examples, or screenshots.

## Step 00 — Resolve the contract

**Dependencies:** user answers or expressly authorized agent-selected defaults. D01/D02/D05 and D04/D06/D07/D08/D09/D10/D11 are now answered or resolved as documented in `DECISIONS.md`; no unresolved decision blocks Steps 02–11.

**Develop:** write the agreed application boundary, data mode, initial scenarios, address/peering/cabling rules, control semantics, default/maximum scale, and delivery requirements into `DECISIONS.md`. Mark each remaining subquestion pending. Produce a small hand-checkable topology specification with the user-approved rules and expected counts/relationships. Use the latest D11 scope and record routine defaults under the user’s authorization.

**Verify/fix:** compare the contract against every TODO requirement and each conflicting vault note. Ensure each behavioral choice is answered or visibly blocked. A diagram without exact edge membership is insufficient to resolve D04/D05. Do not require answers about excluded features.

**Commit:** `docs(topology): record agreed visualizer contract` — commit the agreed portion and keep outstanding decisions visible; do not call the contract complete while required answers are missing.

## Step 01 — Establish a runnable shell and checks

**Dependencies:** confirmed D01; an implementation approach consistent with the existing project conventions. D10's `/topologie/dc/` route is selected for eventual integration.

**Develop:** create the smallest isolated development page/entry point, a clear empty state, and documented run/build/test commands. Define the reusable module's initialization, configuration loading, event/control boundary, and cleanup so it can mount in `sev1` without a rewrite. Go owns canonical configuration and expected route state; browser ES modules render state and send commands through an adapter. Keep the source and tests under the existing Go repository and browser assets under `web/static/dc-topology/`; do not add a Node build stack. From the Git root, the current harness is `go run ./cmd/dc-topology`, and the eventual site adapter mounts `mountTopologyApp(root, { onCommand })`, delivers state with `setState`, and calls `destroy` when removed. Preserve the existing lecture entry page and topology examples.

**Verify/fix:** run the app from documented commands; open it in a browser at desktop and narrow widths; check console errors and build output. Run existing integration tests if parent application code/templates change. Establish a meaningful smoke check for loading the application.

**Commit:** `feat(topology): add visualizer shell and development checks`.

## Step 02 — Define and validate YAML

**Dependencies:** D02 and all decisions governing fields implemented here, especially D04–D09.

**Develop:** introduce a versioned schema and one small runnable YAML fixture using confirmed values. Distinguish structural containment, cables, sessions, routes, VPC/VRF membership, VXLAN context, and view defaults. Support explicit VM placements and the agreed fallback for missing placements. Report unknown/invalid fields with a useful field path; validate IDs, references, counts/ranges, addresses/prefixes in their routing contexts, placements, families, and the agreed limits. Reject invalid input atomically so it cannot partly replace a valid network. Display a configuration summary and actionable errors in the shell.

**Verify/fix:** load the valid fixture and malformed YAML; test duplicate IDs, missing endpoints/hosts/VPCs, invalid IPv6/prefixes, impossible placements, unsupported families/EVPN types, invalid VNI/route-target references, and count-limit violations. Permit overlapping tenant prefixes in different routing contexts without allowing ambiguous identity/reference collisions. Check that equivalent accepted inputs normalize predictably and a failed load leaves the previous network intact.

**Commit:** `feat(topology): load and validate versioned YAML configurations`.

## Step 03 — Generate and draw the physical fabric

**Dependencies:** Step 02; D04/D06 confirmed.

**Develop:** create borders, stems, spines, bolts, leaves, racks, ToRs, hosts, interfaces, and physical links from the approved rules. Generate addresses and host labels with the agreed numeric encoding. Draw a polished topology-first JavaScript view with readable tiers, compact controls, and pan/zoom or an equivalent navigation method. Add bounded visual dragging per R03; keep edges attached during movement. Keep bolts/racks as groups, not fictitious forwarding devices.

**Verify/fix:** check `leaf_count = leaves_per_bolt × bolts`, `rack_count = bolts × racks_per_bolt`, `tor_count = 2 × rack_count`, and `host_count = rack_count × hosts_per_rack`. With N borders, M stems, P spines, B bolts, L leaves per bolt, R racks per bolt, and H hosts per rack, the cable counts are border–stem `NM`, stem–spine `MP`, spine–leaf `PBL`, leaf–ToR `2BLR`, and ToR–host `2BRH`, totaling `NM + MP + PBL + 2BLR + 2BRH`. Check 60 cables for the default and 432 for all maximums. Independently check actual edge memberships, not only totals. Check endpoint/port existence, ID/address uniqueness, and label functions for bolt 2/host 3, bolt 13/host 45, and bolt 20/host 999. The latter are unit cases, not whole-DC size requirements. Test invalid/overflow input and a path longer than two physical hops. Inspect the actual drawing at two viewport widths.

**Commit:** `feat(topology): generate and render the configured physical fabric`.

## Step 04 — Place customer and infrastructure VMs

**Dependencies:** Step 03; D06/D07 confirmed.

**Develop:** add V customer VMs plus the three RS roles. Honor explicit YAML placement and generate only omitted placements using deterministic round-robin. Establish stable host ordering by bolt/host ID and stable VM ordering by role/cluster/member or customer ID. Preserve explicit placements first; for each RS cluster, prefer the next host not already used by a member of that cluster while such a host exists, then reuse hosts if necessary. Continue round-robin for unplaced customer VMs. Document the cursor/order convention so repeated loads produce the same placements. Each RS member retains `cluster`, `served_bolt` where applicable, and `host` separately. Keep customer VPC attachments independent of physical placement. Show VMs within hosts and differentiate customer VMs and RS VMs. Derive labels/addresses from the canonical model.

**Verify/fix:** independently count four RS User members, four RS Ctrl members, and `4 × bolts` RS Bolt members: `8 + 4 × bolts` RS VMs in total, in addition to exactly V customer VMs. Verify valid host placement and deterministic distribution. Test fully explicit, fully generated, and mixed placements for both customer and RS VMs; explicit placements must survive fallback generation unchanged and invalid explicit placements must report errors. Test host diversity when at least four hosts exist, graceful host reuse with fewer hosts, explicit co-location, and an RS VM hosted outside the bolt it serves. Check zero customer VMs and the configured maximum. Equivalent inputs and repeated loads must reproduce placements.

**Commit:** `feat(topology): place customer VMs and route-server clusters`.

## Step 05 — Generate and inspect BGP sessions

**Dependencies:** Step 04; D05 plus ASN/transport/address rules confirmed.

**Develop:** generate sessions independently of physical cables. Include endpoint identities/interfaces, transport addresses or interface-scoped unnumbered endpoints, local/remote ASNs, negotiated AFI/SAFI, and the agreed session state. Distinguish configured peers from established sessions; do not report operational reachability that Step 07 has not computed or initialized under the expected-snapshot contract. Draw BGP sessions as an independently toggleable layer. Add host, VM, physical-link, and session inspectors as a popup over the topology per R02; display pending route sections accurately until Step 07 provides data. Do not place an inspector above the graph.

**Verify/fix:** compare the exact session set with a manually specified expected matrix. The confirmed full-member matrix requires `4 × hosts` host–RS Bolt sessions, `16 × bolts` RS Bolt–RS Ctrl sessions, 16 RS Ctrl–RS User sessions, and `4 × borders` border–RS Ctrl sessions; count each bidirectional session once. Dual-ToR attachment requires `2 × hosts` host–ToR sessions. C YAML-selected customer VMs produce `4C` customer–RS User sessions; unselected VMs produce none. Fabric-switch sessions total `NM + MP + PBL + 2BLR` under the Step 03 notation. The default has `148 + 4C` total sessions; all maximums with 64 selected customer VMs have 1,040. Check there are no accidental intra-cluster sessions, no EVPN on RS User in the approved role, and no assumption that IPv6 transport limits advertised families to IPv6. Click both physical and logical edges where they overlap.

**Commit:** `feat(topology): model BGP peerings and inspect network entities`.

## Step 06 — Add layer controls and RS presentation modes

**Dependencies:** Step 05; D09 control semantics are confirmed.

**Develop:** independently show/hide physical links and BGP sessions; expose the agreed underlay/overlay view filters. Collapse each RS cluster to one aggregate icon without rebuilding the topology or changing either visibility switch. Support “show infra VMs on actual hosts”: individual VMs appear on their actual hosts, and a collapsed cluster appears on the first member's host in the cluster's declared stable order (generated members 1–4). With that switch off, show the individual/cluster icons in the abstract infrastructure view. Keep canonical placement separate from this display anchor; the other members still live on their actual hosts. Project visible session endpoints onto displayed icons while retaining underlying member/session identities; if coincident edges are aggregated, keep multiplicity and individual inspection available. Preserve selection and offer a clear indication when a selected entity is hidden. Keep detailed cluster membership and differing member states available from the aggregate inspector.

**Verify/fix:** toggle every requested view control independently and in combinations. Compare the canonical model and route state before/after toggles: IDs, placement, actual member count, peer sets, and addresses must stay identical. Check all four clustering/actual-host combinations, including a cluster with members on different hosts: its collapsed icon must anchor to the first member's host when actual-host display is enabled. Independently test physical-links on/off and BGP-sessions on/off in those modes; clustering must not override either visibility choice. Expanding restores individual icons at their actual or abstract locations as selected. Test a cluster with unequal member state and verify those details remain inspectable. Verify edge hit targets and inspector usability at narrow width. Step 11 must also confirm that export preserves all members while this view mode is active.

**Commit:** `feat(topology): add layer filters and route-server view modes`.

## Step 07 — Calculate expected route tables and complete popup inspectors

**Dependencies:** Step 05; D02 as revised by D11, D05/D08. Maps to R04 and R02.

**Develop:** calculate a deterministic expected snapshot when loading/rebuilding valid YAML. Use topology, origins, VPC policy, next-hop resolution, and the documented route-selection profile to produce useful expected speaker tables, expected peer exports, and forwarding views. Reuse existing static calculations where correct; do not build a BGP state machine, update queue, convergence guard, timed learning sequence, or event trace for playback. Keep large details on demand and cache the initial result rather than recomputing on clicks or animation frames.

Keep EVPN Type-5 identity and VPC import context distinct, retain underlay ECMP information, and preserve RS next hops and include every RS ASN in AS_PATH (D15). Label tables as expected state. Complete table filters and empty states in the inspector overlay; do not claim to display live router or guest OS tables.

**Verify/fix:** compare against small independent expected tables and exports, including origin, family, recipient, next hop, VPC, and selected/installed status where relevant. Test VPC isolation with overlapping prefixes, family filtering, unreachable next hops, redundant RS paths, and deterministic repeated load/rebuild. Verify a view toggle, drag, inspector selection, or decorative animation cannot alter the snapshot. Protocol convergence and repeated update-event tests are not acceptance requirements.

**Commit:** `refactor(topology): calculate expected route snapshots`.

## Step 08 — Optional illustrative route flow

**Dependencies:** Steps 05–07; maps to R05.

**Develop:** add a dedicated route-flow switch; D21 supersedes the earlier off-by-default rule with labeled default examples. Use a small fixed, illustrative sequence that follows actual BGP relationships and can project onto current entity/session IDs. It may be hardcoded as presentation logic; do not require a simulator trace or per-peer event engine. Selecting a route may highlight a relevant illustrative path where supported. Describe the visual in Polish as illustrative, not measured convergence or actual route learning. Remove obsolete convergence play/pause/step/speed controls.

**Verify/fix:** switch on/off repeatedly; off stops animation and removes markers. Validate endpoint/session existence and family compatibility for each active example; skip incompatible scenarios. Verify drag/zoom/cluster projection, hidden BGP layer behavior, model rebuild, reduced motion, and teardown. Tables remain unchanged and fully usable with route flow disabled.

**Commit:** `feat(topology): add optional illustrative route flow`.

## Step 09 — Determine traffic paths

**Dependencies:** Steps 03–05 and 07; D02/D05/D08 confirmed, including overlay forwarding behavior.

**Develop:** accept the approved VM/device traffic requests with their VPC/VRF context and resolve them using computed forwarding state. Represent local delivery, VXLAN encapsulation at the source tunnel endpoint, underlay transport of the outer packet, decapsulation at the destination endpoint, and delivery within the destination routing context separately. Apply this path only where the selected scenario requires a tunnel; do not force local same-host delivery through the fabric. Retain the eligible underlay ECMP choices and use a documented deterministic per-flow selector for the displayed path. BGP control packets have session endpoints but may cross multiple physical hops. Expose the path in an inspectable textual form before animating it.

**Verify/fix:** include the agreed scenarios from D08, with independent expected hops for same-host, same-rack, cross-rack, and cross-bolt traffic where in scope. Every physical hop must refer to a real link; each logical transition must have a defined mapping. Test VXLAN endpoint/VNI resolution, correct encapsulation/decapsulation boundaries, and unreachability/loop detection. Verify all eligible underlay ECMP next hops are retained, repeated identical flows select the same path, and chosen fixed flow test vectors exercise multiple eligible paths. Assert that customer traffic does not traverse RS VMs as transit nodes, while traffic whose destination is an RS can reach it. Test tenant separation and overlapping addresses in different VPCs, including a negative case that must not deliver to the wrong VPC.

**Commit:** `feat(topology): resolve VM and control-traffic paths`.

## Step 10 — Retain lightweight data/control traffic illustration

**Dependencies:** Steps 06 and 09. Route-flow animation in Step 08 is independently optional.

**Develop:** retain useful VM and control-traffic examples from the baseline, using the resolved physical paths. Keep route-flow graphics visually distinct from packet paths. Reuse a bounded animation clock where needed; the latest user request does not require a general playback engine, convergence controls, or additional traffic scenarios. Preserve popup usability and view offsets during illustration.

**Verify/fix:** visible hops match valid links and textual paths; local delivery does not invent fabric transit. Check hiding layers, moving endpoints, rebuilding the configuration, reduced motion, and cleanup. Traffic addressed to an RS is valid, but customer data never uses an RS as transit. Decorative animation must not mutate expected tables.

**Commit:** `refactor(topology): simplify traffic illustration controls` if a separate increment is needed.

## Step 11 — Rebuild from count controls and export YAML

**Dependencies:** Steps 02–10; D06/D07/D09 confirmed.

**Develop:** expose separate controls for spines, bolts, racks per bolt, hosts per rack, and the agreed VM count. Each accepted count change rebuilds the topology and consistently recomputes expected route and forwarding state. Apply the new model as one coherent update, clear stale flow markers, drag offsets, and selection references, and retain only compatible view selections. Do not emit unsupported withdrawal events. Provide YAML export of the effective configuration so loading it reproduces the current model, explicit placements, fallback behavior, VPCs, sessions, and policies. Keep RS collapse as a separate visual operation; exporting while collapsed must preserve every actual member and session. Additional upload or in-browser editing features are outside this increment unless separately requested.

**Verify/fix:** change each control individually, then in combination. Check resulting node/link/session/VM counts, placement, VPC state, route state, and stale selection/illustration cleanup. Test minimum/maximum and rejected values; ensure rejection preserves valid state. Export then reload and compare normalized semantics and deterministic expected-table results, not just text formatting. Test export in expanded and collapsed RS modes; the actual network must be identical. Confirm a count change rebuilds the model, while a cluster-visibility toggle does not.

**Commit:** `feat(topology): rebuild topology from controls and export YAML`.

## Step 12 — Integrate the independently developed feature into sev1

**Dependencies:** Steps 01–11; D10 entry point/delivery answered.

**Develop:** mount the existing feature modules in the agreed site route/template, connect YAML loading and initial state, and add the agreed navigation. Reuse the tested initial calculator and JavaScript renderer; do not add htmx interactions to this feature. Apply site typography, colors, and Polish copy without rewriting the model. Package browser assets under embedded `web/`; account for disk-based content and the `-content` path. Preserve existing topology pages and lecture behavior unless the user explicitly requested a replacement.

**Verify/fix:** repeat the same small scenario through the independent harness and site entry point, checking equivalent model/state/paths. Test development mode and a production build with its content directory; check asset paths and direct navigation/reload. Run the parent repository's required tests/build and inspect the integrated page at desktop and narrow widths. Verify component cleanup/remounting through the mount contract. Parent-site htmx must not own topology interactions. Check existing topology pages for regressions.

**Commit:** `feat(topology): integrate the DC visualizer into sev1`.

## Step 13 — Verify scale, polish, and deliver

**Dependencies:** all required previous steps; D06 default/capped sizes and D10 delivery target. Use the authorized desktop/narrow viewports and available browser; report actual responsiveness measurements without inventing an SLA or waiting for a new approval.

**Develop:** address measured bottlenecks at the agreed maximum. Use appropriate detail reduction, table virtualization, edge aggregation, or rendering changes only where measurements justify them. Keep all canonical objects available for accurate inspection even when the drawing is simplified. Finish labels, legends, loading/errors, keyboard access, focus behavior, narrow layout, and user documentation.

**Verify/fix:** run required automated tests and build; run race checks if relevant to integrated shared state. Measure initial load and interaction/animation responsiveness at the agreed default and maximum, recording browser, viewport, model counts, and results. In the browser, complete the acceptance walkthrough below, check console/network errors, reload a scenario, and repeat the key flows at narrow width. Test existing lecture topology pages for regressions.

**Commit:** `feat(topology): finish validated visualizer and usage documentation`. Use smaller `fix(topology): ...` commits for separate verified fixes if this step finds more than one issue.

## Final acceptance walkthrough

1. Load the default YAML; confirm physical counts, cables, addresses, VM placements, and initial expected tables.
2. Inspect a device, host, customer VM, RS VM/cluster, physical link, session, and route. Each opens details in a popup over the visible topology. Verify close, Escape, focus return, scroll, loading/error states, and rapid-selection response ordering.
3. Drag devices within the allowed small offset. Lines and illustrative markers follow; a click still inspects. Check pointer cancel, touch, zoom, keyboard movement, and reset layout. Verify canonical topology, placement, sessions, routes, and YAML export are unchanged.
4. Toggle physical links and BGP sessions independently; test expanded/collapsed RS and actual-host/abstract placement combinations. The first-member host anchor rule remains intact.
5. Verify expected tables are available immediately after load/rebuild and remain identical while inspecting, dragging, toggling layers, or animating. Check Type-5/VPC/next-hop information and VPC isolation against fixtures.
6. Per D21, confirm BGP sessions and route flow start enabled. Observe sequential labeled prefix examples and RS fanout reaching end devices; select a single example to repeat. Disable it and confirm markers and clock stop. Check hidden layers, moved/clustered endpoints, unsupported examples, and reduced motion.
7. Check retained VM/control-traffic examples against resolved paths without RS customer-transit hops; verify the negative cross-VPC case.
8. Change count controls, verify atomic rebuild of topology/expected state and stale-view cleanup, then export/reload YAML. Export while collapsed or dragged retains actual members and placements. Invalid input preserves valid state.
9. Repeat key interactions at 1280×900 and 390×844 and at capped scale; record actual performance and console/network errors. Test mount/destroy for leaked listeners/animation loops.
10. Verify required automated checks and integration when writable. Review unrelated edits and actual commits; report unavailable checks and blocked Git/site writes honestly.

## Requirement coverage

| Current requirement | Steps / rework milestones |
| --- | --- |
| Engaging dynamic JS frontend; topology-first layout | 01, 03, 06, 13 / R01 |
| Popup inspection over the topology | 05, 07 / R02 |
| Small bounded device dragging; model-independent view offsets | 03, 06, 11 / R03 |
| Initial expected route tables, no BGP convergence simulator | 02, 07, 09, 11 / R04 |
| Illustrative route flow, independently switched; D21 starts enabled | 08 / R05 |
| YAML load/export and rebuilding count controls | 02, 11 |
| Confirmed physical fabric, customers/RS VMs, peering matrix | 03–05 |
| Independent link layers, RS collapse, first-member actual-host anchor | 06 |
| Type 5, VXLAN/VPC context, underlay ECMP, useful traffic examples | 07, 09–10 |
| Independent development and eventual sev1 integration | 01, 12 / R06 |
| Desktop/narrow verification, cleanup, scale and delivery | 13 / R06 |
| Commit baseline, then each working increment | R00 and every milestone; `LUNA_GUIDE.md` |
