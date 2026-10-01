# DC topology explorer

Run the site from the repository root:

```sh
go run . -dev
```

Open **http://localhost:8081/topologie/dc/**, also linked from Topologie.
Use the site header to switch between Polish and English. For the independent
harness, add `?lang=en` to its URL to use the same English UI catalog.
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
ECMP to the selected border; specific VM and loopback routes take precedence. Public defaults do not enter private guest VRFs. External uplinks are
outside the drawn fabric; the model ends the default's packet path at the border.
Every physical fabric and host link is IPv6 link-local only; BGP transport
includes interface scope. Device loopbacks and IPv4 VTEPs remain numbered.
Host static routes are only local VM TAP /32s and /128s (including IPv6 infra
services). Customer static prefixes are redistributed as EVPN Type 5 with
incomplete ORIGIN. Remote VM copies use BGP/VXLAN, and border loopbacks use
underlay BGP; no fleet-wide static border routes are synthesized.
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

The Pokaż fizyczną topologię, Pokaż underlay BGP, and Pokaż overlay BGP presets
beside Reset układu and Dopasuj apply the workspace switches in one click.
The physical preset shows devices and cables with BGP sessions hidden.
The underlay BGP preset shows physical devices with fabric and host–ToR sessions,
hiding cables and overlay BGP. The overlay preset shows grouped RS tiers and
overlay BGP with fabric devices and cables hidden.
A pressed preset matches the current controls; manual adjustments remain possible.
Dependent switches stay in place and become disabled when their parent layer is off.
Canvas dimensions, rack outlines, device row anchors, customer positions, zoom and
scroll stay stable across presets and RS grouping. Host boxes resize downward from
fixed top edges; moving RSs to abstract tiers uses reserved space above the fabric.
The advertisement row retains its space when flow is off, and long wave labels are
truncated with their complete text available on hover.
They preserve YAML, calculated routes, dragged offsets and the flow switch.

Łącza and Sesje BGP are independent switches. The master Sesje BGP switch enables
BGP underlay and BGP overlay child switches, initially both enabled. When the
master is off, both child switches stay visible but disabled. Underlay
controls fabric and host–ToR peering; overlay controls host/Bolt/Ctrl/User,
customer/User and border/Ctrl peering regardless of AFI or physical placement.
The overlay preset enables overlay BGP only; enabling Sesje BGP after the
physical topology preset enables underlay BGP only. The underlay BGP preset
enables that layer directly. Flow omits whole examples crossing a
hidden layer instead of stopping them at an RS. Explicit originated-route or
session hover can still preview the inspected context with the layers off.
RS grouping retains four actual
members per cluster. With RS na hostach enabled, a collapsed icon anchors to the
first member's real host; the other members keep their own placements and tables.
VM badges occupy the upper part of taller hosts, above their names. Turn off
RS na hostach for tiered RS cards over the fabric: Bolt above its served leaves,
Ctrl centered, and User at the top right. Expanded cards show all four members;
Grupuj RS replaces them with one aggregate icon. Rack outlines stay inside their
bolt, with gaps between neighboring racks and bolts.
Urządzenia underlay hides fabric switches and their links while retaining hosts
and VMs. Its Zachowaj routery border suboption is always visible, becomes available when
underlay is hidden, and is enabled by default: border devices remain visible with their RS Ctrl sessions when Sesje
BGP is on. Turn the suboption off to hide borders too. Hidden physical paths pause
playback; the configuration stays unchanged.
Hosts use slugs such as `h2001`; individual RSs use `rs13001`, `rsctrl4`, and
`rsuser3`-style labels. Canonical configuration/API IDs stay stable.

Przepływ tras and Sesje BGP start enabled. The sequence cycles representative
examples for each distinct propagation pattern, origin role and VPC: EVPN first,
then customer unicast and fabric. Automatic playback keeps the first family when
IPv4/IPv6 share the same directed session graph and wave structure in the same
routing context; different branches, directions and VPC/route types remain.
Both families stay in Ogłoszenie, which repeats one explicitly chosen example.
Focused UPDATE and originated-route inspection keep their selected family too.
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
VPC forwarding/isolation; choosing a border targets a configured external
prefix or its identity address. Borders advertise public defaults and their
loopbacks through physical underlay BGP only; defaults never pass through route
servers. `route_origins` describes external
packet targets; these prefixes do not install static routes across hosts.
Public external traffic uses the learned default, while private VRFs remain
isolated without an assumed border egress.
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
Host inspection also shows **Tablica routingu hosta · RIB Zebra**, the combined
selected VRF routing table, separately from BGP AFI RIBs and kernel FIB output.
GUI and CLI expose local static TAP routes, remote EVPN imports through
L3-SVI/VXLAN, recursive customer routes and underlay/connected entries. Imported
VM routes include VNI and IPv4 VTEP resolution instead of only a BGP next hop.
Primary VM addresses are static TAP routes on their host and EVPN imports on
other hosts. RS User does not advertise those primary addresses again. Only
after public primary EVPN/underlay connectivity exists can a configured VM ↔
RS User session carry additional unicast prefixes. The combined host RIB shows
those prefixes as `IPv4/IPv6 unicast via primary VM IP`, including local recursion,
separately from primary EVPN imports. The kernel FIB shows the resolved delivery
through an L3-SVI/VTEP or local TAP; it does not change the original unicast NLRI.

Declare additional prefixes separately from host-attached `addresses`:

