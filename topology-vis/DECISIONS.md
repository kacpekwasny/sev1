# Decisions and implementation defaults

Status on 2026-09-30: **D15 is the latest direction.** It refines RS placement, EVPN IPv4 next hops, packet fields and click selection, popup movement, and route provenance/navigation. D11–D13 continue to define the JavaScript workspace, static expected-state model, and optional illustrative flow. Earlier decisions apply only where they do not conflict with these updates.

The user approved defaults and authorized reasonable assumptions and autonomous work while unavailable. Git/parent-site writes are available, and desktop/narrow browser acceptance has run; see progress for actual checks.

## Decision record

### D01 — Application and repository boundary

Answer, 2026-09-29: **“I want you to develop this independently for speed, but it will be part of the sev1 website.”**

Develop the feature in isolation with a dedicated development entry point and a defined mounting/data boundary. Include a final `sev1` integration step. Preserve the parent site's Go, template, local-asset, and Polish UI conventions. D11 explicitly authorizes a JavaScript frontend without htmx for this feature; retain the existing ES-module approach by default. Do not create a new Git repository.

Current facts: `topology-vis/` contains the original `TODO.md` and handoff documentation; implementation now lives in parent content/web/cmd paths; its Git root is the parent `sev1/` repository. The parent has an existing, much simpler topology view. Keep that working during independent development.

Status: **product boundary answered**. Step 01 must document the concrete module/harness layout and its integration contract. The latest JavaScript direction is an authorized departure from the htmx convention for this visualizer. Routine implementation choices may be made under the user’s delegation.

### D02 — Source of routes and traffic; fidelity

Answer, 2026-09-29: **“A deterministic simulation configured in YAML.”**

Revised by D11, 2026-09-30: YAML describes the model, rules, and scenarios. Compute expected route/forwarding tables on initial load and configuration rebuild. A protocol/convergence simulator is unnecessary. Independent expected tables remain useful test fixtures; live collection is outside scope.

Fidelity answer, 2026-09-29: **“evpn 5; model vxlan; model vpcs; no withdrawls for now needed; ecmp in underlay should be;”**

Retained expected-state context: EVPN Type 5, VXLAN encapsulation, VPCs with distinct routing contexts, and underlay ECMP. Protocol updates, convergence, and withdrawals are outside the revised scope. Do not add EVPN Types 2/3 or withdrawal-driven failure/reconvergence behavior to the current increment. A scenario reset or topology rebuild is not a simulated BGP withdrawal.

Approved defaults, 2026-09-29, after the user replied **“Approve”**:

- Start from a deterministic, preconverged underlay snapshot. Compute physical-link BGP reachability first; only establish RS/customer sessions after their IPv6 transport endpoints resolve through that underlay. Give each RS VM a synthetic service address reachable through its hosting host, without requiring EVPN/VXLAN to bootstrap the session. Do not animate a cold-start or withdrawal sequence in v1.
- Treat each host as an NVE for the VMs placed on it. Originate Type-5 routes only for configured VM prefixes in their attached VPC; require explicit YAML route origins for other prefixes. Use the interface-less IP-VRF-to-IP-VRF model: no overlay index and no dependency on Type 2/3. The route's BGP next hop is the source host's synthetic VTEP address, resolved by underlay reachability (IPv4 VTEP/next hop per D14); the VPC VNI supplies the VXLAN context. RFC 9136 describes this no-overlay-index case for IP NVO tunnels and uses the Type-5 BGP next hop as the forwarding endpoint.
- Give every VPC a positive 16-bit `vpc_id`. Use RT `target:64512:<vpc_id>`, VNI `10000 + vpc_id`, and an RD unique per `(vpc_id, NVE)`: `64512:(65536 * vpc_id + nve_id)`, where `nve_id` is a stable, globally unique 16-bit host/NVE ID. Validate the packed value and reject duplicate IDs, RDs, RTs, or VNIs. Import only routes whose RT matches the receiving VPC; export only within that VPC. No route leaking or default/shared VPC is enabled by default. Separate VPCs retain separate route keys even when their IP prefixes overlap. The proposed RT encoding uses the two-octet-AS-specific Route Target format; the RD distinguishes origins as well as VPCs.
- Apply family and VPC import checks before selection. Discard routes with an unresolved next hop or an AS-path loop. For eligible alternatives, use a small deterministic profile: local preference 100 by default (internal policy metadata, not sent over eBGP), shorter AS_PATH, lower ORIGIN code, lower MED when neighboring ASNs match (missing MED treated as zero), lower underlay cost to the resolved next hop, then stable route-origin ID. Keep one BGP best path per destination; underlay ECMP remains a separate next-hop-resolution result and retains all equal-cost physical paths. Do not enable BGP multipath or ADD-PATH.
- Treat the RS tiers as control-plane brokers only. A route server preserves the learned NEXT_HOP and never becomes a data-packet hop. **D15 overrides the former transparent AS_PATH default:** this deployment prepends each RS ASN. Filter routes by recipient policy before selecting one best advertisement per recipient, so a route filtered for one client does not hide an eligible alternative from it. Suppress reflection to the ingress peer and reject detected loops. RFC 7947 explains a different IXP transparency policy; this custom DC follows the user-defined prepending behavior. No temporal propagation simulation is required.

