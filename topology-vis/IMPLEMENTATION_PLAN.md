# DC topology visualizer: implementation plan for GPT-Luna

Status: **Step 01 implemented and verified; remaining steps are pending with explicit decision dependencies**. Read [DECISIONS.md](DECISIONS.md) before choosing behavior and follow the repeated development/verification/commit loop in [LUNA_GUIDE.md](LUNA_GUIDE.md).

## Intended outcome and evidence

The user wants a browser-based, dynamic, clickable view of a DC's physical network, hosts, customer and infrastructure VMs, BGP peerings, advertised routes, route tables, and traffic. YAML must describe/configure the model. Work must proceed in steps with a working commit after each verified increment. On 2026-09-29 the user confirmed independent development followed by integration into `sev1`, and a deterministic simulation configured in YAML.

The user's smaller default scenario supersedes the TODO's original four-border/four-stem/four-leaf/eight-spine example. The defaults and delegated modest limits are listed below. Two ToRs per rack and four members per RS cluster remain: four RS User VMs per DC, four RS Ctrl VMs per DC, and four RS Bolt VMs per bolt. Spine, bolt, rack, host, and VM controls are requested. Use distinct configuration names such as `spine_count` and `hosts_per_rack` instead of the repeated `S` labels in TODO.

The [original TODO](TODO.md) remains unchanged. Later answers establish single cables and full mesh between adjacent fabric tiers (leaf–ToR stays within its bolt), dual-ToR host attachment, and the full-member RS hierarchy. YAML-selected customer VMs peer with all four RS User members and exchange IPv4/IPv6 routes. Every border peers with all four RS Ctrl members and exchanges IPv4/IPv6/EVPN routes. Each fabric-switch adjacency carries eBGP. These route families are separate from session transport. The user delegated a fictional address scheme to the agent to avoid exposing production addressing. Other omissions remain questions in `DECISIONS.md`.

Confirmed simulation scope is **EVPN Type 5, VXLAN, VPCs, and underlay ECMP**. Withdrawals are deferred. Both customer and RS VM placements may be explicit in YAML; omitted placements use deterministic round-robin across hosts, spreading members of each RS cluster across different hosts where possible. V counts customer VMs only.

Count controls rebuild the simulated topology, and the result must be exportable as YAML. RS cluster collapse is visual only: show one aggregate icon without changing the underlying network. BGP-session and physical-link visibility are independent switches. When clustering and “show infra VMs on actual hosts” are both enabled, place the aggregate icon on the first member's host.

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

At planning time, `topology-vis/` has no application code. It is a subdirectory of the Go lecture-site repository. Develop the new feature in isolation while keeping this eventual integration map:

| Responsibility | Existing location relative to the Git root | Implication |
| --- | --- | --- |
| Model, YAML, cable expansion, sample routes | `internal/content/topology.go` | Separate semantic model from screen layout; assess compatible extension versus a separate DC model. |
| Domain tests | `internal/content/topology_test.go` | Preserve current fixtures and behavior when integrating. |
| SVG view/layout | `internal/web/topology.go` | Currently fixed tier rows and four views, not a dynamic DC explorer. |
| Topology fragment/pages | `web/templates/partials/topology.html`, `web/templates/pages/topology.html`, `web/templates/pages/topologies.html` | Preserve existing routes and fragments unless an approved design changes them. |
| Handlers and template data | `internal/web/server.go`, `internal/web/templates.go` | Inspect only the relevant handler/render paths when adding integration. |
| Sample config and browser assets | `content/topologies/spine-leaf.yaml`, `web/static/` | Keep existing content working and assets local. |

The current model allocates IPv4 /31 physical links and finds only direct/two-hop sample paths. It does not supply IPv6 DC addressing, VM placement, an RS hierarchy, or BGP route computation. Do not treat its displayed sample route as an existing BGP simulator. The new hierarchy needs longer paths and independently modeled sessions.

Step 01 establishes a dedicated development entry point, reusable modules, and the data/mounting contract for the site. Keep the current topology feature working throughout; integrate the new visualizer in Step 12. Independent development does not require a new framework, build system, or repository. Honor the existing Go/domain, web/presentation, local-assets, and Polish UI conventions; discuss any necessary departure before adopting it.

