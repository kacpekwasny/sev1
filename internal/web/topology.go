package web

import (
	"fmt"
	"strconv"
	"strings"

	"wykladywiet/internal/content"
)

// The topology drawing is built on the server, the same way pollView builds
// the live poll: content plus a choice of view, turned into something a
// template can print without thinking.
//
// It can be done here - rather than in the browser, like the note graph -
// because the layout is not a question. A fabric has tiers, tiers are rows,
// devices spread out evenly along a row. There is nothing to simulate, so the
// picture is plain HTML and switching views is an ordinary htmx GET, exactly
// like revealing the next hint of a task.

// The four views. Switching between them only changes what goes into the view
// model; the template underneath is one template, with no idea which view it
// is drawing.
const (
	ViewCabling   = "kable"
	ViewSimple    = "uproszczone"
	ViewAddresses = "adresy"
	ViewRouting   = "routing"
)

type ViewButton struct{ ID, Label, Hint string }

var topologyViews = []ViewButton{
	{ViewCabling, "Kable", "każdy kabel osobno, tak jak leży w szafie"},
	{ViewSimple, "Uproszczone", "wiązka zamiast pęku kabli - widok z whiteboardu"},
	{ViewAddresses, "Adresy", "loopbacki, numery AS i /31 na każdym łączu"},
	{ViewRouting, "Routing", "którędy pakiet idzie do wybranego prefiksu"},
}

func knownTopologyView(id string) bool {
	for _, v := range topologyViews {
		if v.ID == id {
			return true
		}
	}
	return false
}

// Rozmiary w jednostkach viewBox. SVG skaluje się do szerokości strony, więc
// to nie są piksele - to proporcje rysunku.
const (
	svgWidth    = 920
	marginLeft  = 96 // miejsce na podpis warstwy
	marginRight = 28
	marginTop   = 34
	marginLower = 30
	rowGap      = 140
	boxW        = 108
	boxH        = 64
)

// TopologyView is one topology placed on the canvas.
type TopologyView struct {
	Topo *content.Topology
	View string

	Width  int
	Height int
	Rows   []RowLabel
	Nodes  []NodeBox
	Cables []CableLine
	Groups []GroupBox

	// Wypełniane tylko przez ten widok, który ich potrzebuje.
	Table []content.Cable // adresy
	Pool  string          // adresy: pula, z której lecą /31
	Route *RouteView      // routing

	indexInTier map[string]int
	boxOf       map[string]NodeBox
}

type RowLabel struct {
	X, Y int
	Text string
}

type NodeBox struct {
	Name   string
	Tier   string
	Class  string // "" | "start" | "cel"
	Badge  string
	X, Y   int
	W, H   int
	CX     int // środek pudełka - do niego równane są wszystkie napisy
	NameY  int
	BadgeY int
	Lines  []NodeLine
	Title  string
}

// NodeLine is one line of small print inside a device box.
type NodeLine struct {
	Y     int
	Text  string
	Class string
}

type CableLine struct {
	X1, Y1, X2, Y2 int
	Width          int
	Class          string // "" | "bundle" | "hot" | "dim"
	Label          string
	LabelX, LabelY int
	Title          string
}

// GroupBox is a dashed frame drawn around a whole tier in the simplified
// view, so that a bundle has something to end on.
type GroupBox struct {
	Tier           string
	X, Y, W, H     int
	Label          string
	LabelX, LabelY int
}

// RouteView is the routing table the first device on the path would print,
// generated from the very same cables that are drawn above it.
type RouteView struct {
	Note    string
	Command string
	Output  string
}

func (v TopologyView) Buttons() []ViewButton { return topologyViews }

// topologyView lays the topology out and then bends the result into whichever
// view was asked for. Every view starts from the same drawing.
func topologyView(topo *content.Topology, view string) TopologyView {
	v := TopologyView{Topo: topo, View: view, Width: svgWidth}
	v.layout()
	switch view {
	case ViewSimple:
		v.simplify()
	case ViewAddresses:
		v.withAddresses()
	case ViewRouting:
		v.withRouting()
	}
	return v
}

