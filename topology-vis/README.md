# DC topology explorer

Run the site from the repository root:

```sh
go run . -dev
```

Open **http://localhost:8081/topologie/dc/**, also linked from Topologie.
The explorer uses local JavaScript modules and SVG; it has no htmx interactions,
CDN, frontend package manager, or frontend build step.

For independent development, the same renderer and domain package run in a harness:

```sh
go run ./cmd/dc-topology                  # http://127.0.0.1:8084/
go run ./cmd/dc-topology -addr 127.0.0.1:8085
```

The default YAML is [default.yaml](../content/dc-topology/default.yaml).
It describes 28 physical devices (including eight hosts), 60 cables, 16 RS VMs,
three customer VMs, and 160 BGP sessions. Go validates configuration and calculates
an initial expected route/forwarding snapshot. It recalculates on YAML load or
count rebuild; there is no protocol clock, convergence simulator, or live routing
collection. Default VMs use public/default VRF (ID 0, VNI 3, RT target:64512:0).
Positive IDs explicitly configure private VPCs with VNI 10000+ID. RS User only
imports customer advertisements. Original IPv4/IPv6 routes continue through
User → Ctrl → Bolt → all host neighbors and borders. Hosts retain every NLRI in
BGP RIBs; private forwarding remains scoped to its VPC. Default-VRF unicast routes
resolve VM next hops through the imported VM EVPN route and its IPv4 VTEP; they
are not converted into EVPN at Ctrl. GUI/Linux forwarding and route details show
that recursive resolution. Default-VRF border egress uses table main without VXLAN.
Each border originates public IPv4/IPv6 defaults through fabric and Ctrl sessions.
Expected BGP selection retains one default per family, with physical underlay
ECMP to the selected border; specific VM and configured static egress routes take
precedence. Public defaults do not enter private guest VRFs. External uplinks are
outside the drawn fabric; the model ends the default's packet path at the border.
Kernel views show the resolved dataplane: local VM /32 and /128 static routes
use unnumbered TAPs; remote VM and recursive customer routes use an illustrative
L3-SVI (`br<VNI>`) backed by `vxlan<VNI>`, with neighbor/router-MAC/FDB context.
IPv6 overlay neighbors use IPv4-mapped addresses; the outer VTEP stays IPv4.
Device loopbacks and IPv6-only RS service advertisements use physical underlay
ECMP; local loopbacks belong to table local. VM inspection projects its host's
VRF, not a guest kernel configuration. Reference: [FRR EVPN](https://docs.frrouting.org/en/stable-10.5/evpn.html),
[Linux VXLAN](https://kernel.org/doc/html/latest/networking/vxlan.html).
The examples include EVPN Type 5, VPC isolation, VXLAN context,
underlay ECMP, customer IPv4/IPv6 peering, and data/control packet paths.

Click a device, VM, cluster, link, or session to open a popup over the topology.
Expected BGP/forwarding tables and exports load on demand inside the popup.
Escape or the close button dismisses it and restores focus. The topology remains
visible; on narrow screens the popup fills most of the canvas width.
Every disclosure groups its children with a shallow indented branch. Resize the inspector
by dragging any edge/corner or using its bottom-right handle. Focus that handle
and use arrow keys; Home
restores the default size. Hover/focus session rows to preview their connections.

Drag a device to make a small visual adjustment, bounded to a 48-layout-unit radius
and tighter limits inside compact cells to keep devices and badges contained.
Its connected lines follow. Arrow keys move a focused icon, Shift increases the
step, and Home restores its anchor. Reset układu clears offsets; Dopasuj adjusts
zoom to the canvas width. Moving a host carries its displayed VM anchors.
Dragging changes only the drawing, and offsets clear on a configuration rebuild.

Łącza and Sesje BGP are independent switches. RS grouping retains four actual
members per cluster. With RS na hostach enabled, a collapsed icon anchors to the
first member's real host; the other members keep their own placements and tables.
VM badges occupy the upper part of taller hosts, above their names. Turn off
RS na hostach for tiered RS cards over the fabric: Bolt above its served leaves,
Ctrl centered, and User at the top right. Expanded cards show all four members;
Grupuj RS replaces them with one aggregate icon. Rack outlines stay inside their
bolt, with gaps between neighboring racks and bolts.
Urządzenia underlay hides fabric switches and their links while retaining hosts
and VMs. Its Zostaw border suboption appears when underlay is hidden and is enabled
by default: border devices remain visible with their RS Ctrl sessions when Sesje
BGP is on. Turn the suboption off to hide borders too. Hidden physical paths pause
playback; the configuration stays unchanged.
Hosts use slugs such as `h2001`; individual RSs use `rs13001`, `rsctrl4`, and
`rsuser3`-style labels. Canonical configuration/API IDs stay stable.

Przepływ tras and Sesje BGP start enabled. The sequence cycles representative
examples for every available family, origin role and VPC: EVPN first, then
customer unicast and fabric IPv4/IPv6. Ogłoszenie repeats one chosen example.
Its label shows the prefix, origin, family/VPC and propagation wave. One prefix
runs at a time, branching into UPDATEs at RSs along expected exports. Each branch
continues to a host, customer VM or border; redundant RS-only ends are omitted.
Marker tooltips identify the prefix and sender/recipient. While an UPDATE is
inspected, its complete prefix fanout repeats; the inspector retains the chosen
endpoint path and decoded steps. Closing it resumes the examples.
Flow does not learn routes or change tables. Reduced motion keeps static directions.
Packet examples separately follow their calculated physical paths.

Sprawdź przepływ między urządzeniami adds two endpoint selectors for each flow.
Choose nodes or individual VMs, then show an UPDATE or packet in the canvas popup.
UPDATE flow follows actual expected exports of a compatible route; choose another
route from the populated list. Expand each step to inspect NLRI, next hop, AS path,
and EVPN attributes. Session export rows also have an UPDATE inspection button.
Custom flow still uses the Przepływ tras switch and does not change routing state.

Click a device/VM, choose Wyślij ruch do… beside it, then click the destination.
The compact action offers IPv4/IPv6; grouped RSs offer a concrete member. Escape
cancels target selection. The collapsed Zaawansowane controls retain manual
selectors and UPDATE exploration. Move the popup using its ⠿ handle (also arrow keys; Home resets).
Pressing outside the compact send-action popup dismisses it.

Packet examples use IPv4 ICMP or IPv6 ICMPv6 Echo Request. Customer VM pairs obey
VPC forwarding/isolation; choosing a border targets a configured static egress
prefix or its identity address. Borders advertise no BGP routes. Static IPv4/IPv6
routes to both borders remain available in underlay and tenant contexts; inspect
them in Trasy do border, separately from expected BGP RIBs.
Nodes and infra VMs use underlay paths. Unsupported tenant destinations report why
they cannot be reached. Inspection includes inner/outer headers, UDP/VNI, selected
ECMP path, and interfaces at each hop. Closing the custom packet popup keeps its
path for playback; Inspektuj pakiet reopens it. Highlighted steps follow playback.
Inspektuj pakiet opens containing sections, brings the popup into view below the
navigation, and scrolls its body to the focused Pakiet bit po bicie heading and
fields. This also works for fetched preset packets and BGP session transport.
Sending traffic or clicking a preset starts playback after calculation. Presets
retain their saved ECMP path and include local VM/TAP hops. Packet inspection
reuses that packet without resetting its position. Odtwórz pakiet resumes or
replays the selected path even when the OS requests
reduced motion. Decorative route animation still honors that preference. Hiding
physical links pauses playback, including packets between custom endpoints.
The packet marker travels on the yellow cable/TAP segments, using device ports
and continuously crossing node interiors from ingress to egress. Yellow interior
segments connect adjacent cable/TAP contacts; playback keeps the current hop
highlighted while traversing its node.
TTL, Echo fields, and payload are illustrative; this is not a packet capture.

Pakiet bit po bicie shows the serialized sample in 32-bit rows. Click a field or
its bits for its value, width, bit offsets and explanation.
Hover or keyboard-focus any field fragment to highlight that entire field across
rows, including all four rows of an IPv6 address. Click selection stays visible.
Packet lengths and checksums are computed, including ICMPv6/UDP pseudoheaders. The VXLAN packet view
shows the source VTEP's egress with outer IPv4; synthetic MACs and sample header
values are identified. BGP session inspection also has a sample TCP/KEEPALIVE map.
Wire references: [IPv4](https://www.rfc-editor.org/rfc/rfc791),
[IPv6](https://www.rfc-editor.org/rfc/rfc8200),
[ICMPv6](https://www.rfc-editor.org/rfc/rfc4443), and
[VXLAN](https://www.rfc-editor.org/rfc/rfc7348).

Every VM has eth0 and a local host TAP, listed in inspection and used by packet
paths. Local attachments remain separate from physical cables. Host RIBs visibly
separate EVPN Type 5, IPv4, and IPv6; EVPN retention does not imply importing another
VPC into forwarding. Select GUI or Linux / FRR in the inspector to switch between
concise cards and command-style expected BGP/kernel output. No commands are run.
Every device/VM inspector has Trasy inicjowane przez urządzenie, independently
of learned routes. RSs without local NLRI explain service-prefix ownership by
the host. Originated routes are clickable in both formats.

AFI/SAFI sections are visually nested under the expected RIB. Routes in either
format are clickable. The back arrow restores the previous table and its expanded
sections. Purple arrows show the route's learned path into that specific RIB;
yellow arrows show its resolved next-hop path and local target VM when applicable.
Hover or keyboard-focus a route to preview both paths without opening route details
or changing the current selection. Leaving restores the selected path. Previewing
uses cached metadata and does not query/recalculate route tables.
A single purple arrow travels along the learned path on hover or route inspection,
even with Przepływ tras off. Reduced motion keeps a stationary direction arrow.
Click inspection keeps the selected RIB candidate and its attributes in context;
it does not list topology-wide exports of that prefix. Exports remain inspectable
within an individual BGP session.
EVPN Type-5 next hops use IPv4; BGP transport remains IPv6. Each RS prepends its
ASN, so a host → RS Bolt → RS Ctrl → RS Bolt → host UPDATE carries all four
sending ASNs, closest first; locally originated RIB paths are empty. RS Bolt members stay
inside their served bolt, and RS Ctrl covers all bolts. Explicit YAML placement
must meet these policies, with host diversity preferred for generated members.

Formatting references: [FRR BGP/EVPN](https://docs.frrouting.org/en/latest/bgp.html),
[Linux iproute2](https://www.man7.org/linux/man-pages/man8/ip-route.8.html), and
[Linux TAP](https://docs.kernel.org/networking/tuntap.html).

Konfiguracja opens YAML editing, count controls, reset, and export. Invalid input
preserves the last valid scenario. Export/reload reproduces its network and expected
tables, preserving all RS members and actual placements even when dragged/collapsed.
Reducing the customer count removes references to deleted customer VMs.

Edited scenarios are private to the browser and stay in memory. They expire after
30 idle minutes or server restart; at most 16 edited scenarios are retained, with
the oldest evicted when necessary. An expired scenario reports an error instead
of silently returning different tables. Reload YAML or restore the example to
continue; export YAML to retain a scenario. The default fixture is read at server
startup; restart after editing it. Production embeds browser assets under `web/`,
while the YAML ships with `content/` and follows the site's `-content` flag.

The canonical model and expected-state calculator live in
`internal/content/dctopology/`, browser layout/interactions in
`web/static/dc-topology/`, and site wiring in `internal/web/dc_topology.go`.
`mountTopologyApp(root, { onCommand })` returns `send`, `setState`, and `destroy`;
the adapter serializes configuration changes and aborts requests on teardown.

Run the normal checks from the Git root:

```sh
go test ./...
go vet ./...
go build .
go build ./cmd/dc-topology
go test -race ./internal/content/dctopology ./internal/live ./internal/web
node --input-type=module --check < web/static/dc-topology/app.js
node --input-type=module --check < web/static/dc-topology/dev.js
node --input-type=module --check < web/static/dc-topology/tables.js
node --input-type=module --check < web/static/dc-topology/inspection.js
node --input-type=module --check < web/static/dc-topology/packet-bits.js
node --input-type=module --check < web/static/dc-topology/route-paths.js
node topology-vis/tests/packet-bits.mjs
node topology-vis/tests/packet-path.mjs
```

The optional browser walkthrough in [tests/browser.mjs](tests/browser.mjs) uses an
external Playwright installation and installed Chrome. It does not add dependencies
to the application. With Playwright available outside the repo and the site running:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
TOPOLOGY_URL=http://127.0.0.1:8081/topologie/dc/ \
node topology-vis/tests/browser.mjs

PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
TOPOLOGY_URL=http://127.0.0.1:8081/topologie/dc/ \
node topology-vis/tests/exploration.mjs

PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
TOPOLOGY_URL=http://127.0.0.1:8081/topologie/dc/ \
node topology-vis/tests/refinements.mjs
node topology-vis/tests/playback.mjs
node topology-vis/tests/route-flow.mjs
node topology-vis/tests/kernel-routes.mjs
```

The walkthrough checks desktop/narrow popup behavior, stale responses, mouse/touch
and keyboard dragging, invariant tables/export, layers/clusters, reduced motion,
packet illustration, invalid/zero-count rebuilds, YAML reload, browser isolation,
capped scale, and teardown. Screenshots default to `/tmp/dc-topology-browser`.
The endpoint walkthrough adds decoded UPDATE/packet inspection, TAP/VXLAN paths,
IPv4/IPv6 selection, packet bits, click-picked endpoints, popup dragging, table
back navigation, route provenance, delayed queries, and narrow layout. The pure
packet test verifies wire lengths/checksums and route-path context without Chrome.
The refinements walkthrough checks underlay hiding, outside dismissal, disclosure
hierarchy, resizing, session hover, slugs, customer exports, static border routes,
and packet-marker alignment with its yellow track at both viewport widths.
Measured timings are local observations, not a performance guarantee; see
[PROGRESS.md](PROGRESS.md) for the latest verification.

Every physical fabric and host link is IPv6 link-local only; BGP transport
includes interface scope. Device loopbacks and IPv4 VTEPs remain numbered.