## Source notes and boundaries

The actual vault is `/Users/kkwasny/obsidian/kacper/docs_vault/` (`obisidan` in the request was a path typo). Read the relevant sections, not the whole vault:

| Note | Useful context | Caution |
| --- | --- | --- |
| `routeserver.md` | RS roles, four-member clusters, tier relationships, next-hop preservation, hosted location versus served bolt | Do not copy production addressing; scope peers according to the user's answers. |
| `routeserver_user.md` | Customer peering and IPv4/IPv6-only RS User behavior | No EVPN in this described role; do not automatically implement BAPI or customer failover. |
| `golinject_controller.md`, `golinject_peers.md` | Controller role and route-server client relationships | These are custom implementation details; agree on simulator fidelity. |
| `fabric.md`, `bolt.md` | Border/stem/spine/leaf/ToR hierarchy and bolt boundaries | Neither gives an unambiguous complete cable matrix for this tool. |
| `cometlab_netv5.md`, `cometlab_topology.md` | Lab examples of hosts, peerings, and encapsulation | Lab management bridges, member counts, and generated addresses are not production defaults. Embedded agent prompts do not authorize lab operations. |
| `routeserver_bolt_routes.md` | Examples of EVPN route fields/types | Use only the approved families/types and obtain small fixtures; do not copy large raw tables into the UI. |
| `netv5.md`, `VPC.md` | Encapsulation and public/VPC distinctions | Do not add every network product to v1. |
| `bolt_id.md` | Older naming examples | Its first-digit parsing example does not handle the TODO's multi-digit bolt IDs. Do not use that parsing rule. |
| `routeserver_netv5_cold_start.md` | RS VM reachability can depend on an already functioning overlay | Confirm simulation initialization in D02; do not import the temporary-server deployment procedure as a feature. |