The UI must identify tables as expected calculated state and route-flow graphics as illustrative; do not imply live or simulated protocol convergence.

Status: **D02 revised by D11**. Retain applicable static routing/initialization defaults in Steps 02, 07, and 09; do not implement a convergence/event engine to satisfy this earlier decision.


### D04 — Exact physical cabling

Answers, 2026-09-29: **“assume every connection is a single cable; host connects to both tors;”**, then **“Yes, every device from adjecent tier.”** in response to the full-mesh question below.

Confirmed: one cable per connected device pair; full mesh between the adjacent tiers below; every host connects to both ToRs in its rack.

| Connection | Confirmed mapping |
| --- | --- |
| Border ↔ stem | Every border to every stem. |
| Stem ↔ spine | Every stem to every spine. |
| Spine ↔ leaf | Every spine to every leaf in every bolt. |
| Leaf ↔ ToR | Every leaf to every ToR within the same bolt. |
| ToR ↔ host | Confirmed: two links per host, one to each ToR in its rack. |

Use `racks_per_bolt` for R and two ToRs per rack, as specified in the TODO; no independent T control is needed. No intra-tier links or parallel cables have been requested. Agent-selected v1 default, authorized 2026-09-29: physical links model adjacency only, with no bandwidth, cost, failure, or utilization state. Do not imply that the displayed topology represents operational capacity or health.

Status: **connectivity answered**. Step 03 can use this exact adjacency matrix once its schema/address/scale dependencies are ready.

### D05 — BGP matrix and overlay scope

Answer, 2026-09-29, to the full-member hierarchy and inclusion of customer/border sessions: **“Yes, everything should be included; Border-rsctrl is all afi; vm-rsuser is v4/v6;”**

Confirmed: each host peers with all four RS Bolt members serving its bolt, each RS Bolt peers with all four RS Ctrl members, and each RS Ctrl peers with all four RS User members. Include customer VM–RS User and border–RS Ctrl sessions. Customer sessions carry IPv4/IPv6; border sessions carry all three families under discussion (IPv4, IPv6, EVPN). This does not imply every AFI/SAFI ever defined or unrelated vault projects.

Follow-up answer, 2026-09-29: **“yes; only yaml; yes”** — every border peers with all four RS Ctrl members; only customer VMs selected in YAML peer with all four RS User members; every physical fabric-switch adjacency has an eBGP session.

| Endpoints | Membership / transport | Family status |
| --- | --- | --- |
| Host ↔ ToR | Attached ToRs, BGP unnumbered | Underlay IPv4/IPv6 scope |
| Host ↔ RS Bolt | Confirmed: all four members serving the host's bolt; IPv6 transport | IPv4/IPv6 unicast support to finalize; EVPN Type 5 in scope |
| RS Bolt ↔ RS Ctrl | Confirmed: every bolt RS to all four controller RSs; IPv6 transport | IPv4/IPv6 unicast support to finalize; EVPN Type 5 in scope |
| RS Ctrl ↔ RS User | Confirmed: every controller RS to all four user RSs; IPv6 transport | IPv4/IPv6 unicast; vault says RS User has no EVPN |
| Customer VM ↔ RS User | Confirmed: YAML-selected VMs to all four RS User members | Confirmed IPv4/IPv6 unicast |
| Border ↔ RS Ctrl | Confirmed: every border to all four RS Ctrl members | Confirmed IPv4/IPv6 unicast and EVPN Type 5 |
| Fabric switch ↔ fabric switch | Confirmed: eBGP on every physical switch adjacency | Underlay IPv4/IPv6 scope to finalize |

