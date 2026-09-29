# Decisions needed before implementation

Status: application direction and simulation mode confirmed on 2026-09-29; network details remain open. This file records answers and questions, not implicit defaults. Do not infer approval from silence. Resolve a question before implementing the behavior that depends on it. Independent, agreed work can continue.

The user selected independent development followed by integration into `sev1`, deterministic simulation configured in YAML, and a synthetic address scheme designed by the agent. Some cabling and peering rules are confirmed below; unresolved parts remain questions.

## Questions already raised

### D01 — Application and repository boundary

Answer, 2026-09-29: **“I want you to develop this independently for speed, but it will be part of the sev1 website.”**

Develop the feature in isolation with a dedicated development entry point and a defined mounting/data boundary. Include a final `sev1` integration step. Preserve the parent site's Go, template, local-asset, and Polish UI conventions. Independent development does not imply authorization for a new Git repository or a new framework.

Current facts: `topology-vis/` contains the idea in `TODO.md`; its Git root is the parent `sev1/` repository. The parent has an existing, much simpler topology view. Keep that working during independent development.

Status: **product boundary answered**. Step 01 must document the concrete module/harness layout and its integration contract. A technology choice that departs from the existing project conventions still needs discussion; it is not implied by this answer.

### D02 — Source of routes and traffic; fidelity

Answer, 2026-09-29: **“A deterministic simulation configured in YAML.”**

YAML describes the model, rules, and scenarios. Compute route and traffic behavior reproducibly from that model. Use supplied expected tables as test fixtures, not as a replacement for the simulator. Live collection is outside the current request.

Fidelity answer, 2026-09-29: **“evpn 5; model vxlan; model vpcs; no withdrawls for now needed; ecmp in underlay should be;”**

Confirmed v1 scope: EVPN Type 5, VXLAN encapsulation, VPCs with distinct routing contexts, and underlay ECMP. Route withdrawals are deferred. Do not add EVPN Types 2/3 or withdrawal-driven failure/reconvergence behavior to the current increment. A scenario reset or topology rebuild is not a simulated BGP withdrawal.

Still to answer: which best-path and import/export policies should be modeled, including VPC membership, RD/RT/VNI assignment and any permitted route leaking? Confirm the Type 5 next-hop resolution model without introducing another EVPN route type. Should the scenario begin with declared working RS transport reachability or simulate a cold start? The vault documents a bootstrap dependency when RSs themselves are VMs; do not invent a bootstrapping path. The UI must identify the displayed behavior as simulated.

Status: **data mode and feature scope answered; specific routing/initialization rules pending**. These remaining details block their corresponding behavior, not the agreed deterministic engine boundary.

### D03 — Unfinished future requirement

The request ends with “It will later need to”. What was the rest of that sentence? Does the future requirement impose any compatibility or export requirements on v1?

Answer: **pending**. Blocks: declaring the scope complete; any affected architecture decision.

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

Use `racks_per_bolt` for R and two ToRs per rack, as specified in the TODO; no independent T control is needed. No intra-tier links or parallel cables have been requested. Required capacity/cost/state semantics depend on the simulator fidelity answer in D02; do not silently assign operational values.

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

Supply ASN assignment and any required per-session policies. EVPN Type 5, VXLAN, and VPCs are confirmed by D02; Types 2/3 and SRv6/L3VPN are outside the current selected scope. Do not add other sessions, including intra-cluster peerings, without a corresponding requirement.

Status: **membership and overlay feature scope answered; remaining family/policy details pending**. Do not invent unrequested intra-cluster peerings.

### D06 — Addresses, identifiers, defaults, and capacity

Answer, 2026-09-29: **“I do not want to expose real production IP schema. You can come up with something yourself.”**

The agent is authorized to design fictional addressing. Use the synthetic scheme in `IMPLEMENTATION_PLAN.md`; keep all checked-in examples, screenshots, and fixture outputs independent of production addressing. This supersedes the ambiguous TODO address patterns, including the duplicated RS Ctrl label. It does not authorize choosing unknown scale or host naming semantics.

Scale answer, 2026-09-29: **“default could be 2 border, 2 stem, 4 spine, 2 bolts, 2 leafs, 2 racks, 2 tors, 2 servers, 3 vms; max should be something sane, not too much; ids unique within bolt”**

Confirmed: host IDs are unique within their bolt. Defaults, using the hierarchy already defined in TODO: two borders, two stems, four spines, two bolts, two leaves per bolt, two racks per bolt, two ToRs per rack, two hosts per rack, and three customer VMs. These smaller default counts supersede TODO's original four-border/four-stem/four-leaf/eight-spine example; RS clusters still have four members. D07 confirms that V counts only customer VMs.