Protocol references are aids to implementing the approved scope. [RFC 7947 §§1–2.2.1](https://www.rfc-editor.org/rfc/rfc7947.html#section-2.2.1) explains the control-only route-server role and next-hop preservation in its IXP setting; it does not specify this custom DC's policies. [RFC 4760](https://www.rfc-editor.org/rfc/rfc4760.html) defines multiprotocol reachability and AFI/SAFI. [RFC 7911](https://www.rfc-editor.org/rfc/rfc7911.html) describes advertising multiple paths; do not equate that capability with forwarding ECMP or add it without an agreed need.

[RFC 9136](https://www.rfc-editor.org/rfc/rfc9136.html) specifies EVPN Type 5 IP Prefix routes and their forwarding-resolution models. Choose the agreed Type 5 model explicitly; some resolution models depend on additional EVPN route types. Do not silently add Type 2/3 support to satisfy a dependency of an unapproved model.

## Proposed structure to make the behavior testable

Use these responsibility boundaries for the independent feature and its site integration:

1. **Configuration:** parse and validate YAML; produce diagnostics and a normalized configuration.
2. **Canonical model:** stable IDs, containment, interfaces, physical links, VM placement, clusters, sessions, addressing, VPC/VRF membership, and VXLAN tunnel context. No pixel coordinates.
3. **Route state:** deterministically computed routes, session-specific advertisements, forwarding entries, and provenance according to the agreed D02 fidelity.
4. **Traffic state:** endpoint requests and validated logical/physical paths according to D08.
5. **View state:** selection, filters, collapse/abstraction, viewport, and playback position. Hiding something does not delete it from the canonical model.
6. **Renderer and inspectors:** draw the current state and explain selected entities. Consume domain results; do not invent route decisions.

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

**Dependencies:** user answers. D01 and D02's data mode are answered. Resolve D02's fidelity and D04–D10 before their dependent steps. No application behavior that depends on an unanswered question is authorized.

**Develop:** write the agreed application boundary, data mode, initial scenarios, address/peering/cabling rules, control semantics, default/maximum scale, and delivery requirements into `DECISIONS.md`. Mark each remaining subquestion pending. Produce a small hand-checkable topology specification with the user-approved rules and expected counts/relationships. Record an explicit v1 scope and exclusions only after the user defines them.

**Verify/fix:** compare the contract against every TODO requirement and each conflicting vault note. Ensure each behavioral choice is answered or visibly blocked. A diagram without exact edge membership is insufficient to resolve D04/D05. Do not require answers about excluded features.

**Commit:** `docs(topology): record agreed visualizer contract` — commit the agreed portion and keep outstanding decisions visible; do not call the contract complete while required answers are missing.

## Step 01 — Establish a runnable shell and checks

**Dependencies:** confirmed D01; an implementation approach consistent with the existing project conventions. D10's final public route can remain pending during isolated development.

**Develop:** create the smallest isolated development page/entry point, a clear empty state, and documented run/build/test commands. Define the reusable module's initialization, configuration loading, event/control boundary, and cleanup so it can mount in `sev1` without a rewrite. Go owns canonical configuration and simulation state; browser ES modules render state and send commands through an adapter. Keep the source and tests under the existing Go repository and browser assets under `web/static/dc-topology/`; do not add a Node build stack. The harness is `go run ./cmd/dc-topology`, and the eventual site adapter mounts `mountTopologyApp(root, { onCommand })`, delivers state with `setState`, and calls `destroy` when removed. Preserve the existing lecture entry page and topology examples.

**Verify/fix:** run the app from documented commands; open it in a browser at desktop and narrow widths; check console errors and build output. Run existing integration tests if parent application code/templates change. Establish a meaningful smoke check for loading the application.

**Commit:** `feat(topology): add visualizer shell and development checks`.

## Step 02 — Define and validate YAML

**Dependencies:** D02 and all decisions governing fields implemented here, especially D04–D09.

**Develop:** introduce a versioned schema and one small runnable YAML fixture using confirmed values. Distinguish structural containment, cables, sessions, routes, VPC/VRF membership, VXLAN context, and view defaults. Support explicit VM placements and the agreed fallback for missing placements. Report unknown/invalid fields with a useful field path; validate IDs, references, counts/ranges, addresses/prefixes in their routing contexts, placements, families, and the agreed limits. Reject invalid input atomically so it cannot partly replace a valid network. Display a configuration summary and actionable errors in the shell.

**Verify/fix:** load the valid fixture and malformed YAML; test duplicate IDs, missing endpoints/hosts/VPCs, invalid IPv6/prefixes, impossible placements, unsupported families/EVPN types, invalid VNI/route-target references, and count-limit violations. Permit overlapping tenant prefixes in different routing contexts without allowing ambiguous identity/reference collisions. Check that equivalent accepted inputs normalize predictably and a failed load leaves the previous network intact.

**Commit:** `feat(topology): load and validate versioned YAML configurations`.

## Step 03 — Generate and draw the physical fabric

**Dependencies:** Step 02; D04/D06 confirmed.

**Develop:** create borders, stems, spines, bolts, leaves, racks, ToRs, hosts, interfaces, and physical links from the approved rules. Generate addresses and host labels with the agreed numeric encoding. Draw a first readable tiered physical view with pan/zoom or an equivalent navigation method appropriate to the chosen renderer. Keep bolts/racks as groups, not fictitious forwarding devices.

**Verify/fix:** check `leaf_count = leaves_per_bolt × bolts`, `rack_count = bolts × racks_per_bolt`, `tor_count = 2 × rack_count`, and `host_count = rack_count × hosts_per_rack`. With N borders, M stems, P spines, B bolts, L leaves per bolt, R racks per bolt, and H hosts per rack, the cable counts are border–stem `NM`, stem–spine `MP`, spine–leaf `PBL`, leaf–ToR `2BLR`, and ToR–host `2BRH`, totaling `NM + MP + PBL + 2BLR + 2BRH`. Check 60 cables for the default and 432 for all maximums. Independently check actual edge memberships, not only totals. Check endpoint/port existence, ID/address uniqueness, and label functions for bolt 2/host 3, bolt 13/host 45, and bolt 20/host 999. The latter are unit cases, not whole-DC size requirements. Test invalid/overflow input and a path longer than two physical hops. Inspect the actual drawing at two viewport widths.

**Commit:** `feat(topology): generate and render the configured physical fabric`.

## Step 04 — Place customer and infrastructure VMs

**Dependencies:** Step 03; D06/D07 confirmed.

**Develop:** add V customer VMs plus the three RS roles. Honor explicit YAML placement and generate only omitted placements using deterministic round-robin. Establish stable host ordering by bolt/host ID and stable VM ordering by role/cluster/member or customer ID. Preserve explicit placements first; for each RS cluster, prefer the next host not already used by a member of that cluster while such a host exists, then reuse hosts if necessary. Continue round-robin for unplaced customer VMs. Document the cursor/order convention so repeated loads produce the same placements. Each RS member retains `cluster`, `served_bolt` where applicable, and `host` separately. Keep customer VPC attachments independent of physical placement. Show VMs within hosts and differentiate customer VMs and RS VMs. Derive labels/addresses from the canonical model.

**Verify/fix:** independently count four RS User members, four RS Ctrl members, and `4 × bolts` RS Bolt members: `8 + 4 × bolts` RS VMs in total, in addition to exactly V customer VMs. Verify valid host placement and deterministic distribution. Test fully explicit, fully generated, and mixed placements for both customer and RS VMs; explicit placements must survive fallback generation unchanged and invalid explicit placements must report errors. Test host diversity when at least four hosts exist, graceful host reuse with fewer hosts, explicit co-location, and an RS VM hosted outside the bolt it serves. Check zero customer VMs and the configured maximum. Equivalent inputs and repeated loads must reproduce placements.

**Commit:** `feat(topology): place customer VMs and route-server clusters`.

## Step 05 — Generate and inspect BGP sessions

**Dependencies:** Step 04; D05 plus ASN/transport/address rules confirmed.

**Develop:** generate sessions independently of physical cables. Include endpoint identities/interfaces, transport addresses or interface-scoped unnumbered endpoints, local/remote ASNs, negotiated AFI/SAFI, and the agreed session state. Distinguish configured peers from established sessions; do not report operational reachability that Step 07 has not computed or initialized under the agreed simulation contract. Draw BGP sessions as an independently toggleable layer. Add basic host, VM, physical-link, and session inspectors; display pending route sections accurately until Step 07 provides data.

**Verify/fix:** compare the exact session set with a manually specified expected matrix. The confirmed full-member matrix requires `4 × hosts` host–RS Bolt sessions, `16 × bolts` RS Bolt–RS Ctrl sessions, 16 RS Ctrl–RS User sessions, and `4 × borders` border–RS Ctrl sessions; count each bidirectional session once. Dual-ToR attachment requires `2 × hosts` host–ToR sessions. C YAML-selected customer VMs produce `4C` customer–RS User sessions; unselected VMs produce none. Fabric-switch sessions total `NM + MP + PBL + 2BLR` under the Step 03 notation. The default has `148 + 4C` total sessions; all maximums with 64 selected customer VMs have 1,040. Check there are no accidental intra-cluster sessions, no EVPN on RS User in the approved role, and no assumption that IPv6 transport limits advertised families to IPv6. Click both physical and logical edges where they overlap.

**Commit:** `feat(topology): model BGP peerings and inspect network entities`.

## Step 06 — Add layer controls and RS presentation modes

**Dependencies:** Step 05; D09 control semantics are confirmed.

**Develop:** independently show/hide physical links and BGP sessions; expose the agreed underlay/overlay view filters. Collapse each RS cluster to one aggregate icon without rebuilding the topology or changing either visibility switch. Support “show infra VMs on actual hosts”: individual VMs appear on their actual hosts, and a collapsed cluster appears on the first member's host in the cluster's declared stable order (generated members 1–4). With that switch off, show the individual/cluster icons in the abstract infrastructure view. Keep canonical placement separate from this display anchor; the other members still live on their actual hosts. Project visible session endpoints onto displayed icons while retaining underlying member/session identities; if coincident edges are aggregated, keep multiplicity and individual inspection available. Preserve selection and offer a clear indication when a selected entity is hidden. Keep detailed cluster membership and differing member states available from the aggregate inspector.

**Verify/fix:** toggle every requested view control independently and in combinations. Compare the canonical model and route state before/after toggles: IDs, placement, actual member count, peer sets, and addresses must stay identical. Check all four clustering/actual-host combinations, including a cluster with members on different hosts: its collapsed icon must anchor to the first member's host when actual-host display is enabled. Independently test physical-links on/off and BGP-sessions on/off in those modes; clustering must not override either visibility choice. Expanding restores individual icons at their actual or abstract locations as selected. Test a cluster with unequal member state and verify those details remain inspectable. Verify edge hit targets and inspector usability at narrow width. Step 11 must also confirm that export preserves all members while this view mode is active.

**Commit:** `feat(topology): add layer filters and route-server view modes`.

## Step 07 — Supply route state and complete table inspectors

**Dependencies:** Step 05; D02/D05/D08 confirmed. Step 06 is not required for engine work.

**Develop:** implement only the agreed route origination, acceptance, selection, next-hop handling, import/export, and forwarding-table rules. Keep separate route candidates, selected routes, per-peer advertised routes, and installed forwarding entries where the contract needs them. Define deterministic event ordering and a convergence/loop guard. Transparent RS relaying must not be implemented as a generic shortest-path algorithm or rely on an invented AS-path prepend to stop loops. Honor the agreed initialization and session-reachability model so overlay routes are not used to silently justify their own prerequisite RS connectivity. Store a repeatable event trace and use the same engine for inspection and playback.

Model EVPN Type 5 prefix advertisements with their route identity, import/export context, and selected next-hop/VXLAN resolution data. Keep each VPC's forwarding state separate; the same prefix in different VPCs must not overwrite or leak into another routing context. Preserve eligible underlay ECMP next-hop sets. Do not implement route withdrawals in v1; scenario rebuilds must reconstruct valid state without pretending to emit withdrawal events.

Complete the host/VM route-table inspectors and session advertised/received route views with the agreed fields, filters, and empty states. Expose the VPC/VRF context, Type 5 route information, VXLAN endpoint/VNI, and underlay ECMP next hops where relevant. A prefix string alone is not a sufficient key for EVPN route identity. Do not assume a guest VM's forwarding table is identical to its host's BGP table.

**Verify/fix:** use small, independently authored expected tables and advertisements, including origin, receiving peer, family, next hop, selected/installed status, and policy outcome as applicable. Test duplicate receipt via redundant members, forbidden family export, unreachable next hop, and repeated identical updates. Test Type 5 route propagation, VPC import isolation with overlapping prefixes, and multiple eligible underlay next hops. Ensure RS propagation preserves the agreed original forwarding next hop. Repeated runs with the same configuration and actions must produce the same route state and event trace. Assert bounded convergence and explicit diagnostics if the guard is reached. Withdrawal/reconvergence tests are not required for this version.

**Commit:** `feat(topology): provide route state and host VM session tables`. Split the engine and inspector into separate verified commits if needed.

## Step 08 — Visualize route advertisements

**Dependencies:** Steps 06–07.

**Develop:** connect simulator advertisement events to directional animation on the correct BGP sessions. Selecting a route should explain its origin and its propagation to each recipient. Add play, pause, single-step, speed, and reset controls for the deterministic event trace. Mark route advertisements differently from data packets using labels/line treatment as well as color.

**Verify/fix:** compare each visible propagation step with the source event and inspector state. No event may travel over a nonexistent session or unsupported family. Check branching propagation, pause/resume/reset, repeated playback, selected-route filtering, and cluster presentation. A paused or reduced-motion display must still communicate direction and event meaning. Do not present playback speed as measured network convergence time.

**Commit:** `feat(topology): animate and explain route advertisements`.

## Step 09 — Determine traffic paths

**Dependencies:** Steps 03–05 and 07; D02/D05/D08 confirmed, including overlay forwarding behavior.

**Develop:** accept the approved VM/device traffic requests with their VPC/VRF context and resolve them using computed forwarding state. Represent local delivery, VXLAN encapsulation at the source tunnel endpoint, underlay transport of the outer packet, decapsulation at the destination endpoint, and delivery within the destination routing context separately. Apply this path only where the selected scenario requires a tunnel; do not force local same-host delivery through the fabric. Retain the eligible underlay ECMP choices and use a documented deterministic per-flow selector for the displayed path. BGP control packets have session endpoints but may cross multiple physical hops. Expose the path in an inspectable textual form before animating it.

**Verify/fix:** include the agreed scenarios from D08, with independent expected hops for same-host, same-rack, cross-rack, and cross-bolt traffic where in scope. Every physical hop must refer to a real link; each logical transition must have a defined mapping. Test VXLAN endpoint/VNI resolution, correct encapsulation/decapsulation boundaries, and unreachability/loop detection. Verify all eligible underlay ECMP next hops are retained, repeated identical flows select the same path, and chosen fixed flow test vectors exercise multiple eligible paths. Assert that customer traffic does not traverse RS VMs as transit nodes, while traffic whose destination is an RS can reach it. Test tenant separation and overlapping addresses in different VPCs, including a negative case that must not deliver to the wrong VPC.

**Commit:** `feat(topology): resolve VM and control-traffic paths`.

## Step 10 — Animate data and control traffic

**Dependencies:** Steps 06, 08, and 09.

**Develop:** animate flows along the resolved links/session paths using a shared clock and bounded rendering work. Show source/destination, direction, traffic kind, and the selected underlay/overlay relationship. Keep packet movement distinct from route learning. Allow the agreed playback/flow selection while preserving inspector and viewport state.

**Verify/fix:** compare animated hops with the textual path and event sequence. Check both directions, pause/resume, speed changes, restart, toggling layers during playback, and local delivery with no fabric transit. Show the VXLAN inner/outer path relationship and the selected underlay ECMP path without animating one flow as if it were duplicated onto every alternative. Hidden links must not cause packets to jump onto unrelated visible links. Check that route and traffic animations can coexist without hiding their meaning. Respect reduced-motion preferences and check for leaked animation loops after reload/reset.

**Commit:** `feat(topology): animate VM and BGP control traffic`.

## Step 11 — Rebuild from count controls and export YAML

**Dependencies:** Steps 02–10; D06/D07/D09 confirmed.

**Develop:** expose separate controls for spines, bolts, racks per bolt, hosts per rack, and the agreed VM count. Each accepted count change rebuilds the topology and consistently recomputes simulation state. Apply the new model as one coherent update, clear stale events/references, and retain only compatible view selections. Do not emit unsupported withdrawal events. Provide YAML export of the effective configuration so loading it reproduces the current model, explicit placements, fallback behavior, VPCs, sessions, and policies. Keep RS collapse as a separate visual operation; exporting while collapsed must preserve every actual member and session. Additional upload or in-browser editing features are outside this increment unless separately requested.

**Verify/fix:** change each control individually, then in combination. Check resulting node/link/session/VM counts, placement, VPC state, route state, and stale selection/event cleanup. Test minimum/maximum and rejected values; ensure rejection preserves valid state. Export then reload and compare normalized semantics and deterministic simulation results, not just text formatting. Test export in expanded and collapsed RS modes; the actual network must be identical. Confirm a count change rebuilds the model, while a cluster-visibility toggle does not.

**Commit:** `feat(topology): rebuild topology from controls and export YAML`.

## Step 12 — Integrate the independently developed feature into sev1

**Dependencies:** Steps 01–11; D10 entry point/delivery answered.

**Develop:** mount the existing feature modules in the agreed site route/template, connect YAML loading and initial state, and add the agreed navigation. Reuse the tested engine and renderer. Apply site typography, colors, and Polish copy without rewriting the model. Package browser assets under embedded `web/`; account for disk-based content and the `-content` path. Preserve existing topology pages and lecture behavior unless the user explicitly requested a replacement.

**Verify/fix:** repeat the same small scenario through the independent harness and site entry point, checking equivalent model/state/paths. Test development mode and a production build with its content directory; check asset paths and direct navigation/reload. Run the parent repository's required tests/build and inspect the integrated page at desktop and narrow widths. Verify component cleanup/remounting if htmx can replace its containing fragment. Check existing topology pages for regressions.

**Commit:** `feat(topology): integrate the DC visualizer into sev1`.

## Step 13 — Verify scale, polish, and deliver

**Dependencies:** all required previous steps; D06 default/capped sizes and D10 delivery target. Agree on the target browser/device and responsiveness criteria before claiming performance acceptance.

**Develop:** address measured bottlenecks at the agreed maximum. Use appropriate detail reduction, table virtualization, edge aggregation, or rendering changes only where measurements justify them. Keep all canonical objects available for accurate inspection even when the drawing is simplified. Finish labels, legends, loading/errors, keyboard access, focus behavior, narrow layout, and user documentation.

**Verify/fix:** run required automated tests and build; run race checks if relevant to integrated shared state. Measure initial load and interaction/animation responsiveness at the agreed default and maximum, recording browser, viewport, model counts, and results. In the browser, complete the acceptance walkthrough below, check console/network errors, reload a scenario, and repeat the key flows at narrow width. Test existing lecture topology pages for regressions.

**Commit:** `feat(topology): finish validated visualizer and usage documentation`. Use smaller `fix(topology): ...` commits for separate verified fixes if this step finds more than one issue.

## Final acceptance walkthrough

1. Load an agreed YAML scenario and confirm physical counts, cabling, addressing, and VM placements.
2. Inspect a physical link, a host, a customer VM, and an RS VM; check their details against the fixture.
3. Inspect one session of each approved kind, including AFI/SAFI, endpoint addresses/interfaces, and advertised/received routes.
4. Toggle physical links and BGP sessions independently; collapse/expand RS clusters; switch infrastructure VMs between actual-host and abstract display. A cluster shown on actual hosts anchors to its first member's host. The actual network remains the same, and clustering does not change either link-visibility switch.
5. Select a route and follow its advertisements from origin to recipients. Confirm host/VM tables reflect the deterministic simulation state.
6. Run the approved VM traffic and BGP control traffic scenarios. Follow Type 5-derived VXLAN forwarding, the selected underlay ECMP path, and the correct VPC context without using RSs as customer-traffic transit. Verify the negative cross-VPC case.
7. Use playback controls and change views while animations run; inspect state without losing selection unexpectedly.
8. Change every topology count control and verify the model rebuilds. Export YAML and reload it to reproduce the same model/simulation, including all RS members when exported from collapsed mode. Invalid input produces useful errors and preserves valid state.
9. Repeat the important interactions at the agreed maximum scale and at narrow width; record actual results against the agreed targets.
10. Verify clean build/tests, review the final diff for unrelated edits, and ensure each completed increment has a local commit and a concise progress record. Report any remaining blocker without declaring unfinished work complete.

## Requirement coverage

| TODO requirement | Steps |
| --- | --- |
| YAML config describes the network and behavior | 00, 02, 11 |
| Physical topology; partial underlay/overlay views | 03, 06, 09 |
| Customer VMs and infrastructure VMs | 04 |
| BGP peerings, including route-server hierarchy | 05 |
| Link and BGP-session inspection, AFIs/IPs/routes | 05, 07 |
| Host and VM route tables | 07 |
| Route origins, destinations, and advertisement flow | 07–08 |
| Traffic between VMs and devices/control traffic | 09–10 |
| Flow animation on session/link lines | 08, 10 |
| One RS icon per cluster; actual-host/abstract display; first-member host anchor | 06 |
| Physical-link and BGP visibility switches | 05–06 |
| Spine/bolt/rack/host/VM controls rebuild the topology | 11 |
| Export effective configuration as YAML and reload it | 11 |
| Independent development followed by sev1 integration | 01, 12 |
| Deterministic YAML-configured simulation | 02, 07–11 |
| Explicit VM/RS placement with generated fallback | 02, 04 |
| EVPN Type 5, VXLAN, and VPC isolation | 02, 04, 07–10 |
| Underlay ECMP | 07, 09–10 |
| Withdrawals deferred | 07, 11; no withdrawal-dependent acceptance gate |
| Scale, usability, and final delivery | 13 |
| Verify, fix, commit, repeat | Every step; `LUNA_GUIDE.md` |
