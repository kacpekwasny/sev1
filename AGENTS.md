# Project guide for Luna and other coding agents

## Brief context

Polish-language companion site for an open networking lecture series at AGH WIET:
lecture materials, Obsidian-style notes, exercises, and live audience interaction.
Go serves HTML with htmx and SSE; content is Markdown/YAML and live state is in memory.

## Start here, without rediscovering the repository

- Run `git status --short` and inspect existing changes in files you need to touch.
  Preserve unfinished user work; do not include it in your commits.
- Use the map below to read only the relevant implementation, templates, and tests.
  Do not scan the whole repository or reread the entire README for every task.
- `README.md` has longer explanations and content examples; consult the relevant
  section when needed. `TODO.md`, if present, records pending work and preferences;
  it is not a request to implement every item during an unrelated task.
- Treat this guide as a navigation aid. If code contradicts it, verify the specific
  point and update the affected guidance. Keep it short and avoid session logs.

## Where to work

| Task | Start with |
| --- | --- |
| Startup, flags, embedding, HTTP server lifecycle | `main.go` |
| Routes, handlers, cookies, presenter authorization, SSE | `internal/web/server.go` |
| Template loading, helpers, render data | `internal/web/templates.go` |
| Page layout and interactions | `web/templates/pages/`, matching `web/templates/partials/` |
| Shared navigation, metadata, footer | `web/templates/base.html` |
| Styling, responsive layout, palette | `web/static/app.css` |
| Polls, Q&A, answers, nicknames, moderation, broadcasts | `internal/live/hub.go`, `internal/live/nicknames.go` |
| Audience reactions and expiry | `internal/live/mood.go`, mood methods in `hub.go` |
| Content models, YAML headers, Markdown, wikilinks | `internal/content/content.go` |
| Obsidian ZIP export | `internal/content/vault.go` |
| Network model, cables, addressing, routes | `internal/content/topology.go`, `content/topologies/*.yaml` |
| Topology SVG layout and view modes | `internal/web/topology.go`, topology templates |
| Notes graph in the browser | `web/static/graph.js` |
| Lecture descriptions and agendas, notes, exercises, polls | `content/lectures/`, `content/notes/`, `content/tasks/`, `content/polls.yaml` |
| Live-slide glossary definitions | `content/glossary.yaml`; agenda `terms` fields in `content/lectures/*.md` |
| Visual references | Posters in `design/`; explanation in README |

Tests live beside implementation in `internal/{content,live,web}/*_test.go`.
The web tests use the repository's real content and templates through `newTestServer`.

## Commands and runtime facts

Run from the repository root. `go.mod` declares Go 1.22.3. There is no Node build,
frontend package installation, database, or migration step.

```sh
go run . -dev                    # http://localhost:8081
go run . -dev -addr :8082         # alternate port when another server is running
go test ./...                    # content, live behavior, HTTP/template tests
go build .                      # produces ./wykladywiet (gitignored)
go vet ./...                    # Go static checks
go test -race ./internal/live ./internal/web  # when changing concurrency/SSE
```

- The default port is **8081** in `main.go`.
- Local presenter panel: `/panel?token=sev1` unless `PANEL_TOKEN` is set.
  Set a real `PANEL_TOKEN` for deployment.
- `-dev` reads web assets from disk and reloads content/templates on requests.
  Go code changes still require restarting the process.
- Production embeds **`web/` only**. Markdown/YAML stays on disk: ship `content/`
  and use `-content /path/to/content` if the working directory differs.
- Polls, participants, questions, moderation, and other live state reset on restart.

## Conventions and pitfalls

- Follow the existing Go + `html/template` + htmx approach. Keep browser assets local
  under `web/static/`; fonts and htmx are vendored so the site needs no CDN at runtime.
- Keep user-facing copy in Polish and retain Polish characters. Use the existing
  CSS variables and Poppins typography; `design/` supplies the visual reference.
- `/` is the poster-like entry page (`pages/intro.html`, `Bare` rendering).
  `/wyklady/` is the materials hub (`pages/hub.html`). Keep those roles distinct
  unless the task explicitly changes them.
- Each page template is parsed separately with the base and all partials. Partials
  also render independently for htmx/SSE: check the data passed by both paths.
- When changing live UI, follow the whole path: hub state → handler/view data →
  partial → htmx/SSE target. Preserve fragment IDs and event names across that path.
  Keep text-entry forms outside SSE-replaced regions; `#answer-box` deliberately
  survives incoming updates so another person's vote cannot erase a draft.
- Preserve viewer-specific moderation: shadowed writing is visible to its author
  and the presenter, but hidden from the rest of the room. Writing restrictions
  do not also disable voting. Presenter-only data must stay out of audience HTML.
- SSE connections are long-lived: `main.go` deliberately omits `WriteTimeout`.
  Proxy deployments must avoid buffering SSE and set trusted forwarding headers.
- Content filenames supply slugs. Preserve `[[note-slug|label]]` wikilinks and raw
  Markdown for Obsidian export; links with a folder such as `[[zadania/slug]]` point
  outside notes. Prefer editing source content over hardcoding it in templates.
- Markdown allows raw HTML because authors control the content files. Do not use
  that trusted-content rendering path for audience-submitted text.
- Topology semantics belong in `internal/content`; screen coordinates and SVG
  presentation belong in `internal/web`.

## Finishing a change

- Format modified Go files with `gofmt`. Add or adjust behavior tests when relevant.
- Run `go test ./...` for code, template, or content changes; run `go build .` for
  Go/embedding changes. Use the race check above for shared-state changes.
- For UI changes, inspect the affected page at desktop and narrow widths when a
  browser is available. For live interactions, check audience and presenter views
  and that incoming updates preserve typed text. Report checks you could not run.
- Review the diff for unrelated edits. The preference recorded in `TODO.md` is to
  commit each new working feature; stage only the files/changes belonging to it.
- Summarize what changed, what was verified, and any remaining limitation.
