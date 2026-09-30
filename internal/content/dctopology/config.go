package dctopology

import (
	"bytes"
	"fmt"
	"io"
	"net/netip"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

const SchemaVersion = 1

var (
	customerIPv4Pool = netip.MustParsePrefix("10.64.0.0/10")
	documentationV6  = netip.MustParsePrefix("2001:db8::/32")
	routeIPv4Pools   = []netip.Prefix{
		netip.MustParsePrefix("10.0.0.0/8"),
		netip.MustParsePrefix("192.0.2.0/24"),
		netip.MustParsePrefix("198.51.100.0/24"),
		netip.MustParsePrefix("203.0.113.0/24"),
	}
)

type Config struct {
	SchemaVersion int                 `yaml:"schema_version" json:"schema_version"`
	Addressing    AddressingConfig    `yaml:"addressing,omitempty" json:"addressing,omitempty"`
	Topology      TopologyConfig      `yaml:"topology" json:"topology"`
	VPCs          []VPCConfig         `yaml:"vpcs" json:"vpcs"`
	CustomerVMs   CustomerVMConfig    `yaml:"customer_vms" json:"customer_vms"`
	RouteServers  RouteServerConfig   `yaml:"route_servers" json:"route_servers"`
	RouteOrigins  []RouteOriginConfig `yaml:"route_origins,omitempty" json:"route_origins,omitempty"`
	Traffic       []TrafficRequest    `yaml:"traffic,omitempty" json:"traffic,omitempty"`
}

type TopologyConfig struct {
	Borders       int `yaml:"borders" json:"borders"`
	Stems         int `yaml:"stems" json:"stems"`
	Spines        int `yaml:"spines" json:"spines"`
	Bolts         int `yaml:"bolts" json:"bolts"`
	LeavesPerBolt int `yaml:"leaves_per_bolt" json:"leaves_per_bolt"`
	RacksPerBolt  int `yaml:"racks_per_bolt" json:"racks_per_bolt"`
	HostsPerRack  int `yaml:"hosts_per_rack" json:"hosts_per_rack"`
}

type VPCConfig struct {
	ID   uint32 `yaml:"id" json:"id"`
	Name string `yaml:"name" json:"name"`
}

type CustomerVMConfig struct {
	Count        int                  `yaml:"count" json:"count"`
	DefaultVPCID uint32               `yaml:"default_vpc_id" json:"default_vpc_id"`
	RSUserPeers  []int                `yaml:"rs_user_peers,omitempty" json:"rs_user_peers,omitempty"`
	Overrides    []CustomerVMOverride `yaml:"overrides,omitempty" json:"overrides,omitempty"`
}

type CustomerVMOverride struct {
	ID        int      `yaml:"id" json:"id"`
	VPCID     *uint32  `yaml:"vpc_id,omitempty" json:"vpc_id,omitempty"`
	Host      *HostRef `yaml:"host,omitempty" json:"host,omitempty"`
	Addresses []string `yaml:"addresses,omitempty" json:"addresses,omitempty"`
}

type HostRef struct {
	BoltID int `yaml:"bolt_id" json:"bolt_id"`
	HostID int `yaml:"host_id" json:"host_id"`
}

type RouteServerConfig struct {
	Placements []RouteServerPlacement `yaml:"placements,omitempty" json:"placements,omitempty"`
}

type RouteServerPlacement struct {
	Role       string  `yaml:"role" json:"role"`
	ServedBolt int     `yaml:"served_bolt,omitempty" json:"served_bolt,omitempty"`
	Member     int     `yaml:"member" json:"member"`
	Host       HostRef `yaml:"host" json:"host"`
}

type RouteOriginConfig struct {
	ID       string `yaml:"id" json:"id"`
	VPCID    uint32 `yaml:"vpc_id" json:"vpc_id"`
	Prefix   string `yaml:"prefix" json:"prefix"`
	BorderID int    `yaml:"border_id" json:"border_id"`
}

type TrafficRequest struct {
	ID                string `yaml:"id" json:"id"`
	SourceVMID        int    `yaml:"source_vm_id" json:"source_vm_id"`
	DestinationVMID   *int   `yaml:"destination_vm_id,omitempty" json:"destination_vm_id,omitempty"`
	DestinationPrefix string `yaml:"destination_prefix,omitempty" json:"destination_prefix,omitempty"`
}

type FieldError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

type ValidationError struct {
	Errors []FieldError `json:"errors"`
}

func (e *ValidationError) Error() string {
	parts := make([]string, 0, len(e.Errors))
	for _, item := range e.Errors {
		parts = append(parts, item.Path+": "+item.Message)
	}
	return strings.Join(parts, "\n")
}

func ParseYAML(data []byte) (Config, error) {
	var config Config
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&config); err != nil {
		return Config{}, fmt.Errorf("dekodowanie YAML: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return Config{}, fmt.Errorf("dekodowanie YAML: dozwolony jest tylko jeden dokument")
		}
		return Config{}, fmt.Errorf("dekodowanie YAML: %w", err)
	}
	if err := config.Validate(); err != nil {
		return Config{}, err
	}
	return config, nil
}

