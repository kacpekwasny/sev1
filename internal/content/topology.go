package content

import (
	"encoding/binary"
	"fmt"
	"net/netip"
	"sort"
	"strconv"

	"gopkg.in/yaml.v3"
)

// Topology is a network drawn as data instead of as a picture.
//
// The file lists the devices and says which tiers are cabled to which; the
// cables themselves, the port names and the link addresses are derived from
// that. Real fabrics are built the same way - from a rule, not from twelve
// hand-written lines - and it has a useful side effect here: the diagram, the
// address list and the example routing output are all computed from one
// source and cannot drift apart.
type Topology struct {
	Slug    string
	Title   string `yaml:"title"`
	Summary string `yaml:"summary"`
	Note    string `yaml:"note"` // notatka z szerszym opisem

	// FabricNet is the pool every routed link takes its /31 from, in the order
	// the cabling rules produce them. IPv4 only - a /127 fabric deserves its
	// own diagram and its own note.
	FabricNet string `yaml:"fabric_net"`

	Tiers []Tier     `yaml:"tiers"`
	Mesh  []TierPair `yaml:"mesh"`  // każdy z każdym
	Pairs []TierPair `yaml:"pairs"` // i-ty z i-tym
	Route *Route     `yaml:"route"` // przykład: którędy idzie pakiet

	Cables       []Cable            `yaml:"-"` // rozwinięte z mesh + pairs
	DeviceByName map[string]*Device `yaml:"-"`
}

// Tier is one row of the drawing: all the spines, all the leaves, all the
// racks. Devices in a tier are interchangeable, which is what makes the
// cabling expressible as a rule.
type Tier struct {
	ID      string    `yaml:"id"`
	Label   string    `yaml:"label"`
	Kind    string    `yaml:"kind"` // "" = router, "endpoint" = nie routuje (szafa)
	Devices []*Device `yaml:"devices"`
}

// Routes says whether devices in this tier run BGP, which decides whether
// their links get port names and a /31.
func (t Tier) Routes() bool { return t.Kind != "endpoint" }

type Device struct {
	Name     string `yaml:"name"`
	ASN      int    `yaml:"asn"`
	Loopback string `yaml:"loopback"`
	Subnet   string `yaml:"subnet"`
	Note     string `yaml:"note"`

	Tier string `yaml:"-"`

	routes bool // z warstwy
	ports  int  // ile kabli już wpięto, do numerowania swpN
}

// TierPair names the two tiers that a cabling rule joins.
type TierPair struct {
	From string `yaml:"from"`
	To   string `yaml:"to"`
}

// Cable is one physical link: an interface on each end and, when it joins two
// routers, the /31 that numbers it.
type Cable struct {
	From     string
	FromPort string
	FromIP   string
	To       string
	ToPort   string
	ToIP     string
	Net      string // pusty dla kabli poza fabrikiem, np. leaf - szafa
}

// Routed says the link is part of the BGP fabric and therefore addressed.
func (c Cable) Routed() bool { return c.Net != "" }

// Route is one "jak tu dojdzie pakiet" example. The paths are found in the
// cable list, so adding a spine to the file adds a path to the picture.
type Route struct {
	From   string `yaml:"from"`
	To     string `yaml:"to"`
	Prefix string `yaml:"prefix"`
	Note   string `yaml:"note"`

	Paths []Path `yaml:"-"`
}

// Path is one equal-cost way from Route.From to Route.To, together with what
// the first device would print in its routing table.
type Path struct {
	Devices []string // leaf1, spine2, leaf3
	Port    string   // którym portem pakiet wychodzi z pierwszego urządzenia
	NextHop string   // adres sąsiada po drugiej stronie tego kabla
}

func (l *Library) loadTopologies(dir string) error {
	return eachFile(dir, ".yaml", func(slug, raw string) error {
		topo := &Topology{Slug: slug}
		if err := yaml.Unmarshal([]byte(raw), topo); err != nil {
			return fmt.Errorf("%s: %w", slug, err)
		}
		if err := topo.expand(); err != nil {
			return fmt.Errorf("%s: %w", slug, err)
		}
		if topo.Title == "" {
			topo.Title = slug
		}
		l.Topologies = append(l.Topologies, topo)
		l.TopologyBySlug[slug] = topo
		return nil
	})
}