Approved defaults, 2026-09-29, after the user replied **“Approve”**:

| Endpoints | Proposed AFI/SAFI | Purpose |
| --- | --- | --- |
| Host ↔ ToR | IPv4 unicast, IPv6 unicast | Underlay |
| Fabric switch ↔ fabric switch | IPv4 unicast, IPv6 unicast | Underlay |
| Host ↔ RS Bolt | IPv4 unicast, IPv6 unicast, EVPN Type 5 | Underlay reachability and VPC prefixes |
| RS Bolt ↔ RS Ctrl | IPv4 unicast, IPv6 unicast, EVPN Type 5 | Underlay reachability and VPC prefixes |
| RS Ctrl ↔ RS User | IPv4 unicast, IPv6 unicast | Customer routing; no EVPN |
| Customer VM ↔ RS User | IPv4 unicast, IPv6 unicast | Confirmed customer session scope |
| Border ↔ RS Ctrl | IPv4 unicast, IPv6 unicast, EVPN Type 5 | Confirmed “all AFI” within this v1 scope |

“EVPN Type 5” means AFI L2VPN / SAFI EVPN with Type-5 IP Prefix routes only. It does not authorize Types 1–4 or other AFI/SAFI. Session transport remains as already recorded in the confirmed table and is independent of these route families.

Allocate a distinct private two-octet ASN to every BGP speaker, including each switch, host, RS member, and customer VM. Use deterministic role-scoped ID slots in these disjoint ranges (maximum sizes from D06): borders `64512–64515`; stems `64516–64519`; spines `64520–64527`; leaves `64528–64543`; ToRs `64544–64575`; hosts `64576–64639`; RS Bolt `64640–64655`; RS Ctrl `64656–64659`; RS User `64660–64663`; customer VMs `64664–64727`. Slots follow stable entity identity and scope, never screen position or VM placement; reject collisions and exhaustion. These ranges fit the 216-speaker cap and lie within RFC 6996's private-use two-octet range. The exact stable ID-to-slot mapping belongs in the Step 02 schema alongside the synthetic address allocation.

Status: **D05 answered and approved**. Keep the confirmed relationships and transport details above distinct from the selected family/ASN defaults. Do not add other sessions, including intra-cluster peerings, without a corresponding requirement.

### D06 — Addresses, identifiers, defaults, and capacity

Answer, 2026-09-29: **“I do not want to expose real production IP schema. You can come up with something yourself.”**

The agent is authorized to design fictional addressing. Use the synthetic scheme in `IMPLEMENTATION_PLAN.md`; keep all checked-in examples, screenshots, and fixture outputs independent of production addressing. This supersedes the ambiguous TODO address patterns, including the duplicated RS Ctrl label. It does not authorize choosing unknown scale or host naming semantics.

Scale answer, 2026-09-29: **“default could be 2 border, 2 stem, 4 spine, 2 bolts, 2 leafs, 2 racks, 2 tors, 2 servers, 3 vms; max should be something sane, not too much; ids unique within bolt”**

Confirmed: host IDs are unique within their bolt. Defaults, using the hierarchy already defined in TODO: two borders, two stems, four spines, two bolts, two leaves per bolt, two racks per bolt, two ToRs per rack, two hosts per rack, and three customer VMs. These smaller default counts supersede TODO's original four-border/four-stem/four-leaf/eight-spine example; RS clusters still have four members. D07 confirms that V counts only customer VMs.

The user delegated a modest maximum. The agent-selected initial caps are four borders, four stems, eight spines, four bolts, four leaves per bolt, four racks per bolt, two ToRs per rack, four hosts per rack, and 64 customer VMs. Allow zero customer VMs; fabric dimensions must be positive and ToRs remain two per rack. The maximum has 64 hosts, so it stays below the three-digit host suffix limit. Retain the TODO's host-label examples as unit cases rather than supported whole-DC sizes.

