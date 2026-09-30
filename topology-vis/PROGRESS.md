# Visualizer progress

Updated: 2026-09-30

## Status

- Step 00 decisions are resolved under the user's approval/delegation. D03 is absent as requested; `TODO.md` remains unchanged.
- Step 01 shell and mount contract are in parent commit `682a7df`.
- Steps 02–11 have implementation in the isolated harness: strict YAML validation, physical topology and VM generation, BGP sessions, route/forwarding computation, traffic/control paths, layer/cluster controls, count rebuilds, YAML export, inspector details, and playback.
- Earlier automated verification passed for the existing baseline. It does not verify the newly requested frontend rework. Browser acceptance has not run.
- D11 reopens frontend layout, inspection, dragging, route-calculation simplification, and illustrative flow. Rework milestones R00–R06 are planned, not implemented. The latest task is an instructions/plan update only.
- Step 12 site-route/navigation integration and Step 13 browser/performance acceptance remain open. The current workspace permits writes only inside `topology-vis/`; parent `internal/`, `web/`, `cmd/`, and Git metadata are read-only.
- Branch: `visualization`. No implementation commit could be created because the parent Git index is outside the writable root. All new source remains in the requested subdirectory.

## Latest planning update

Updated `LUNA_GUIDE.md`, `IMPLEMENTATION_PLAN.md`, and `DECISIONS.md` for the user’s 2026-09-30 direction: dynamic JavaScript instead of htmx, topology-first layout, popup inspection over the graph, initial expected tables, optional illustrative route-flow switch, and bounded view-only dragging. Retained confirmed network/configuration rules and the authorization to make reasonable assumptions.

Baseline commit was attempted by staging only our implementation paths. Git rejected staging with `fatal: Unable to create '/Users/kkwasny/code/sev1/.git/index.lock': Operation not permitted`. No commit was created; no nested repository or permission workaround was used. Planning updates were checked by documentation/diff/link review; application source was not changed in this task.

## Existing implementation baseline

The cached server model includes underlay unicast routes for device and RS service identities, eBGP AS paths over physical sessions, VPC-scoped EVPN Type-5 and selected customer unicast routes, transparent route-server advertisements, NVE forwarding views, deterministic ECMP packet paths, and physical BGP control paths. The browser supports per-speaker/session/route inspectors and on-demand route detail loading, independent topology layers, visual RS clustering, count rebuilds, YAML export, route-announcement playback, and data/control packet playback.

Large route tables and per-peer advertisements are served on demand through `/api/inspector`; `/api/model` returns the compact topology and scenario data. The capped compact model response measured 1,650,277 JSON bytes for 128 physical devices, 432 cables, 88 VMs, and 1,040 sessions. This is a serialized-size measurement, not browser timing.

## Earlier baseline validation

- `GOCACHE=/tmp/topology-vis-go-cache go test ./...` — passed.
- `GOCACHE=/tmp/topology-vis-go-cache go vet ./...` — passed.
- `GOCACHE=/tmp/topology-vis-go-cache go build -o /tmp/sev1-topology-vis-site .` — passed.
- `GOCACHE=/tmp/topology-vis-go-cache go build -o /tmp/dc-topology ./topology-vis/cmd/dc-topology` — passed.
- `GOCACHE=/tmp/topology-vis-go-cache go test -race ./topology-vis/internal/dctopology` — passed.
- `GOCACHE=/tmp/topology-vis-go-cache go test -race ./internal/live ./internal/web` — passed.
- Node syntax checks for `app.js` and `dev.js` — passed.
- `git diff --check` — passed. The whitespace scan found only two pre-existing trailing spaces in the unchanged `TODO.md`.
- Browser rendering/interactions remain unverified: no browser automation runtime is available in this session, and the local server bind was denied by the sandbox.

## Next action

When asked to execute, follow R00–R06 in the revised plan: commit the existing baseline if Git metadata is writable, then redesign the JavaScript workspace, move inspectors into popups, add bounded dragging, simplify expected-table computation, and replace announcement playback with the optional illustrative switch. Verify and commit each working increment. Integrate `/topologie/dc/` when parent source paths are writable and run desktop/narrow browser acceptance when a browser is available. Do not treat the earlier simulation/playback UI as the requested final design.

## Rework checkpoint — R01/R02

- Baseline is committed by the user as `9c50463`; Git metadata and parent paths are now writable.
- Implemented the JavaScript topology workspace with a dark canvas, compact summary/layer toolbar, local Poppins fonts, and a configuration dialog. Device/link/session/route details now open in a non-modal popup over the topology, with close/Escape and focus return; inspector errors stay inside it. Count drafts survive background inspector responses.
- Verified in installed headless Chrome via Playwright at 1280×900 and 390×844: initial popup hidden, node selection, overlay bounds inside canvas, Escape dismissal/focus return, config dialog, preservation of a count draft, and no document overflow at narrow width. In-app Node REPL is unavailable; external Chrome is the local fallback.
- `go test ./...`, site/harness builds, JavaScript syntax, and `git diff --check` passed.
- Next: R03 dragging, R04 expected-snapshot wording/API, R05 optional illustrative flow, then R06 site integration and full browser acceptance.

## Rework checkpoint — R03

- R01/R02 committed as `0468b7a`.
- Added pointer/touch-ready bounded device/VM/cluster offsets, connected-line tracking, pointer-cancel rollback, click/drag distinction, arrow/Home keyboard controls, reset layout, and fit-to-width. Hosts carry their displayed VM anchors when moved; canonical VM placements stay intact. Inspector section/scroll state survives detail refreshes.
- Chrome desktop checks passed: exact 48-unit radius, edge tracking, click after drag, keyboard/Home/reset, offsets preserved through layer/zoom changes, cancellation rollback, and unchanged YAML/expected speaker tables. Narrow fit inspected; JavaScript syntax and `git diff --check` passed.
- Next: independent illustrative route flow and expected-snapshot cleanup, then site integration and broader browser acceptance.

## Rework checkpoint — R04/R05

- Bounded dragging committed as `cf51c7c`.
- Kept configuration-derived expected route snapshots and renamed the calculator accordingly. Removed duplicate speaker advertisement arrays; session/route exports remain available on demand. Removed route-learning playback and its coupling to selected-route inspector data.
- Added an independent illustrative-flow switch, off initially. A fixed EVPN-capable host → RS Bolt → RS Ctrl → border sequence projects onto current sessions; hidden BGP layers stop it, clustered/abstract endpoints remain valid, and reduced motion uses static direction arrows. It never changes tables. Packet illustrations reuse rendered coordinates instead of recalculating layout every frame.
- Chrome checks passed for default-off, marker motion, cluster/abstract projection, hidden-layer stop, reduced motion, and unchanged expected tables. A first-frame timing bug found by the walkthrough was fixed. `go test ./...`, `go vet ./...`, JS syntax, and diff checks passed.
- Next: move the reusable module into parent content/web/cmd paths, integrate `/topologie/dc/`, and run the complete browser walkthrough and race/build checks.