// expand turns the cabling rules into a concrete list of cables, handing out
// port names and /31s as it goes. Anything that cannot be made sense of is an
// error here rather than a strange picture later.
func (t *Topology) expand() error {
	t.DeviceByName = map[string]*Device{}
	byTier := map[string]*Tier{}
	for i := range t.Tiers {
		tier := &t.Tiers[i]
		if tier.ID == "" {
			return fmt.Errorf("warstwa bez id")
		}
		if _, dup := byTier[tier.ID]; dup {
			return fmt.Errorf("warstwa %q jest w pliku dwa razy", tier.ID)
		}
		byTier[tier.ID] = tier
		for _, d := range tier.Devices {
			if _, dup := t.DeviceByName[d.Name]; dup {
				return fmt.Errorf("urządzenie %q jest w pliku dwa razy", d.Name)
			}
			d.Tier, d.routes = tier.ID, tier.Routes()
			t.DeviceByName[d.Name] = d
		}
	}

	pool, err := t.fabricPool()
	if err != nil {
		return err
	}
	links := 0 // ile /31 już rozdano

	connect := func(a, b *Device) error {
		cable := Cable{
			From: a.Name, FromPort: a.nextPort(),
			To: b.Name, ToPort: b.nextPort(),
		}
		if a.routes && b.routes && pool.IsValid() {
			prefix, first, second, err := nth31(pool, links)
			if err != nil {
				return err
			}
			links++
			cable.Net, cable.FromIP, cable.ToIP = prefix, first, second
		}
		t.Cables = append(t.Cables, cable)
		return nil
	}

	for _, rule := range t.Mesh {
		from, to, err := tiersOf(byTier, rule)
		if err != nil {
			return err
		}
		for _, a := range from.Devices {
			for _, b := range to.Devices {
				if err := connect(a, b); err != nil {
					return err
				}
			}
		}
	}
	for _, rule := range t.Pairs {
		from, to, err := tiersOf(byTier, rule)
		if err != nil {
			return err
		}
		if len(from.Devices) != len(to.Devices) {
			return fmt.Errorf("pairs %s-%s: warstwy mają %d i %d urządzeń, a łączę i-te z i-tym",
				rule.From, rule.To, len(from.Devices), len(to.Devices))
		}
		for i := range from.Devices {
			if err := connect(from.Devices[i], to.Devices[i]); err != nil {
				return err
			}
		}
	}
	return t.resolveRoute()
}

func (t *Topology) fabricPool() (netip.Prefix, error) {
	if t.FabricNet == "" {
		return netip.Prefix{}, nil
	}
	pool, err := netip.ParsePrefix(t.FabricNet)
	if err != nil || !pool.Addr().Is4() {
		return netip.Prefix{}, fmt.Errorf("fabric_net %q: potrzebuję puli IPv4, np. 10.255.0.0/16", t.FabricNet)
	}
	return pool, nil
}

func tiersOf(byTier map[string]*Tier, rule TierPair) (from, to *Tier, err error) {
	from, ok := byTier[rule.From]
	if !ok {
		return nil, nil, fmt.Errorf("reguła kablowania wskazuje na nieistniejącą warstwę %q", rule.From)
	}
	to, ok = byTier[rule.To]
	if !ok {
		return nil, nil, fmt.Errorf("reguła kablowania wskazuje na nieistniejącą warstwę %q", rule.To)
	}
	return from, to, nil
}

// nextPort hands out the next interface on a device. Ports are numbered in
// the order cables are made, which for a fabric means "uplinks first, in
// spine order" - the same convention a generator would use. Endpoints (racks,
// servers) get no port name, because there is no switch there to name it on.
func (d *Device) nextPort() string {
	if !d.routes {
		return ""
	}
	d.ports++
	return "swp" + strconv.Itoa(d.ports)
}

// nth31 carves the n-th /31 out of pool. A /31 is the normal way to number a
// point-to-point link: two usable addresses, nothing wasted on a network and
// broadcast address (RFC 3021).
func nth31(pool netip.Prefix, n int) (prefix, first, second string, err error) {
	lo := addV4(pool.Addr(), uint32(n)*2)
	hi := addV4(lo, 1)
	if !pool.Contains(hi) {
		return "", "", "", fmt.Errorf("pula %s skończyła się na %d. kablu", pool, n+1)
	}
	return netip.PrefixFrom(lo, 31).String(), lo.String(), hi.String(), nil
}

func addV4(a netip.Addr, n uint32) netip.Addr {
	b := a.As4()
	binary.BigEndian.PutUint32(b[:], binary.BigEndian.Uint32(b[:])+n)
	return netip.AddrFrom4(b)
}

// resolveRoute finds every equal-cost way from the route's start to its end.
// In a fabric two devices are either cabled straight together or exactly one
// device apart, so this never has to look deeper than two hops.
func (t *Topology) resolveRoute() error {
	r := t.Route
	if r == nil {
		return nil
	}
	if t.DeviceByName[r.From] == nil || t.DeviceByName[r.To] == nil {
		return fmt.Errorf("trasa %s -> %s: nie ma takiego urządzenia", r.From, r.To)
	}

	// Sąsiedzi widziani z każdej strony kabla: dokąd prowadzi, którym portem
	// i pod jakim adresem odzywa się druga strona.
	type hop struct{ peer, port, nextHop string }
	neighbours := map[string][]hop{}
	for _, c := range t.Cables {
		neighbours[c.From] = append(neighbours[c.From], hop{c.To, c.FromPort, c.ToIP})
		neighbours[c.To] = append(neighbours[c.To], hop{c.From, c.ToPort, c.FromIP})
	}

	var direct, twoHop []Path
	for _, first := range neighbours[r.From] {
		if first.peer == r.To {
			direct = append(direct, Path{
				Devices: []string{r.From, r.To}, Port: first.port, NextHop: first.nextHop,
			})
			continue
		}
		for _, second := range neighbours[first.peer] {
			if second.peer == r.To {
				twoHop = append(twoHop, Path{
					Devices: []string{r.From, first.peer, r.To},
					Port:    first.port, NextHop: first.nextHop,
				})
			}
		}
	}
	// Krótsza droga wygrywa: jeżeli urządzenia są wpięte wprost, ruch nie
	// pójdzie naokoło przez sąsiada.
	r.Paths = twoHop
	if len(direct) > 0 {
		r.Paths = direct
	}
	if len(r.Paths) == 0 {
		return fmt.Errorf("trasa %s -> %s: nie ma między nimi drogi", r.From, r.To)
	}
	sort.Slice(r.Paths, func(i, j int) bool { return r.Paths[i].Port < r.Paths[j].Port })
	return nil
}