Agent-selected verification defaults, authorized 2026-09-29: inspect Chromium at 1280×900 and 390×844, measure the default and capped scenarios, and report actual results. No numeric performance SLA is assumed; avoid claiming one.

Status: **synthetic addressing, modest caps, defaults, and bolt-scoped host IDs confirmed/delegated**. Performance verification uses the agent-selected viewports; no SLA is claimed.

## Additional answers and implementation defaults

### D07 — VM and route-server placement

Answer, 2026-09-29: **“RS VM can be explicit in yaml, and if not it should be generated; the same for customer VMs”**

Confirmed: honor explicit YAML placement for both RS and customer VMs; generate placement for either kind when omitted. Explicit placement takes precedence. The automatic fallback must be reproducible, consistent with deterministic configuration-derived expected state.

Follow-up answer, 2026-09-29: **“ok; only customer;”** — use deterministic round-robin across hosts, preserve explicit placements, spread members of each RS cluster across different hosts where possible, and count only customer VMs in V.

The original fallback used all available hosts without bolt affinity. **D14 supersedes that rule:** RS Bolt members stay in their served bolt; RS Ctrl spans all configured bolts. Compatible explicit placements remain authoritative, including co-location. Generated members prefer different hosts within the required bolt, reusing hosts only when necessary. No additional infrastructure VM roles have been requested.

Status: **placement and V semantics answered**. Use stable host/VM ordering, deterministic round-robin, and generated-placement tests in Step 04.

### D08 — Meaning of route tables and traffic examples

Agent-selected defaults, authorized 2026-09-29 when the user said they would be unavailable and **“You can make assumptions here”**:

- Keep BGP received, selected, and per-peer advertised routes distinct from installed forwarding entries. Show BGP tables for BGP speakers; show each host/NVE's installed VPC forwarding table separately. Do not claim to show a guest OS table. A selected customer VM that peers with RS User has both its own BGP session view and an installed VPC forwarding view. Show Type-5 route details separately with route identity, VPC/RD/RT/VNI, origin, next hop, and underlay resolution.
- Support same-host, same-rack, cross-rack within one bolt, cross-bolt, border-prefix, and BGP-control traffic examples. The YAML may select concrete endpoints; the UI can also choose compatible VM endpoints. Explain both the logical BGP session and the physical underlay hops for control packets. Customer data traffic never transits an RS VM. Cross-VPC traffic is rejected unless an explicit leak policy is added in a future scope; v1 has no such policy.

Status: **resolved by agent-selected defaults under the user's explicit authorization, with D11 reducing simulation and playback scope**. Keep useful static tables and traffic examples in Steps 07–10; use popup inspection and optional illustrative route flow.

### D09 — Controls and YAML persistence

Answer, 2026-09-29: **“it should rebuild the topo; exportable via yaml; in this case I don't want to rebuild the topo, I just want the visualization to hide all the connections and visually join all RSs from a cluster into a single icon”**

Confirmed:

- Spine/bolt/rack/host/VM count controls rebuild the configured topology. Recompute expected route/forwarding state consistently; do not implement them as visibility filters.
- The configured result must be exportable as YAML and reproduce the same model when loaded again.
- One-RS-per-cluster mode is a presentation-only operation: combine the members into one cluster icon. Keep all actual RS members, placements, sessions, and route state; do not rebuild the topology or substitute one member for the cluster.
- Collapsed display state must not erase members or sessions from YAML export.

Clarification, 2026-09-29: **“Not sure what hide all connections mean; hide bgp sessions means hide bgp sessions; hide physical links, means hide physical links; when the switch \"show infra vms on actual hosts\" is on, and also clustering of infrastrucutre VMs is on, then cluster the VM at the host where the first VM from the cluster is located”**

This clarification supersedes the earlier interpretation that clustering itself hides connections. BGP-session visibility and physical-link visibility are separate switches. Clustering does not override either. When both clustering and “show infra VMs on actual hosts” are enabled, anchor the aggregate icon on the host containing the first cluster member. Use the cluster's declared stable member order (generated members 1–4); this display anchor is not a new placement for the other members. Expose differing member details in the inspector rather than pretending all member states are identical. Additional upload/in-browser editing workflows are not required merely by the YAML export request.

Status: **control semantics answered**. Step 06 must test clustering, actual-host placement, and both independent link-layer switches in combination.