The user delegated a modest maximum. The agent-selected initial caps are four borders, four stems, eight spines, four bolts, four leaves per bolt, four racks per bolt, two ToRs per rack, four hosts per rack, and 64 customer VMs. Allow zero customer VMs; fabric dimensions must be positive and ToRs remain two per rack. The maximum has 64 hosts, so it stays below the three-digit host suffix limit. Retain the TODO's host-label examples as unit cases rather than supported whole-DC sizes.

Still to answer: the target browser/device and quantitative responsiveness expectation. Step 13 should measure both the default and capped scenario and report results; do not claim an agreed performance SLA when none was supplied.

Status: **synthetic addressing and modest caps delegated; defaults and bolt-scoped host IDs confirmed**. Performance targets remain open.

## Additional questions to resolve at their dependency boundary

### D07 — VM and route-server placement

Answer, 2026-09-29: **“RS VM can be explicit in yaml, and if not it should be generated; the same for customer VMs”**

Confirmed: honor explicit YAML placement for both RS and customer VMs; generate placement for either kind when omitted. Explicit placement takes precedence. The automatic fallback must be reproducible, consistent with the selected deterministic simulation.

Follow-up answer, 2026-09-29: **“ok; only customer;”** — use deterministic round-robin across hosts, preserve explicit placements, spread members of each RS cluster across different hosts where possible, and count only customer VMs in V.

The fallback places VMs across the available hosts. The selected rule is host diversity within an RS cluster where possible; it does not require rack/bolt anti-affinity. A served bolt and the bolt containing an RS VM are separate concepts. Explicit placements remain authoritative, including co-location; when there are fewer than four hosts, generated RS members may reuse hosts after using the available distinct hosts. No additional infrastructure VM roles have been requested.

Status: **placement and V semantics answered**. Use stable host/VM ordering, deterministic round-robin, and generated-placement tests in Step 04.

### D08 — Meaning of route tables and traffic examples

Should “route table” show the guest OS forwarding table, host forwarding table, BGP received/selected/advertised routes, EVPN information, or several separate tables? Which fields and filters matter?

Which traffic cases must v1 demonstrate: VMs on the same host, in the same rack, in different racks of one bolt, across bolts, or internet/border traffic? For control traffic, should the UI show logical BGP sessions, the physical paths carrying their packets, or both? VPC isolation and underlay ECMP are mandatory checks under D02; withdrawal-driven customer failover is deferred.

Answer: **pending**. Blocks: final inspector contents and traffic scenario acceptance.

### D09 — Controls and YAML persistence

Answer, 2026-09-29: **“it should rebuild the topo; exportable via yaml; in this case I don't want to rebuild the topo, I just want the visualization to hide all the connections and visually join all RSs from a cluster into a single icon”**

Confirmed:

- Spine/bolt/rack/host/VM count controls rebuild the simulated topology. Recompute derived simulation state consistently; do not implement them as visibility filters.
- The configured result must be exportable as YAML and reproduce the same model when loaded again.
- One-RS-per-cluster mode is a presentation-only operation: combine the members into one cluster icon. Keep all actual RS members, placements, sessions, and route state; do not rebuild the topology or substitute one member for the cluster.
- Collapsed display state must not erase members or sessions from YAML export.

Clarification, 2026-09-29: **“Not sure what hide all connections mean; hide bgp sessions means hide bgp sessions; hide physical links, means hide physical links; when the switch \"show infra vms on actual hosts\" is on, and also clustering of infrastrucutre VMs is on, then cluster the VM at the host where the first VM from the cluster is located”**

This clarification supersedes the earlier interpretation that clustering itself hides connections. BGP-session visibility and physical-link visibility are separate switches. Clustering does not override either. When both clustering and “show infra VMs on actual hosts” are enabled, anchor the aggregate icon on the host containing the first cluster member. Use the cluster's declared stable member order (generated members 1–4); this display anchor is not a new placement for the other members. Expose differing member details in the inspector rather than pretending all member states are identical. Additional upload/in-browser editing workflows are not required merely by the YAML export request.

Status: **control semantics answered**. Step 06 must test clustering, actual-host placement, and both independent link-layer switches in combination.

### D10 — Integration entry point and delivery

D01 establishes that this will be part of the `sev1` website. Where should users reach it: a new DC page under the existing topology section, a replacement for a current view, or an embedded component in another page? Does it also need a standalone distributable, or is the independent entry point just for development?

The parent project's conventions specify Polish copy, Poppins, and local assets. These remain applicable. Establish the final route/navigation and packaging contract before integrating; production embeds `web/` assets but keeps YAML content on disk.

Answer: **pending**. Blocks: final site entry point and packaging, not independent feature development.

## Recording an answer

Replace the corresponding pending answer with the user's words or an accurate summary, its date, and the affected plan steps. Preserve unresolved subquestions explicitly. If a new answer changes completed work, reopen the affected step and its tests before proceeding. Record a concrete small example whenever a rule affects connectivity, addressing, or routing.
