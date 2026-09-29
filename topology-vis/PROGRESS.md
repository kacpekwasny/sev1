# Visualizer progress

Updated: 2026-09-29

## Status

- Completed: Step 01 — isolated shell, development command, mount contract, and checks.
- Pending: Step 00 (remaining routing/session/scope decisions), Steps 02–13.
- D03 was removed by the user in the working tree; that user-authored edit is not part of this increment's commit. D02 route policy and initialization, D05 ASNs/session families, D08 inspector and traffic scope, and D10 site entry point remain open in `DECISIONS.md`.

## Current increment

The independent harness runs at `/` from `cmd/dc-topology` and serves the local site assets. The shell shows a clear empty state. Go owns canonical configuration and simulation state; the browser module owns presentation and sends commands through `mountTopologyApp(root, { onCommand })`. Its `setState` and `destroy` methods let the site adapter update and clean up the mounted view. No YAML parsing or simulation behavior is included yet.

Files: `cmd/dc-topology/main.go`, `web/static/dc-topology/{dev.html,app.css,app.js,dev.js}`, `topology-vis/README.md`, and `topology-vis/IMPLEMENTATION_PLAN.md`.

## Validation

- Baseline before implementation: `go test ./...` passed.
- Final checks: `go test ./...`, `go build .`, `go build -o /tmp/dc-topology ./cmd/dc-topology`, `go vet ./...`, `node --input-type=module --check < web/static/dc-topology/app.js`, and the equivalent `dev.js` syntax check passed.
- HTTP smoke: `GET /`, `GET /static/dc-topology/app.css`, and `GET /static/dc-topology/dev.js` returned successfully from `go run ./cmd/dc-topology -addr 127.0.0.1:8090`.
- Browser: the in-app browser runtime was unavailable, so local Chrome was used as a fallback. At 1280×900 and 390×844, the shell and empty state rendered, document width matched viewport width, and no console errors or runtime exceptions were captured.
- Mount contract check: command dispatch reached `onCommand`; `setState` showed and cleared the ready state; `destroy` removed the mounted view.

## Next action

Resolve the D02 and D05 routing/session choices that govern the YAML contract before implementing Step 02. D08 remains a dependency for route-table and traffic behavior; D10 is required before site integration in Step 12.