### D10 — Integration entry point and delivery

D01 establishes that the visualizer will become part of the `sev1` website. The parent project's conventions specify Polish copy, Poppins, and local assets. Production embeds `web/` assets but keeps YAML content on disk.

Agent-selected defaults, authorized 2026-09-29 when the user said they would be unavailable and **“You can make assumptions here”**: add the visualizer as a new page at `/topologie/dc/`, linked from the existing Topologie area; preserve `/topologie/` and all existing topology pages. Keep the independent harness as a development tool, with production delivery through the existing `sev1` Go site and embedded `web/` assets. No separate distributable is required.

Status: **resolved by agent-selected defaults under the user's explicit authorization**. Step 12 can integrate without replacing existing topology routes.

### D11 — JavaScript redesign, popup inspection, expected tables, and dragging

User direction, 2026-09-30:

- **“Commit work.”** Preserve the existing implementation in a scoped baseline commit before reworking it, then commit verified increments. The current Git staging attempt failed because `/Users/kkwasny/code/sev1/.git/index.lock` cannot be created under workspace permissions; this earlier execution blocker was resolved when the user granted parent workspace access and committed baseline `9c50463`.
- **“I would like the frontend to be much more interesting, I don't want it to be HTMX. I want a nice looking dynamic JS.”** Make the topology the primary workspace with a substantial visual redesign and JavaScript interactions. Other site pages may continue using htmx.
- **“When I cick on a device, it can be inspected, but it should be a popup over the topology not displayed somewhere up.”** Put device details in an overlay on the graph. Authorized default: use the same popup for hosts, VMs, links, sessions, routes, and clusters, with close/Escape, focus return, scrollable content, and a narrow-screen overlay sheet.
- **“The app does not need to simulate the BGP, it can make a simple initial calculation of expected route tables.”** Calculate a deterministic snapshot on YAML load/count rebuild. Reuse useful static domain code; remove requirements for update queues, convergence simulation, event traces, or learning playback. Tables remain inspectable without animation.
- **“The view of ‘routes flow’ is also just a gimmick, this is something we know how the flow is happening, it can be hardcoded and only enabled with a switch.”** Use an independently switched illustrative flow. Authorized defaults: off initially, a curated fixed sequence mapped to valid current BGP relationships, clear Polish illustrative label, no table mutations, reduced-motion static direction, and stop/clear when disabled. Hardcoded presentation does not permit nonexistent topology connections.
- **“I'd like the devices to be draggable so you can kinda move them around just slightly.”** Dragging adjusts view coordinates only. Authorized defaults: a maximum offset radius of 48 SVG layout units from the generated anchor, a small drag threshold, pointer/touch/cancel support, connected-edge tracking, keyboard equivalent, and reset-layout control. Preserve offsets for surviving IDs across presentation switches, clear them on configuration rebuild, and exclude them from exported YAML. A dragged RS cluster remains a visual projection of its real members.

The latest turn ends with **“Make instructions for GPT-Luna from what I wrote above, edit existing plans to be aligned with new notes”**. That turn delivered documentation and planning. The user subsequently asked to resume work; R00–R06 are now implemented, with current verification recorded in `PROGRESS.md`.

Status: **current direction confirmed; defaults selected under existing user authorization**. D11 overrides conflicting D01/D02/D08 wording and prior plan Steps 03/05/07/08/10/13. Physical/peering matrices, VPC isolation, VM placement, count controls, RS presentation rules, and eventual integration remain in scope.

Integration default, selected under existing autonomy authorization: browser edits use isolated in-memory workspaces, with 30-minute idle expiry and a cap of 16 retained edited scenarios. Read-only visitors share the default snapshot. Expired/evicted workspaces report a conflict rather than mixing a cached diagram with different tables. Exported YAML remains the persistence mechanism. Source is in `internal/content/dctopology/`; browser layout is in `web/static/dc-topology/`.

### D12 — RS tiers, compact fabric, and hosted VM placement

User direction, 2026-09-30: abstract RS VMs form tiers over the fabric: RS Bolt
above the leaves it serves, one RS Ctrl cluster in the middle, and one RS User
cluster at the top right. Border/stem devices start nearer the center; bolt
components sit closer together. VMs sit above the host label in taller hosts.
Rack and bolt outlines must not cross neighboring outlines.

