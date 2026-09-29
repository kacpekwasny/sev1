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

Still to answer: which routing rules must be modeled? Specify best-path selection, equal-cost forwarding, policy, withdrawals, and whether failures/convergence are in v1. Should the scenario begin with declared working RS transport reachability or simulate a cold start? The vault documents a bootstrap dependency when RSs themselves are VMs; do not invent a bootstrapping path. The UI must identify the displayed behavior as simulated.

Status: **data mode answered; fidelity pending**. Remaining details block route-selection and forwarding behavior, not an agreed deterministic engine boundary.

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
| Host ↔ RS Bolt | Confirmed: all four members serving the host's bolt; IPv6 transport | IPv4 unicast, IPv6 unicast, EVPN subset to finalize |
| RS Bolt ↔ RS Ctrl | Confirmed: every bolt RS to all four controller RSs; IPv6 transport | IPv4 unicast, IPv6 unicast, EVPN subset to finalize |
| RS Ctrl ↔ RS User | Confirmed: every controller RS to all four user RSs; IPv6 transport | IPv4/IPv6 unicast; vault says RS User has no EVPN |
| Customer VM ↔ RS User | Confirmed: YAML-selected VMs to all four RS User members | Confirmed IPv4/IPv6 unicast |
| Border ↔ RS Ctrl | Confirmed: every border to all four RS Ctrl members | Confirmed IPv4/IPv6 unicast and EVPN |
| Fabric switch ↔ fabric switch | Confirmed: eBGP on every physical switch adjacency | Underlay IPv4/IPv6 scope to finalize |

Confirm whether any other sessions exist, including within an RS cluster. Supply ASN assignment and any required per-session policies. Decide whether EVPN types 2, 3, and/or 5, VXLAN, VPC/VRF/VNI separation, or SRv6/L3VPN belong in v1. These are not automatically requirements merely because they occur in the vault.

Status: **membership answered; remaining families/policies/fidelity pending**. Follow-up questions have been sent for simulation fidelity. Do not invent unrequested intra-cluster peerings.

### D06 — Addresses, identifiers, defaults, and capacity

Answer, 2026-09-29: **“I do not want to expose real production IP schema. You can come up with something yourself.”**

The agent is authorized to design fictional addressing. Use the synthetic scheme in `IMPLEMENTATION_PLAN.md`; keep all checked-in examples, screenshots, and fixture outputs independent of production addressing. This supersedes the ambiguous TODO address patterns, including the duplicated RS Ctrl label. It does not authorize choosing unknown scale or host naming semantics.

Still to answer:

- Is the host number unique across its bolt or only within its rack? What happens beyond 999, given the three-digit host label suffix? The examples must remain `h2003`, `h13045`, and `h20999`.
- What are the default and maximum values for spines, bolts, racks per bolt, hosts per rack, and customer VMs? Are eight spines a default, a minimum, or a fixed example?
- What browser/device and load/interaction target define acceptable performance at that maximum?

Status: **synthetic addressing delegated to the agent; naming/scale pending**. Remaining details block default/max fixtures and measurable scale acceptance.

## Additional questions to resolve at their dependency boundary

### D07 — VM and route-server placement

Does V count customer VMs only or include infrastructure VMs? How should customer VMs be distributed: explicit YAML placements, an even deterministic rule, or seeded random placement? Are there per-host limits?

Where should the RS VMs live? Specify placements or a placement rule for each cluster, including whether members must be on different hosts/racks/bolts. A served bolt and the bolt containing an RS VM are separate concepts: the vault explicitly allows them to differ. Identify other infrastructure VM roles needed in v1.

Answer: **pending**. Blocks: VM generation and physical display of RS VMs.

### D08 — Meaning of route tables and traffic examples

Should “route table” show the guest OS forwarding table, host forwarding table, BGP received/selected/advertised routes, EVPN information, or several separate tables? Which fields and filters matter?

Which traffic cases must v1 demonstrate: VMs on the same host, in the same rack, in different racks of one bolt, across bolts, internet/border traffic, or customer BGP failover? For control traffic, should the UI show logical BGP sessions, the physical paths carrying their packets, or both?

Answer: **pending**. Blocks: final inspector contents and traffic scenario acceptance.

### D09 — Controls and YAML persistence

Should count controls regenerate the network, filter an existing larger network, or support both as separate actions? Should changes reset the scenario or preserve compatible state? Should a user edit YAML on disk, upload it, edit it in the browser, download changed YAML, or use a selected subset of those workflows?

When displaying one RS per cluster, should the UI show a named representative member or an aggregate of all four? What should happen when members have different sessions/routes/state? Hiding members must not silently delete them from the underlying network.

Answer: **pending**. Blocks: count-control semantics, persistence, and cluster-collapse behavior.

### D10 — Integration entry point and delivery

D01 establishes that this will be part of the `sev1` website. Where should users reach it: a new DC page under the existing topology section, a replacement for a current view, or an embedded component in another page? Does it also need a standalone distributable, or is the independent entry point just for development? Does the unfinished future requirement in D03 answer this?

The parent project's conventions specify Polish copy, Poppins, and local assets. These remain applicable. Establish the final route/navigation and packaging contract before integrating; production embeds `web/` assets but keeps YAML content on disk.

Answer: **pending**. Blocks: final site entry point and packaging, not independent feature development.

## Recording an answer

Replace the corresponding pending answer with the user's words or an accurate summary, its date, and the affected plan steps. Preserve unresolved subquestions explicitly. If a new answer changes completed work, reopen the affected step and its tests before proceeding. Record a concrete small example whenever a rule affects connectivity, addressing, or routing.