func (v *TopologyView) layout() {
	v.indexInTier = map[string]int{}
	v.boxOf = map[string]NodeBox{}
	v.Height = marginTop + (len(v.Topo.Tiers)-1)*rowGap + boxH + marginLower

	usable := svgWidth - marginLeft - marginRight
	for ti, tier := range v.Topo.Tiers {
		y := marginTop + ti*rowGap
		v.Rows = append(v.Rows, RowLabel{X: 16, Y: y + boxH/2 + 5, Text: tier.Label})
		if len(tier.Devices) == 0 {
			continue
		}
		step := usable / len(tier.Devices)
		for di, d := range tier.Devices {
			box := NodeBox{
				Name: d.Name, Tier: tier.ID,
				X: marginLeft + step*di + (step-boxW)/2, Y: y, W: boxW, H: boxH,
				Title: deviceTitle(d),
			}
			box.CX = box.X + box.W/2
			box.NameY = box.Y + 26
			box.BadgeY = box.Y - 9
			box.Lines = []NodeLine{{Y: box.Y + 45, Text: subtitle(d), Class: "sub"}}
			v.indexInTier[d.Name] = di
			v.Nodes = append(v.Nodes, box)
			v.boxOf[d.Name] = box
		}
	}
	for _, c := range v.Topo.Cables {
		v.Cables = append(v.Cables, v.cable(c, ""))
	}
}

// subtitle is the one line of small print every box carries. The AS number
// earns its place: on a fabric like this the whole routing story is told by
// which AS a box is in.
func subtitle(d *content.Device) string {
	if d.ASN != 0 {
		return "AS " + strconv.Itoa(d.ASN)
	}
	return d.Note
}

func deviceTitle(d *content.Device) string {
	parts := []string{d.Name}
	if d.Loopback != "" {
		parts = append(parts, "lo "+d.Loopback+"/32")
	}
	if d.ASN != 0 {
		parts = append(parts, "AS "+strconv.Itoa(d.ASN))
	}
	if d.Subnet != "" {
		parts = append(parts, d.Subnet)
	}
	if d.Note != "" {
		parts = append(parts, d.Note)
	}
	return strings.Join(parts, " · ")
}

// cable draws one link. Whichever end sits higher hands the cable off from
// its bottom edge; the other takes it on its top edge.
func (v *TopologyView) cable(c content.Cable, class string) CableLine {
	top, bottom := v.boxOf[c.From], v.boxOf[c.To]
	if top.Y > bottom.Y {
		top, bottom = bottom, top
	}
	line := CableLine{
		X1: top.CX, Y1: top.Y + top.H,
		X2: bottom.CX, Y2: bottom.Y,
		Width: 1, Class: class, Title: cableTitle(c),
	}
	// Etykiety kabli układają się na różnych wysokościach - po jednej na
	// urządzenie w górnej warstwie - żeby nie wylądowały jedna na drugiej.
	f := 30 + 16*v.indexInTier[top.Name]
	line.LabelX = line.X1 + (line.X2-line.X1)*f/100
	line.LabelY = line.Y1 + (line.Y2-line.Y1)*f/100
	return line
}

func cableTitle(c content.Cable) string {
	title := c.From
	if c.FromPort != "" {
		title += " " + c.FromPort
	}
	title += " ↔ " + c.To
	if c.ToPort != "" {
		title += " " + c.ToPort
	}
	if c.Routed() {
		title += " · " + c.Net + " (" + c.FromIP + " ↔ " + c.ToIP + ")"
	}
	return title
}

// simplify is the whiteboard drawing: instead of every leaf-to-spine cable,
// one thick line per leaf into a box drawn around the whole spine row. In a
// mesh rule the "to" tier is the one that gets collapsed, because that is the
// side everybody connects to.
func (v *TopologyView) simplify() {
	collapsed := map[string]int{} // warstwa -> ile urządzeń schowano
	for _, rule := range v.Topo.Mesh {
		collapsed[rule.To] = 0
	}
	for _, tier := range v.Topo.Tiers {
		if _, ok := collapsed[tier.ID]; !ok {
			continue
		}
		collapsed[tier.ID] = len(tier.Devices)
		v.Groups = append(v.Groups, v.groupBox(tier))
	}

	var lines []CableLine
	for _, c := range v.Topo.Cables {
		// Kable wchodzące do zwiniętej warstwy zastąpi wiązka.
		if _, hidden := collapsed[v.tierOf(c.To)]; hidden {
			continue
		}
		if _, hidden := collapsed[v.tierOf(c.From)]; hidden {
			continue
		}
		lines = append(lines, v.cable(c, ""))
	}
	for _, rule := range v.Topo.Mesh {
		group, ok := v.groupOf(rule.To)
		if !ok {
			continue
		}
		count := collapsed[rule.To]
		for _, d := range v.devicesOf(rule.From) {
			box := v.boxOf[d.Name]
			line := CableLine{
				X1: box.CX, Y1: box.Y, X2: box.CX, Y2: group.Y + group.H,
				Width: 7, Class: "bundle",
				Label: "×" + strconv.Itoa(count),
				Title: fmt.Sprintf("%s ma po jednym kablu do każdego z %d urządzeń warstwy %q",
					d.Name, count, rule.To),
			}
			line.LabelX = box.CX + 16
			line.LabelY = (line.Y1 + line.Y2) / 2
			lines = append(lines, line)
		}
	}
	v.Cables = lines
}