Authorized presentation defaults: use role-labeled cards containing the four
individual RS members, or one aggregate icon when grouping is enabled. Reserve
explicit, disjoint bolt/rack rectangles with racks contained inside their bolt.
Host height follows its visible VM count; host labels sit below their badges.
Keep the 48-unit maximum drag radius, with tighter bounds inside compact cells
so devices and badges stay within their groups. Preserve actual placements,
first-member cluster anchors, sessions, expected tables, and YAML exports.

Status: **implemented and browser-verified**. D12 refines presentation in R03 and
Steps 03/04/06; it does not change canonical network semantics.

### D13 — Endpoint exploration, decoded messages, TAPs, and table views

User direction, 2026-09-30: choose two devices for route-update flow and packet
travel; inspect the UPDATE and packet; expose missing host EVPN routes and local
TAP interfaces; offer Linux-style RIBs and a simplified GUI.

Implemented defaults under the existing autonomy authorization:

- Endpoint selectors include every physical node and individual VM. UPDATE flow
  follows directed, expected advertisements for a chosen compatible route from
  the existing snapshot. It exposes NLRI, next hop, AS_PATH, ORIGIN, MED, and EVPN
  RD/RT/VNI per export. LOCAL_PREF is labeled receiver policy, not an eBGP wire
  attribute. Session export rows also open their specific UPDATE.
- Packet selection uses a sample IPv4 ICMP or IPv6 ICMPv6 Echo Request. Customer
  VM pairs use the installed VPC forwarding entries; border selection uses a
  compatible advertised prefix. Other nodes/infra VMs use underlay transport via
  the VM's hosting host. Unsupported tenant destinations and cross-VPC traffic
  report a missing/permitted-route error. RS VMs are not customer-data transit.
- Packet inspection shows addresses, sample TTL/payload, VXLAN/UDP/VNI when used,
  ECMP choice, and ingress/egress interfaces at each hop. Local VM delivery uses
  TAP/vNIC hops without fabric links. Generic ICMP fields are illustrative, not
  a capture; addresses and routing/attachment context come from the model.
- VM attachments have separate local links, host TAPs, and guest eth0 interfaces;
  they do not increase physical cable/BGP adjacency counts. TAP names are stable
  and valid Linux interface lengths, with guest addresses/VPC in their own scope.
- Hosts retain global EVPN RIB entries even without an attached tenant; RT/VPC
  filtering remains in forwarding import. Underlay reception is independent of
  tenant attachment. Hosts cannot become unrelated underlay transit shortcuts.
  Underlay AS_PATH lists the sending peer first and the origin last.
- The inspector separates EVPN/IPv4/IPv6. GUI cards summarize route and next hop;
  Linux/FRR mode renders the same snapshot as FRR BGP and iproute2-style output.
  These are expected model views, not commands executed on a guest/router.
- Queries are read-only, bounded by configured model caps, and do not modify
  routes or export. Rebuilds clear ephemeral selections; stale responses cannot
  replace newer endpoint choices. Popup close preserves custom path selection.

Status: **implemented and verified**. D13 extends R08 and the earlier static
route/packet inspection steps without introducing a BGP convergence simulator.

### D14 — Placement policies and interactive packet/route inspection

User direction, 2026-09-30: keep every RS Bolt in its bolt; distribute RS Ctrl
across all bolts; show packet bits with clickable field information; pick packet
endpoints on the topology; drag packet/route popups; use IPv4 EVPN next hops;
repair GUI back navigation and AFI hierarchy; make Linux routes clickable with
purple learned paths and yellow next-hop paths.

Implemented defaults:

- Four RS members per cluster remain unchanged (at most four bolts). Generated
  RS Bolt members use hosts in their served bolt, preferring distinct hosts.
  RS Ctrl fills the least represented bolt first, including explicit placements
  when counting coverage. Validation rejects cross-bolt RS Bolt placement or
  explicit controller placement that cannot cover every bolt. The default YAML's
  former cross-bolt example is corrected to host b1/h2.
- Host/border Type-5 next hops and VXLAN outer endpoints use IPv4 identities,
  including for inner IPv6 traffic. BGP sessions retain their IPv6 transport.
