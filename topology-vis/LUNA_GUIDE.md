# GPT-Luna implementation instructions

Implement the DC topology visualizer using [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [DECISIONS.md](DECISIONS.md). Work in complete increments: **develop → verify → fix → review → commit → repeat**. This revision is an instruction and planning deliverable; execute the rework when asked to implement it.

## Latest user direction — 2026-09-30

These requirements supersede earlier simulator and inspector-layout requirements and the parent site's htmx convention for this feature:

- Build a visually interesting, dynamic JavaScript frontend. Make the topology the main workspace. Use local browser assets and Polish interface copy. Do not use htmx for visualizer interactions.
- Clicking a device opens an inspector popup **over the topology**. Keep the topology visible behind it; do not render details above the graph or navigate away. Apply the same interaction to hosts, VMs, links, sessions, and RS clusters.
- Calculate expected route tables once when loading or rebuilding a configuration. A BGP protocol/convergence simulator, update-event engine, and convergence playback are unnecessary. Retain useful static topology, peering, VPC, and forwarding calculations.
- Route-flow animation is an optional explanatory visual. A fixed, illustrative sequence is acceptable. Enable it with a dedicated switch, off by default; it must not compute or mutate routing state. Its paths must correspond to actual modeled relationships.
- Devices can be dragged a little to adjust the drawing. Keep bounded visual offsets separate from canonical placement, addresses, sessions, and routes. Connected lines follow the displayed devices.
- Commit existing work before starting the redesign, then commit each verified working increment. Inspect ownership and staged changes first.

The user already approved defaults and said **“You can make assumptions here”**, authorizing autonomous work while unavailable. Choose reasonable defaults, record material choices, and proceed without repeatedly asking for confirmation. Preserve the confirmed physical topology, BGP peering matrix, count limits, VM-placement rules, synthetic addressing, and YAML load/export behavior unless the latest requirements require a change.

## Read in this order

1. Applicable `AGENTS.md`, `git status --short`, and `git rev-parse --show-toplevel`.
2. This guide and the latest-direction section of [DECISIONS.md](DECISIONS.md).
3. [PROGRESS.md](PROGRESS.md), then the next rework milestone in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
4. Only the relevant code, tests, and original [TODO.md](TODO.md) sections.

The Git root is the parent `sev1/` repository; the current implementation is under `topology-vis/`. Preserve the user's TODO and unrelated changes. Existing code is a starting point, not proof that the new design is complete.

## Implementation defaults

- Keep Go for configuration validation and initial expected-state calculation. Use browser ES modules for rendering, interactions, view state, and decorative animation. Existing vanilla JS is a suitable default; dynamic JS does not require a framework or Node build stack.
- Retain `mountTopologyApp(root, { onCommand })`, `setState`, and `destroy` unless a concrete limitation justifies changing the integration contract. Remove all event listeners and animation loops on teardown.
- Use a topology-first layout with compact controls, clear device roles, strong visual hierarchy, readable labels, and restrained motion. Put YAML/count configuration in a drawer or dialog so it does not dominate the initial screen.
- Use one inspector overlay with explicit close control, Escape dismissal, sensible focus management, and a scrollable body. On narrow screens it may become an overlay sheet. Loading/errors stay inside it; stale asynchronous responses must not replace a newer selection.
- Constrain dragging to a modest default radius of 48 SVG layout units from each generated anchor. Start dragging only after a small movement threshold so a click still opens inspection. Support pointer cancellation and touch input; provide a reset-layout control and keyboard movement/reset. Keep offsets for surviving IDs across view changes, clear them on configuration rebuild, and exclude them from YAML export.
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
- Preserve synthetic addressing, configured VM placements, deterministic generated fallback, stable IDs, and four-member RS clusters. Hosted location, served bolt, and cluster membership remain separate properties.
- Keep transport addresses/interface scope separate from AFI/SAFI. Expected route tables are educational computed snapshots, not live router or guest OS state.
- Preserve VPC isolation, Type-5 identity/next-hop/VNI context, and underlay ECMP information where relevant to those snapshots. Do not let identical prefixes in different VPCs overwrite or leak into one another.
- Route servers remain control-plane brokers with transparent next hops and AS paths. Customer data paths do not use them as transit devices.
- Layer switches, RS collapse, drag offsets, popup selection, and visual flow never mutate canonical routing/configuration. Count changes rebuild topology and expected tables; export preserves all actual RS members and placements.
- Illustrative paths may be fixed, but must reference valid current entities and connections. Handle missing/incompatible endpoints and unreachable paths explicitly.
- Do not expand scope to live collection, operational routing daemons, fault injection, withdrawals, or convergence simulation.

## Commands and repository hygiene

Run from the actual Git root. Do not use broad `git add .`/`git add -A`, destructive reset/clean, or commit someone else's staged changes. Review mixed files at hunk level.

```sh
go run ./topology-vis/cmd/dc-topology   # independent harness, port 8084
go test ./...
go build .
go vet ./...
node --input-type=module --check < topology-vis/web/static/dc-topology/app.js
node --input-type=module --check < topology-vis/web/static/dc-topology/dev.js
```

Run `gofmt` on modified Go files. For shared-state changes, run relevant race tests; the parent site's checks are `go test -race ./internal/live ./internal/web`. Keep assets local and eventual site integration at `/topologie/dc/`. Other site pages may retain htmx; the visualizer itself uses JavaScript.

Documentation-only changes need content/link/diff review, not unrelated application tests. Keep [PROGRESS.md](PROGRESS.md) concise: implemented versus planned work, validation evidence, blockers, next action. Report actual commit hashes from Git history.

## Prompt to start the rework

> Execute the rework in `topology-vis/LUNA_GUIDE.md` and `topology-vis/IMPLEMENTATION_PLAN.md`. First inspect Git status and commit our existing implementation if Git metadata is writable, preserving unrelated work. Build a polished JavaScript topology workspace with inspectors in popups over the graph and bounded device dragging. Compute expected route tables on configuration load/rebuild; simplify away BGP convergence/event simulation. Add an optional, initially disabled illustrative route-flow switch. Use the approved defaults and make reasonable assumptions without waiting for me. Verify each complete increment, review it, commit it, update progress, and continue. Report blocked commits or unavailable browser checks precisely; do not claim they passed.