func (v *TopologyView) groupBox(tier content.Tier) GroupBox {
	first := v.boxOf[tier.Devices[0].Name]
	minX, maxX := first.X, first.X+first.W
	for _, d := range tier.Devices {
		box := v.boxOf[d.Name]
		minX = min(minX, box.X)
		maxX = max(maxX, box.X+box.W)
	}
	g := GroupBox{
		Tier: tier.ID,
		X:    minX - 18, Y: first.Y - 30, W: maxX - minX + 36, H: first.H + 46,
		Label: tier.Label + " ×" + strconv.Itoa(len(tier.Devices)),
	}
	g.LabelX, g.LabelY = g.X+14, g.Y+19
	return g
}

func (v *TopologyView) groupOf(tierID string) (GroupBox, bool) {
	for _, g := range v.Groups {
		if g.Tier == tierID {
			return g, true
		}
	}
	return GroupBox{}, false
}

func (v *TopologyView) devicesOf(tierID string) []*content.Device {
	for _, tier := range v.Topo.Tiers {
		if tier.ID == tierID {
			return tier.Devices
		}
	}
	return nil
}

func (v *TopologyView) tierOf(device string) string {
	if d, ok := v.Topo.DeviceByName[device]; ok {
		return d.Tier
	}
	return ""
}

// withAddresses puts the loopback and AS number in every box, the /31 on
// every cable, and the full list underneath - the picture for "where does
// this address actually live".
func (v *TopologyView) withAddresses() {
	for i := range v.Nodes {
		d := v.Topo.DeviceByName[v.Nodes[i].Name]
		box := &v.Nodes[i]
		box.NameY = box.Y + 21
		box.Lines = nil
		switch {
		case d.Loopback != "":
			box.Lines = []NodeLine{
				{Y: box.Y + 38, Text: d.Loopback + "/32", Class: "mono"},
				{Y: box.Y + 53, Text: "AS " + strconv.Itoa(d.ASN), Class: "sub"},
			}
		case d.Subnet != "":
			box.Lines = []NodeLine{{Y: box.Y + 40, Text: d.Subnet, Class: "mono"}}
		}
	}
	for i, c := range v.Topo.Cables {
		if c.Routed() {
			v.Cables[i].Label = shortPrefix(c.Net)
		}
	}
	v.Table = v.Topo.Cables
	v.Pool = v.Topo.FabricNet
}

// shortPrefix keeps a /31 label readable on the drawing: the pool is the same
// for every link and is written out once above the table.
func shortPrefix(net string) string {
	addr, bits, ok := strings.Cut(net, "/")
	if !ok {
		return net
	}
	octets := strings.Split(addr, ".")
	return "." + octets[len(octets)-1] + "/" + bits
}

// withRouting highlights every equal-cost path to the example prefix and
// prints the routing table that goes with it.
func (v *TopologyView) withRouting() {
	r := v.Topo.Route
	if r == nil {
		return
	}
	onPath := map[string]bool{}
	for _, p := range r.Paths {
		for i := 0; i+1 < len(p.Devices); i++ {
			onPath[linkKey(p.Devices[i], p.Devices[i+1])] = true
		}
	}
	for i, c := range v.Topo.Cables {
		if onPath[linkKey(c.From, c.To)] {
			v.Cables[i].Class, v.Cables[i].Width = "hot", 3
		} else {
			v.Cables[i].Class = "dim"
		}
	}
	for i := range v.Nodes {
		switch v.Nodes[i].Name {
		case r.From:
			v.Nodes[i].Class, v.Nodes[i].Badge = "start", "stąd"
		case r.To:
			v.Nodes[i].Class, v.Nodes[i].Badge = "cel", "dokąd"
		}
	}
	v.Route = &RouteView{
		Note:    r.Note,
		Command: r.From + "# show ip route " + r.Prefix,
		Output:  routeTable(r),
	}
}

// linkKey identifies a cable regardless of which end you name first.
func linkKey(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + "|" + b
}

// routeTable prints what FRR would show for the example prefix. The next hops
// and interfaces come from the cable list, so the text under the picture and
// the highlighted lines in it can never tell different stories.
func routeTable(r *content.Route) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Routing entry for %s\n", r.Prefix)
	fmt.Fprintf(&b, "  Known via \"bgp\", distance 20, metric 0, best\n")
	for _, p := range r.Paths {
		fmt.Fprintf(&b, "  * %s, via %s, weight 1\n", p.NextHop, p.Port)
	}
	return b.String()
}