- Packet forms retain selectors and add source, destination, and paired picking
  from device/individual-VM clicks. Paired selection opens the sample after the
  second click. Grouped RSs expand so a concrete member can be selected; Escape
  cancels picking. Picking does not start a device drag.
- The inspector handle supports mouse/touch dragging and arrow keys, with Home
  restoring its position. Bounds keep the popup inside the canvas; resize/rebuild
  clamps or resets its position. All inspector types share this behavior.
- Sample packets show serialized Ethernet, IPv4/IPv6, ICMP/ICMPv6, UDP and VXLAN
  fields as 32-bit rows. Field clicks show values, widths, absolute/relative bit
  offsets and Polish explanations. Lengths and checksums are computed from the
  sample bytes. MACs, payload, ports and other unspecified header defaults are
  labeled illustrative. The VXLAN view is taken at the source VTEP; BGP session
  inspection has a separately labeled sample IPv6/TCP/KEEPALIVE, not a capture.
- Inspector history restores the previous table, format, expanded sections and
  scroll position. AFI/SAFI sections have visible tree indentation and badges.
  Both GUI and Linux/FRR/kernel rows carry the inspected speaker/candidate context.
- Purple arrows follow that candidate's expected learning path into the inspected
  RIB. Yellow arrows resolve its next-hop node through a valid physical path, then
  the local VM attachment when the route targets one. These paths follow displayed
  anchors, work across RS projections, and never highlight all exports as if they
  were the inspected device's single learned path. Local routes have no remote
  learned segment; unresolved paths are stated in the inspector.

Status: **implemented and verified** as R09. These defaults supersede conflicting
placement and IPv6-VTEP wording in earlier decisions without adding simulation.

### D15 — Multi-route streams, RS ASNs, and device-first inspection

User direction: animate many routes; these RSs append their ASN; move traffic
sending to a compact action beside the clicked device; expose routes each device
originates; preview learned/packet paths on route hover. Commit after each point.