func (c Config) Validate() error {
	var issues []FieldError
	add := func(path, message string) { issues = append(issues, FieldError{Path: path, Message: message}) }
	if c.SchemaVersion != SchemaVersion {
		add("schema_version", fmt.Sprintf("wartość %d nie jest obsługiwana; oczekiwano %d", c.SchemaVersion, SchemaVersion))
	}
	checkRange := func(path string, value, min, max int) {
		if value < min || value > max {
			add(path, fmt.Sprintf("wartość musi mieścić się w zakresie %d–%d", min, max))
		}
	}
	ipv6 := c.Addressing.IPv6
	if !ipv6.validate(add) {
		ipv6 = IPv6Config{} // Continue collecting diagnostics without parsing invalid pools.
	}
	t := c.Topology
	checkRange("topology.borders", t.Borders, 1, 4)
	checkRange("topology.stems", t.Stems, 1, 4)
	checkRange("topology.spines", t.Spines, 1, 8)
	checkRange("topology.bolts", t.Bolts, 1, 4)
	checkRange("topology.leaves_per_bolt", t.LeavesPerBolt, 1, 4)
	checkRange("topology.racks_per_bolt", t.RacksPerBolt, 1, 4)
	checkRange("topology.hosts_per_rack", t.HostsPerRack, 1, 4)
	checkRange("customer_vms.count", c.CustomerVMs.Count, 0, 64)
	maxHostsPerBolt := t.RacksPerBolt * t.HostsPerRack

	vpcs := make(map[uint32]VPCConfig, len(c.VPCs))
	vpcNames := make(map[string]bool, len(c.VPCs))
	for i, vpc := range c.VPCs {
		path := fmt.Sprintf("vpcs[%d]", i)
		if vpc.ID > 65535 {
			add(path+".id", "ID musi być liczbą 16-bitową; 0 oznacza default/public VRF")
		}
		if _, exists := vpcs[vpc.ID]; exists {
			add(path+".id", fmt.Sprintf("powtórzone ID VPC %d", vpc.ID))
		}
		vpcs[vpc.ID] = vpc
		name := strings.TrimSpace(vpc.Name)
		if name == "" {
			add(path+".name", "nazwa nie może być pusta")
		} else if vpcNames[name] {
			add(path+".name", "nazwa VPC musi być unikalna")
		}
		vpcNames[name] = true
	}
	if c.CustomerVMs.Count > 0 {
		if _, ok := vpcs[c.CustomerVMs.DefaultVPCID]; !ok {
			add("customer_vms.default_vpc_id", "wskazuje nieistniejące VPC")
		}
	}

	peerIDs := map[int]bool{}
	for i, id := range c.CustomerVMs.RSUserPeers {
		path := fmt.Sprintf("customer_vms.rs_user_peers[%d]", i)
		if id < 1 || id > c.CustomerVMs.Count {
			add(path, "ID klienta musi mieścić się w zakresie customer_vms.count")
		}
		if peerIDs[id] {
			add(path, fmt.Sprintf("klient %d jest wymieniony więcej niż raz", id))
		}
		peerIDs[id] = true
	}

	overrides := map[int]CustomerVMOverride{}
	overridePaths := map[int]string{}
	for i, override := range c.CustomerVMs.Overrides {
		path := fmt.Sprintf("customer_vms.overrides[%d]", i)
		if override.ID < 1 || override.ID > c.CustomerVMs.Count {
			add(path+".id", "ID musi mieścić się w zakresie customer_vms.count")
		}
		if _, exists := overrides[override.ID]; exists {
			add(path+".id", fmt.Sprintf("powtórzona konfiguracja klienta %d", override.ID))
		}
		overrides[override.ID] = override
		overridePaths[override.ID] = path
		if override.VPCID != nil {
			if _, ok := vpcs[*override.VPCID]; !ok {
				add(path+".vpc_id", "wskazuje nieistniejące VPC")
			}
		}
		if override.Host != nil {
			validateHostRef(path+".host", *override.Host, t.Bolts, maxHostsPerBolt, add)
		}
		seenAddresses := map[string]bool{}
		for j, raw := range override.Addresses {
			address, err := netip.ParseAddr(raw)
			addressPath := fmt.Sprintf("%s.addresses[%d]", path, j)
			if err != nil {
				add(addressPath, "niepoprawny adres IPv4/IPv6")
				continue
			}
			key := address.Unmap().String()
			if seenAddresses[key] {
				add(addressPath, "adres klienta musi być unikalny w jego VPC")
			}
			address = address.Unmap()
			if address.Is4() && !customerIPv4Pool.Contains(address) {
				add(addressPath, "adres IPv4 musi pochodzić z syntetycznej puli 10.64.0.0/10")
			}
			if address.Is6() && !ipv6.customerAddressAllowed(address) {
				add(addressPath, "adres IPv6 musi pochodzić z puli dokumentacyjnej lub addressing.ipv6.customer_prefix")
			}
			seenAddresses[key] = true
		}
	}
	effectiveAddressesByVPC := map[uint32]map[string]string{}
	for id := 1; id <= c.CustomerVMs.Count; id++ {
		override, hasOverride := overrides[id]
		vpcID := c.CustomerVMs.DefaultVPCID
		if hasOverride && override.VPCID != nil {
			vpcID = *override.VPCID
		}
		addresses := []string{
			ipv4FromPool("10.64.0.0/10", uint64(id)).String(),
			ipv6.identity(6, 0, uint32(id)).String(),
		}
		paths := []string{fmt.Sprintf("customer_vms[%d].addresses[0]", id), fmt.Sprintf("customer_vms[%d].addresses[1]", id)}
		familyReplaced := map[bool]bool{}
		if hasOverride {
			basePath := overridePaths[id]
			for index, raw := range override.Addresses {
				address, err := netip.ParseAddr(raw)
				if err != nil {
					continue
				}
				is6 := address.Is6()
				targetIndex := 0
				if is6 {
					targetIndex = 1
				}
				path := fmt.Sprintf("%s.addresses[%d]", basePath, index)
				if !familyReplaced[is6] {
					addresses[targetIndex], paths[targetIndex] = address.Unmap().String(), path
					familyReplaced[is6] = true
				} else {
					addresses = append(addresses, address.Unmap().String())
					paths = append(paths, path)
				}
			}
		}
		if effectiveAddressesByVPC[vpcID] == nil {
			effectiveAddressesByVPC[vpcID] = map[string]string{}
		}
		for index, raw := range addresses {
			address, err := netip.ParseAddr(raw)
			if err != nil {
				continue
			}
			key := address.Unmap().String()
			if previousPath := effectiveAddressesByVPC[vpcID][key]; previousPath != "" {
				add(paths[index], "adres klienta musi być unikalny w jego VPC (duplikat z "+previousPath+")")
			}
			effectiveAddressesByVPC[vpcID][key] = paths[index]
		}
	}

	placementKeys := map[string]bool{}
	controllerBolts := map[int]bool{}
	controllerMembers := map[int]bool{}
	for i, placement := range c.RouteServers.Placements {
		path := fmt.Sprintf("route_servers.placements[%d]", i)
		role := strings.ToLower(strings.TrimSpace(placement.Role))
		if role != "bolt" && role != "controller" && role != "user" {
			add(path+".role", "dozwolone role to bolt, controller lub user")
		}
		checkRange(path+".member", placement.Member, 1, 4)
		if role == "bolt" {
			checkRange(path+".served_bolt", placement.ServedBolt, 1, t.Bolts)
			if placement.Host.BoltID != placement.ServedBolt {
				add(path+".host.bolt_id", "RS Bolt musi mieszkać w obsługiwanym bolcie")
			}
		} else if role == "controller" || role == "user" {
			if placement.ServedBolt != 0 {
				add(path+".served_bolt", "pole dotyczy wyłącznie serwera RS Bolt")
			}
		}
		if role == "controller" {
			controllerBolts[placement.Host.BoltID] = true
			controllerMembers[placement.Member] = true
		}
		key := fmt.Sprintf("%s/%d/%d", role, placement.ServedBolt, placement.Member)
		if placementKeys[key] {
			add(path, "powtórzone rozmieszczenie członka klastra")
		}
		placementKeys[key] = true
		validateHostRef(path+".host", placement.Host, t.Bolts, maxHostsPerBolt, add)
	}

	if t.Bolts-len(controllerBolts) > 4-len(controllerMembers) {
		add("route_servers.placements", "jawne rozmieszczenie RS Ctrl musi pozostawić członka dla każdego bolta")
	}

	checkRange("route_origins.count", len(c.RouteOrigins), 0, 256)
	routeIDs := map[string]bool{}
	routeKeys := map[string]bool{}
	for i, route := range c.RouteOrigins {
		path := fmt.Sprintf("route_origins[%d]", i)
		if strings.TrimSpace(route.ID) == "" {
			add(path+".id", "ID trasy nie może być pusty")
		}
		if routeIDs[route.ID] {
			add(path+".id", "ID trasy musi być unikalne")
		}
		routeIDs[route.ID] = true
		if _, ok := vpcs[route.VPCID]; !ok {
			add(path+".vpc_id", "wskazuje nieistniejące VPC")
		}
		if prefix, err := netip.ParsePrefix(route.Prefix); err != nil {
			add(path+".prefix", "niepoprawny prefiks IP")
		} else if !c.syntheticPrefix(prefix) {
			add(path+".prefix", "użyj adresu z puli syntetycznej, dokumentacyjnej lub zadeklarowanej puli IPv6")
		} else {
			key := fmt.Sprintf("%d/%s/%d", route.VPCID, prefix.Masked(), route.BorderID)
			if routeKeys[key] {
				add(path, "powtórzone źródło tego prefiksu z tego samego border i VPC")
			}
			routeKeys[key] = true
		}
		checkRange(path+".border_id", route.BorderID, 1, t.Borders)
	}

	checkRange("traffic.count", len(c.Traffic), 0, 256)
	trafficIDs := map[string]bool{}
	for i, flow := range c.Traffic {
		path := fmt.Sprintf("traffic[%d]", i)
		if strings.TrimSpace(flow.ID) == "" {
			add(path+".id", "ID ruchu nie może być pusty")
		}
		if trafficIDs[flow.ID] {
			add(path+".id", "ID ruchu musi być unikalne")
		}
		trafficIDs[flow.ID] = true
		checkRange(path+".source_vm_id", flow.SourceVMID, 1, c.CustomerVMs.Count)
		hasVM := flow.DestinationVMID != nil
		hasPrefix := strings.TrimSpace(flow.DestinationPrefix) != ""
		if hasVM == hasPrefix {
			add(path, "podaj dokładnie jedno pole destination_vm_id albo destination_prefix")
		}
		if hasVM {
			checkRange(path+".destination_vm_id", *flow.DestinationVMID, 1, c.CustomerVMs.Count)
		}
		if hasPrefix {
			if prefix, err := netip.ParsePrefix(flow.DestinationPrefix); err != nil {
				add(path+".destination_prefix", "niepoprawny prefiks IP")
			} else if !c.syntheticPrefix(prefix) {
				add(path+".destination_prefix", "użyj adresu z puli syntetycznej, dokumentacyjnej lub zadeklarowanej puli IPv6")
			}
		}
	}

	if len(issues) > 0 {
		sort.SliceStable(issues, func(i, j int) bool {
			if issues[i].Path == issues[j].Path {
				return issues[i].Message < issues[j].Message
			}
			return issues[i].Path < issues[j].Path
		})
		return &ValidationError{Errors: issues}
	}
	return nil
}

func validateHostRef(path string, host HostRef, boltCount, hostsPerBolt int, add func(string, string)) {
	if host.BoltID < 1 || host.BoltID > boltCount {
		add(path+".bolt_id", "bolt nie istnieje")
	}
	if host.HostID < 1 || host.HostID > hostsPerBolt {
		add(path+".host_id", "host nie istnieje w wybranym bolt")
	}
}

func (c Config) syntheticPrefix(prefix netip.Prefix) bool {
	address := prefix.Addr().Unmap()
	if address.Is4() {
		for _, pool := range routeIPv4Pools {
			if pool.Contains(address) && prefix.Bits() >= pool.Bits() {
				return true
			}
		}
		return false
	}
	if documentationV6.Contains(address) && prefix.Bits() >= documentationV6.Bits() {
		return true
	}
	for _, pool := range c.Addressing.IPv6.pools() {
		parsed, err := netip.ParsePrefix(pool.prefix)
		if err == nil && parsed.Contains(address) && prefix.Bits() >= parsed.Bits() {
			return true
		}
	}
	return false
}
