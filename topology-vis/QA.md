# Site regression audit

## Confirmed failures and fixes

| Failure | Cause and fix | Verification |
| --- | --- | --- |
| Language selection required a second click | The form had a visible submit button. `site.js` now submits the native form on selection; the button is only a no-JavaScript fallback. | Repeated Polish → English → Polish changes and return URLs across 31 page routes; JavaScript change-event test. |
| Header navigation items were vertically misaligned | The navigation flex container did not center its children. Added `align-items: center` with space between wrapped rows. | Browser bounding-box assertions and desktop/narrow screenshots, in Polish and English. |
| Tiered RS cards and the overlay preset interrupted rendering | `layout` declared `const t = model.config.topology`, shadowing the translation function. Translated tier labels then threw `TypeError: t is not a function`. Renamed the configuration variable to `topology`. | Reproduced the failing branch. Checked RS placement, grouping, and drag bounds in both languages: 64 combinations using current Go models with 1–4 hosts per rack, plus the standalone fixture. |
| A failed English catalog request could prevent topology and graph modules from loading | Module initialization let fetch/JSON failures escape. Catalog loading now falls back to Polish on request errors, invalid data, and timeout. | Network rejection, HTTP failure, invalid JSON/catalog shapes, module import after failure, and an unresponsive request. |
| Presenter SSE stream exposed moderation data without panel authorization | `widok=panel` selected the presenter snapshot without checking its cookie. The stream now uses the same authorization as the panel. | Reproduced an anonymous `200` response with moderation events. Missing/wrong cookies now receive `403`; authenticated presenter and audience streams still work. |
| Newly added buttons could keep Polish labels with an older cached English catalog | Catalog requests allowed reuse of cached JSON. Fetch the current catalog with `cache: no-store`. | A simulated stale-catalog regression fails before the fix and passes after it. Actual English browser sessions also display “Show underlay BGP” at both widths. |
| Preset changes moved switches and disrupted the map | Dependent switches disappeared, and layout dimensions/row spacing depended on RS visibility/grouping. Keep child switches visible but disabled; reserve map geometry, keep hosts at one fixed size, retain scroll, and reserve the flow-label row. | Geometry regression failed before the fix. Browser assertions now verify identical control positions, viewport bounds, zoom, scroll and customer anchors across all three presets, at both widths and in both languages. |
| The English topology retained the Polish HOSTY row label | The row label was a literal. Added it to the translation catalog. | English/Polish layout assertions. |
| An expired scenario prevented the default topology from loading | A stale workspace cookie caused reads to return `409`. Reads now clear the cookie and use the default; an open diagram reloads when inspection/exploration detects expiry. | Concurrent API reads after idle expiry, eviction and restart; integrated cookie-path checks; page-controller recovery and subsequent inspection. |
| Presenter controls overflowed narrow screens | Grid columns used their contents as a minimum width; the participant table could widen the page. Allow columns to shrink and contain the table in a keyboard-accessible scrolling region. | Reproduced a 429px page at a 390px viewport. Presenter browser checks now assert the page fits the viewport with participants and questions present. |
| Live questions and answers could widen the page | Long unbroken text and minimum grid/flex widths expanded the cards. Allow text to wrap, constrain question rows, and wrap moderation actions. | Browser viewport assertions with submitted HTML-like text, answers, votes and ownership controls, in Polish and English. |
| The sticky header covered automatically scrolled inspector routes | A wrapped header was taller than the browser's scrolling clearance. Measure the header and apply matching viewport scroll padding. | Reproduced an intercepted route click at 390px. The complete route-flow browser walkthrough now passes at desktop and narrow widths. |

The HTTP test client now replaces cookies by name and path, matching browser cookie
behavior. This allows repeated language changes and scenario-preservation checks
without sending stale, duplicate language cookies.

## Automated coverage

- Every page, including lectures, notes, exercises, graph, SVG topologies, live UI,
  presenter panel, and not-found responses. The isolated HTTP tests enable all
  content sections; production visibility settings remain authoritative.
- Language redirects, persistence, selected options, return query parameters,
  shared assets, English content, progressive hints, raw Markdown, and ZIP exports.
- DC inspector responses for all devices, VMs, and BGP sessions in the shipped model,
  in both languages. IPv4/IPv6 packets, customer UPDATE exploration, count rebuilds,
  rejected YAML preserving the scenario, exports, and language changes preserving
  the same browser workspace.
- Poll voting, nicknames, questions, answers, upvotes, mood, writing restrictions,
  moderation, question ownership, and shadow visibility through the HTTP/live tests.
- Presenter stream authorization and separation of audience data; translated SSE
  output preserves submitted text.
- Layout projection, address ownership, route families, route-flow visibility,
  packet traversal, and wire field lengths/checksums through JavaScript tests.

## Final automated verification

Passed after the fixes: `go test ./...`, `go build .`, `go vet ./...`, and
`go test -race ./internal/live ./internal/web` (using an external writable Go cache).
The direct JavaScript tests also passed: `site-controls`, `languages`, `layout`
(Polish and English), `packet-bits`, `customer-rib`, `address-ownership`,
`session-layers`, `automatic-route-flow`, and `packet-path`.

## Completed browser verification

The previous full audit ran successfully in Chrome 148 with localhost and Git writes available.
Browser checks ran against a disposable server with a copied content directory and
all material sections enabled; repository visibility settings were not changed.