All five points are implemented and separately verified: a bounded multi-prefix stream
uses actual hierarchy sessions; every exporting eBGP speaker, including RSs,
prepends its ASN. A locally originated RIB path is empty; received AS_PATH contains
all sending hops, nearest first. EVPN NEXT_HOP remains the original IPv4 VTEP.
This follows the eBGP AS_SEQUENCE ordering in
[RFC 4271 §5.1.2](https://www.rfc-editor.org/rfc/rfc4271.html#section-5.1.2).
Device clicks expose an anchored send action and packet-family choice; target
click completes sending. Manual forms start closed. Every node/VM has a separate originated-route section
with canonical ownership and explicit empty states. Route hover/focus previews
both the learned path and next-hop packet direction from cached metadata, without
changing selection or tables; leaving restores the selected view. Unrelated packet
markers and the decorative stream are suppressed during preview. Consult PROGRESS
for the five separate commits and validation.

### D16 — Playback and packet-inspection refinements

Latest user direction: fix custom-endpoint packet playback, animate only one BGP
UPDATE at a time, and make Inspect packet scroll to visible packet fields. Commit
after each point. D16's sequential presentation supersedes simultaneous D15 streams.

Point 1 is implemented: explicit packet Play opts into motion even with the OS
reduced-motion preference; automatic route illustration stays suppressed. A new
reduced-motion preference or hiding physical links pauses a running packet.
Point 2 is implemented: keep a bounded list of prefixes but advance one UPDATE
marker through each entire path before starting the next. Step highlights and
marker metadata follow the active prefix; static session context remains visible.
Point 3 is implemented: Inspect packet opens containing sections, brings the popup
below navigation, scrolls its body to packet fields and focuses their heading.
Deferred reveal is tied to the selected packet/session and cancelled on dismissal
or selection changes. Late session exports trigger a second reveal so inserted
content cannot push fields away. Consult PROGRESS for verification and commits.

### D17 — Visibility, inspector UX, labels, and routing refinements

Latest user request, in execution order with a separate commit for each point:
hide underlay devices; dismiss device send actions on outside clicks; visibly
group every disclosure's children; resize the inspector; center its back arrow;
preview sessions on hover; show host slugs; suppress border route advertisements;
show customer VM exports to RS User; retain routes to border; animate packets on
the yellow path; show RS slugs (`rs13001`, `rsctrl4`, `rsuser3`).

Underlay visibility hides fabric switches while retaining hosts and VMs. It does
not mutate the model; playback pauses when its physical path is hidden. Keep
canonical IDs stable and use labels in presentation. All twelve points are
implemented; verification and commits are recorded in PROGRESS.

Borders retain sessions and receive routes but export no BGP NLRI, including
loopback identities. Existing configured uplink prefixes and IPv4/IPv6 identity
routes to both borders are static forwarding entries, explicitly labeled in the
inspector and excluded from BGP propagation. Customer VM unicast exports appear
in the sequential VM → RS User → RS Ctrl illustration. Packet markers share the
yellow physical-port/TAP geometry and skip node interiors at transit hops.
These rules supersede earlier border-origin defaults.

### D18 — Compact controls, wrapped packet fields, and shallower hierarchy

Latest user request: make the destination action popup smaller; hover any fragment
of a wrapped packet field to highlight all its fragments; reduce inspector indents.
Commit each implemented point separately. The host RIB route-detail question is
answer-only: preserve its behavior. Its rows are topology-wide exports of one
route, not additional routes in the inspected host's RIB.

### D19 — Keep borders visible when hiding underlay

Add a subordinate Zostaw border option to underlay visibility. Authorized default:
checked, shown only when underlay is hidden. Preserve border nodes, tier labels,
and session endpoints so the independently enabled BGP layer shows border–RS Ctrl
sessions. Unchecking it restores the fully hidden fabric view. This is view state;
YAML, topology, routing and physical-path playback semantics remain unchanged.

### D20 — Directional route inspection, edge resizing, and focused details

Latest request: visualize propagation direction on route hover and click; resize
the white inspector by dragging its borders; remove the topology-wide export list
from route details. Commit each point separately. The third instruction supersedes
D18's former answer-only constraint. Session export inspection remains available.

Route inspection follows that RIB candidate's learned path using one purple
direction marker, independent of the general Przepływ tras toggle. Reduce motion
to a stationary direction arrow when requested by the OS; keep yellow next-hop
context. Pause the general illustrative stream during route inspection/preview.

### D21 — Playback repair and complete advertisement illustrations

Implemented after finishing D20: repair stalled traffic playback and inspection's
teleport to the destination; show UPDATE fanout when an RS receives it; continue
illustrations through the RS hierarchy to end devices; make the default BGP flow
a sequence explaining how each advertisement propagates. Commit each point.
Keep expected route snapshots authoritative and preserve explicit packet inspection.
This supersedes the single linear UPDATE-marker illustration where branching is
needed to explain an advertisement's spread.

Authorized defaults: both flow and BGP sessions start enabled. A compact selector
cycles representative examples for each family, origin device role and VPC, or
repeats one. EVPN precedes customer and underlay IPv4/IPv6. Examples project only
complete expected export paths onto waves; each RS branch continues to a host,
customer VM or border. Border/static origins have no BGP example. Custom UPDATE
inspection keeps its chosen decoded path while illustrating the prefix's complete
end-device delivery context. Reduced motion retains static direction and labels.
This supersedes earlier off-by-default and single-marker defaults; tables remain
independent of playback.

### D22 — Directional customer exports and continuous traffic

RS User only imports customer VM advertisements, never exports to those VMs.
Original IPv4/IPv6 routes continue through Ctrl and Bolt to every host neighbor
(and borders); no conversion into EVPN happens at Ctrl. Hosts install public routes
in the default VRF and recursively resolve their VM next hops through EVPN.
Default VMs belong to the default/public VRF on VNI 3, not private VPC 1.
Schema ID 0 names that VRF, with RT target:64512:0; positive IDs retain the
private mappings. This supersedes D02's former positive-only/default-private rule.
Keep explicit private VPCs and forwarding isolation. Packet markers traverse each
node continuously between incoming and outgoing link contacts. Commit each of the
three requested points, incorporating the public-VRF clarification into point 2.

## Recording an answer

Record the latest user direction and affected milestones. If it changes previously implemented work, reopen the affected acceptance checks; do not claim the old checks verify new behavior. Distinguish direct user requirements from authorized implementation defaults. Preserve the original TODO while keeping this decision record and the active plan authoritative for later changes.
