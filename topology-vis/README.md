# DC topology visualizer

The visualizer is being developed independently inside the `sev1` repository.
Its development entry point serves the same browser assets that the site will
embed after integration.

From the `sev1` repository root:

```sh
go run ./cmd/dc-topology             # http://localhost:8082
go run ./cmd/dc-topology -addr :8083 # alternate port
go test ./...
go build -o /tmp/dc-topology ./cmd/dc-topology
go vet ./...
node --input-type=module --check < web/static/dc-topology/app.js
node --input-type=module --check < web/static/dc-topology/dev.js
```

Code layout: `cmd/dc-topology/` is the isolated harness; the planned Go model,
YAML validator, and simulator live in `internal/dctopology/` with tests beside
them; YAML examples and fixtures live in `topology-vis/examples/`; and the
reusable browser modules live in `web/static/dc-topology/`. Site route and
template wiring stays in `internal/web/` and `web/templates/` for Step 12.
The project uses Go 1.22.3 and its existing `gopkg.in/yaml.v3` dependency;
the browser side has no package manager or added runtime dependency.

The Go domain layer will own YAML loading, the canonical network, deterministic
simulation state, and route/traffic results. Browser modules under
`web/static/dc-topology/` render that state and keep presentation choices such
as selection, collapsed clusters, and visible layers. The ES module exports
`mountTopologyApp(root, { onCommand })`; it returns `send`, `setState`, and
`destroy` methods. The site adapter will connect commands and state to Go and
call `destroy` when its page or htmx fragment is removed.

The current shell has no YAML loader or simulation endpoint yet. Step 02 will
define those contracts after the remaining route-policy and session-family
decisions are resolved.

The browser syntax commands above do not exercise rendering. For a browser
smoke check, run the harness, open `http://localhost:8082/`, and inspect the
empty state at a desktop and narrow viewport. Check that the page has no
horizontal overflow or console errors. Go tests and builds do not validate
browser behavior.
