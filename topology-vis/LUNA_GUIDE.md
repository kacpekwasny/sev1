# GPT-Luna implementation instructions

Implement the DC topology visualizer using [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [DECISIONS.md](DECISIONS.md). Work in complete increments: **develop → verify → fix → review → commit → repeat**. The rework is now implemented; use [PROGRESS.md](PROGRESS.md) to identify completed work before making further changes.

## Latest user direction — 2026-09-30

These requirements supersede earlier simulator and inspector-layout requirements and the parent site's htmx convention for this feature:

- Build a visually interesting, dynamic JavaScript frontend. Make the topology the main workspace. Use local browser assets and Polish interface copy. Do not use htmx for visualizer interactions.
- Clicking a device opens an inspector popup **over the topology**. Keep the topology visible behind it; do not render details above the graph or navigate away. Apply the same interaction to hosts, VMs, links, sessions, and RS clusters.
- Calculate expected route tables once when loading or rebuilding a configuration. A BGP protocol/convergence simulator, update-event engine, and convergence playback are unnecessary. Retain useful static topology, peering, VPC, and forwarding calculations.
- Route-flow animation is an optional explanatory visual. D15 requires a stream of many independent prefix illustrations through valid RS hierarchy sessions, with a focused stream for selected UPDATEs. Enable it with a dedicated switch, off by default; it must not compute or mutate routing state. Its paths must correspond to actual modeled relationships.
- Devices can be dragged a little to adjust the drawing. Keep bounded visual offsets separate from canonical placement, addresses, sessions, and routes. Connected lines follow the displayed devices.
- Abstract RS VMs form tiers over the fabric: RS Bolt above its served leaves, one RS Ctrl cluster in the middle, and one RS User cluster at the top right. Center border/stem rows, tighten bolt components, and put badges above the host label inside taller hosts. Keep sibling rack/bolt outlines separate, with racks contained in bolts. Preserve expanded members and the grouping switch. D12 records this implemented layout refinement.
- Add endpoint-selectable UPDATE and packet flow inspection, decoded UPDATE attributes and packet/encapsulation/hop fields, local TAP/vNIC attachments, visible host EVPN RIBs, and GUI/Linux-FRR table modes. D13 records the implemented defaults: query the expected snapshot, preserve VPC forwarding isolation, and label illustrative fields accurately. These features do not reintroduce protocol simulation.
- D14 further constrains RS Bolt members to their served bolt and spreads RS Ctrl over all bolts. Use IPv4 EVPN next hops/VXLAN VTEPs, click-selected packet endpoints, draggable popup handles, binary packet fields with clickable explanations, back navigation with table state, visibly nested AFI sections, and clickable GUI/Linux routes with purple learned paths and yellow next-hop paths. Preserve the expected-snapshot approach.
- D15 adds compact send actions beside clicked devices, a separate originated-route section for every node/VM, and GUI/Linux route hover/focus previews that preserve selection and use cached metadata. This deployment’s RSs prepend their ASN, while preserving the EVPN next hop. Commit separately after each user-listed point.
- Commit existing work before starting the redesign, then commit each verified working increment. Inspect ownership and staged changes first.

The user already approved defaults and said **“You can make assumptions here”**, authorizing autonomous work while unavailable. Choose reasonable defaults, record material choices, and proceed without repeatedly asking for confirmation. Preserve the confirmed physical topology, BGP peering matrix, count limits, VM-placement rules, synthetic addressing, and YAML load/export behavior unless the latest requirements require a change.

## Read in this order

1. Applicable `AGENTS.md`, `git status --short`, and `git rev-parse --show-toplevel`.
2. This guide and the latest-direction section of [DECISIONS.md](DECISIONS.md).
3. [PROGRESS.md](PROGRESS.md), then the next rework milestone in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
4. Only the relevant code, tests, and original [TODO.md](TODO.md) sections.

The Git root is `sev1/`; implementation lives in `internal/content/dctopology/`, `web/static/dc-topology/`, and `cmd/dc-topology/`. `topology-vis/` holds the guide, plan, decisions, progress, and optional browser walkthrough. Preserve the user's TODO and unrelated changes. Existing code is a starting point, not proof that the new design is complete.

## Implementation defaults

- Keep Go for configuration validation and initial expected-state calculation. Use browser ES modules for rendering, interactions, view state, and decorative animation. Existing vanilla JS is a suitable default; dynamic JS does not require a framework or Node build stack.
- Retain `mountTopologyApp(root, { onCommand })`, `setState`, and `destroy` unless a concrete limitation justifies changing the integration contract. Remove all event listeners and animation loops on teardown.
- Use a topology-first layout with compact controls, clear device roles, strong visual hierarchy, readable labels, and restrained motion. Put YAML/count configuration in a drawer or dialog so it does not dominate the initial screen.
- Use one inspector overlay with explicit close control, Escape dismissal, sensible focus management, and a scrollable body. On narrow screens it may become an overlay sheet. Loading/errors stay inside it; stale asynchronous responses must not replace a newer selection.
- Constrain dragging to a maximum radius of 48 SVG layout units from each generated anchor and tighter cell bounds where necessary to contain devices and VM badges. Start dragging only after a small movement threshold so a click still opens inspection. Support pointer cancellation and touch input; provide a reset-layout control and keyboard movement/reset. Keep offsets for surviving IDs across view changes, clear them on configuration rebuild, and exclude them from YAML export.
- Keep route flow off initially. Label it in Polish as illustrative, for example “Poglądowy przepływ tras”. Use a small curated sequence projected onto current session endpoints; omit incompatible examples. Turning the switch off stops its animation and clears markers. Respect reduced-motion preferences with static directional highlights.

These are authorized implementation defaults, not additional user quotations. Refine them based on actual usability without reopening settled requirements.

## Every implementation cycle

1. Establish the baseline and inspect existing diffs. Record the increment's expected behavior, files, and checks.
2. Develop one complete milestone. Reuse correct domain code; simplify complexity that exists only for convergence/event playback. Add meaningful behavior tests where warranted.
3. Format modified Go code and run relevant automated checks. Invalid configuration must leave the last valid model intact.
4. For UI work, inspect desktop and narrow widths when a browser is available. Exercise real selection, popup dismissal, drag/click distinction, line tracking, switches, and teardown; check console errors. Syntax checks alone do not verify interactions.
5. Fix failures and rerun affected checks. Review the diff for unrelated changes.
6. Stage only the increment's files/hunks, review the staged diff, update progress, and commit locally. Continue with the next unblocked milestone without asking after every commit.

If a tool or filesystem restriction blocks a check or commit, record the exact failure and continue independent authorized work. Do not call browser acceptance or a commit complete when it has not happened. Do not push, deploy, create a nested Git repository, or bypass read-only Git metadata.

## Network and view correctness

- Keep physical links, BGP sessions, expected route tables, forwarding entries, illustrative route flow, and packet paths distinct.
- Preserve synthetic addressing, compatible configured VM placements, deterministic generated fallback, stable IDs, and four-member RS clusters. D14 placement constraints take precedence over the former cross-bolt fallback. Hosted location, served bolt, and cluster membership remain separate properties.
- Keep transport addresses/interface scope separate from AFI/SAFI. Expected route tables are educational computed snapshots, not live router or guest OS state.
- Preserve VPC isolation, Type-5 identity/next-hop/VNI context, and underlay ECMP information where relevant to those snapshots. Do not let identical prefixes in different VPCs overwrite or leak into one another.
- Route servers remain control-plane brokers with preserved next hops; per D15, every RS prepends its own ASN to AS_PATH. Customer data paths do not use them as transit devices.
- Layer switches, RS collapse, drag offsets, popup selection, and visual flow never mutate canonical routing/configuration. Count changes rebuild topology and expected tables; export preserves all actual RS members and placements.
- Illustrative paths may be fixed, but must reference valid current entities and connections. Handle missing/incompatible endpoints and unreachable paths explicitly.
- Do not expand scope to live collection, operational routing daemons, fault injection, withdrawals, or convergence simulation.

## Commands and repository hygiene

Run from the actual Git root. Do not use broad `git add .`/`git add -A`, destructive reset/clean, or commit someone else's staged changes. Review mixed files at hunk level.

```sh
go run ./cmd/dc-topology   # independent harness, port 8084
go test ./...
go build .
go vet ./...
node --input-type=module --check < web/static/dc-topology/app.js
node --input-type=module --check < web/static/dc-topology/dev.js
```

Run `gofmt` on modified Go files. For shared-state changes, run relevant race tests; the parent site's checks are `go test -race ./internal/live ./internal/web`. Keep assets local and eventual site integration at `/topologie/dc/`. Other site pages may retain htmx; the visualizer itself uses JavaScript.

Documentation-only changes need content/link/diff review, not unrelated application tests. Keep [PROGRESS.md](PROGRESS.md) concise: implemented versus planned work, validation evidence, blockers, next action. Report actual commit hashes from Git history.

## Prompt to continue implementation

> Continue the DC visualizer using `topology-vis/LUNA_GUIDE.md`, `IMPLEMENTATION_PLAN.md`, and `PROGRESS.md`. Inspect Git status and existing commits first; do not repeat completed rework milestones. Keep the JavaScript topology workspace, popup inspection, bounded dragging, initial expected route tables, and optional illustrative flow contract. Make reasonable assumptions within the authorized scope, verify each requested increment, review and commit only your changes, and update progress. Preserve unrelated work and report any unavailable checks precisely.