`tests/site-browser.mjs` passed in Polish and English at 1280px and 390px: 30 linked
pages per pass, immediate language changes, header alignment, viewport fit, graph
loading, every progressive hint, four SVG topology views, DC layers and presets,
RS placement/grouping, zoom/fit/reset, inspectors and GUI/Linux views, packet
playback/decoding, explorer forms, YAML/count controls, reset and export.
All passes finished without page runtime errors or HTTP 5xx responses.

`tests/live-browser.mjs` passed at both widths with separate presenter, Polish audience
and English audience sessions. It covers live start/stop, translated polls,
voting/closing/reopening/resetting/hiding, nicknames, escaped questions, answers,
upvotes, ownership, writing restrictions and shadow visibility. Incoming SSE updates
preserve question, answer and nickname drafts. Presenter data stays out of audience HTML.

All nine existing browser walkthroughs passed: `browser`, `addressing`, `address-hints`,
`exploration`, `host-routes`, `kernel-routes`, `playback`, `refinements` and `route-flow`.
They cover dragging/resizing, routes/sessions, address tooltips, custom IPv6 schemes,
kernel tables, animation and reduced motion. The main walkthrough also exercised
128 devices, 432 cables, 88 VMs and 1,040 BGP sessions.

Desktop and narrow screenshots were reviewed for the header, topology and live views.
Browser artifacts are saved outside the repository under `/tmp/sev1-site-qa` and
`/tmp/dc-topology-browser`. This audit covers the shipped scenarios and interactions;
arbitrary configurations and other browsers may expose additional issues.

## Fixed hosts and configurable view motion

All hosts now retain identical dimensions, including empty hosts and hosts whose RSs
are shown in abstract tiers. They display five VM rows; additional rows scroll inside
the host with a wheel, touch or keyboard. Scroll positions survive view changes and
inspection, and connections to offscreen VMs remain within the host viewport.
`tests/host-scroll.mjs` passes in both languages at 1280px and 390px. The main browser
geometry check accounts for clipping in overflow lists and also passes with large models.

View settings provide an overall animation switch, independent appearance, RS grouping
and RS placement effects, and three durations. Preferences survive reloads. Reduced
motion suppresses transitions and interrupts an active transition immediately.
`tests/view-motion-browser.mjs` verifies all effects, movement between hosts and tiers
in both directions, clustering/declustering, rapid reversals, clean final states,
remembered settings and reduced motion, in both languages at both widths.
`tests/view-motion.mjs` verifies preference validation, unavailable/corrupted storage
and classification using the real VM identities. Screenshots of the settings and
transitions are saved under `/tmp/view-motion-*.png`.

## Automatic default scenario recovery

Expired custom scenarios now fall back to the immutable default without a manual
reset. A response marker also tells the page controller to reload an open custom
diagram before accepting default inspector tables or exploration results. Concurrent
expired detail requests share one reload, and new writes receive a fresh private
workspace cookie.

The Go regression checks cover idle expiry, eviction and server restart, simultaneous
reads, default configuration/model/tables/exploration, cookie removal at both API
paths, and isolation of subsequent writes. `tests/scenario-recovery.mjs` exercises
the actual page controller, including repeated recovery and working inspection.
`go test ./...`, `go build .`, the controller and language checks, and
`go test -race ./internal/content/dctopology ./internal/live ./internal/web` pass.
A browser rerun for this fix was blocked by the sandbox at the time of verification:
starting the local server returned `bind: operation not permitted`.

## Retired published spine-leaf topology

The deprecated `/topologie/spine-leaf` page and its four SVG view URLs return 404.
The topology index, lecture agenda and data-center notes link to the interactive
explorer in Polish and English. Its short `/topologie/dc` URL redirects to
`/topologie/dc/`, retaining query parameters and section visibility checks.
The old Polish YAML now lives only in a test fixture; the published Polish and
English static examples are removed. Generic SVG renderer tests still run.

`go test ./...`, `go build .` and the language checks pass. Chrome navigation checks
passed in both languages at 1280px and 390px, following each replacement link,
checking the removed URLs, translated lecture labels and viewport fit. They also
confirmed that a stale workspace cookie loads the 28-device default explorer.
Index screenshots were reviewed; artifacts are under `/tmp/sev1-topology-removal-*`.

## ASN ownership hints

ASNs now share the IP tooltip and owner highlight behavior, including keyboard
focus and Escape dismissal. Hints cover diagram AS labels, device/VM identities,
session endpoints, individual GUI and FRR AS_PATH entries, and decoded UPDATE
fields. Tooltips show the real owner's role and addresses, plus VM host and VRF
context. Grouped RSs highlight their aggregate badge while identifying the member.
Shared ASNs retain all owners; unknown values do not highlight an invented owner.
Matching is limited to explicit ASN/AS/path fields, keeping RD/RT, VNI and metrics
out of the ASN hints.

`tests/asn-ownership.mjs` checks ownership, VM placement, shared ASNs, 32-bit values,
model changes and token boundaries. The language checks verify English tooltip copy.
`tests/asn-hints.mjs` passes in Polish and English at 1280px and 390px, covering all
display contexts, focus, dismissal, viewport bounds and IP lookup alongside ASNs.
The existing IP browser walkthrough passes at both widths. Desktop and narrow
screenshots were reviewed; artifacts are under `/tmp/asn-hints-*.png`.

The ASN walkthrough now also follows host → expected BGP table → select a route,
then hovers and focuses every ASN in the route details. This click-through check
passes in both languages and at both widths; screenshots are under
`/tmp/asn-route-hints-*.png`. JavaScript and CSS responses now send
`Cache-Control: no-cache`, requiring revalidation before browsers reuse them after
UI changes. HTTP checks cover the module entry point, imported modules and styles,
while fonts retain their ordinary caching behavior. Go tests and the build pass.