```yaml
customer_vms:
  rs_user_peers: [3]
  overrides:
    - id: 3
      advertised_prefixes: [10.96.0.3/32, "2001:db8:6:300::/64"]
route_servers:
  user_origins:
    - id: shared-ip-example
      member: 1
      next_hop_vm_id: 3
      prefix: 10.96.1.3/32
```

This fragment extends a complete configuration. A VM advertises only its explicit
additional list, with its primary IPv4 or IPv6 as next hop. `user_origins` can
inject a prefix directly at RS User without customer BGP peering, but still needs
primary VM reachability. Shared prefixes may have multiple VM advertisers; the
expected RIB retains candidates and its best path selects the backing VM. Exact
primary /32-/128 duplication is rejected. Private VRFs retain their primary EVPN
isolation and do not gain public RS User peering or additional-route exports.
Every device/VM inspector has Trasy inicjowane przez urządzenie, independently
of learned routes. RSs without local NLRI explain service-prefix ownership by
the host. Originated routes are clickable in both formats. Their hover/focus and click
preview complete redistribution waves, including RS fanout, using cached
metadata for that exact prefix. Preview works with decorative flow/sessions off;
leaving restores the layer switches and prior selection.

Hover or keyboard-focus a displayed address to see its purpose and owner. Hints
cover device loopbacks, customer and RS VM addresses, IPv4 VTEPs and mapped IPv6
neighbors, link-local interface scope, default prefixes and external targets.
Known owners are highlighted in the topology, including grouped RS members.
Customer addresses are resolved within their VRF; shared or unknown addresses
are labeled without inventing ownership. Hints also work in Linux output and
decoded packet fields, and remain inside the viewport while the popup scrolls.

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

IPv6 identities are configurable in `addressing.ipv6`:

```yaml
addressing:
  ipv6:
    fabric_prefix: 2001:db8:1::/48
    host_prefix: 2001:db8:2::/48
    rs_bolt_prefix: 2001:db8:3::/48
    rs_ctrl_prefix: 2001:db8:4::/48
    rs_user_prefix: 2001:db8:5::/48
    customer_prefix: 2001:db8:6::/48
    suffix: 1
```

Each role prefix must be an aligned, distinct IPv6 /48 from global unicast or
ULA space. Fields are optional; omitted fields use the values above, including
when validating overlap with configured roles. The address layout is
`<role prefix /48>:<scope 16-bit>:<entity 32-bit>:<suffix 32-bit>`.
Scope is the bolt ID for hosts/RS Bolt, otherwise zero; entities retain their
stable existing IDs. Integers are decimal in YAML and hexadecimal in IPv6 output.
For example, `host_prefix: fd42:1234:20::/48` and `suffix: 42` produce
`fd42:1234:20:1:0:1:0:2a` for h1001. Suffix may be 0–4294967295.
The shipped example remains documentation-only; custom prefixes are illustrative
configuration and do not contact external routers.

All generated loopbacks, VM addresses, IPv6 BGP transports, route origins,
RIB/FIB entries and inspected IPv6 packets use the configured identities.
Physical links remain link-local and VXLAN VTEPs remain IPv4. Explicit customer
IPv6 overrides may use the customer prefix or the legacy documentation pool;
route-origin/traffic prefixes may additionally use any declared IPv6 role pool.
Export/load and count rebuilds preserve the scheme; invalid schemes leave the
last valid snapshot intact.

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
node topology-vis/tests/session-layers.mjs
node topology-vis/tests/automatic-route-flow.mjs
node topology-vis/tests/address-ownership.mjs
node topology-vis/tests/customer-rib.mjs
node topology-vis/tests/languages.mjs
node topology-vis/tests/layout.mjs pl
node topology-vis/tests/layout.mjs en
node topology-vis/tests/site-controls.mjs
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
hierarchy, resizing, session hover, slugs, customer exports, learned border routes,
and packet-marker alignment with its yellow track at both viewport widths.
Measured timings are local observations, not a performance guarantee; see
[PROGRESS.md](PROGRESS.md) for the latest verification.

IPv6 configuration and physical-link checks:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
TOPOLOGY_URL=http://127.0.0.1:8081/topologie/dc/ \
node topology-vis/tests/addressing.mjs
```

Host routing and address inspection walkthroughs (same external setup):

```sh
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
TOPOLOGY_URL=http://127.0.0.1:8081/topologie/dc/ \
node topology-vis/tests/host-routes.mjs

PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
TOPOLOGY_URL=http://127.0.0.1:8081/topologie/dc/ \
node topology-vis/tests/address-hints.mjs
```

The site regression walkthrough checks immediate language changes, header alignment,
rendered local page links, hints, topology views, and the DC controls in both languages
at desktop and narrow widths. Run it on a disposable local server:

```sh
PLAYWRIGHT_MODULE=/tmp/topology-browser/node_modules/playwright-core/index.mjs \
  SEV1_URL=http://127.0.0.1:8081/ node topology-vis/tests/site-browser.mjs
```

[QA.md](QA.md) records confirmed failures, fixes, automated coverage, and checks
completed in an actual browser. The standalone layout checks also accept a real
model JSON file as their third argument.

The live walkthrough uses separate audience and presenter sessions to check voting,
questions, answers, moderation, translations, viewport fit and SSE draft preservation.
It changes the disposable server's in-memory live state:

```sh
PLAYWRIGHT_MODULE=/tmp/topology-browser/node_modules/playwright-core/index.mjs \
  SEV1_URL=http://127.0.0.1:8081/ node topology-vis/tests/live-browser.mjs
```
