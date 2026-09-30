package dctopology

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"reflect"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func configuredIPv6() IPv6Config {
	return IPv6Config{
		FabricPrefix: "fd42:1:10::/48", HostPrefix: "fd42:2:20::/48",
		RSBoltPrefix: "fd42:3:30::/48", RSCtrlPrefix: "fd42:4:40::/48",
		RSUserPrefix: "fd42:5:50::/48", CustomerPrefix: "fd42:6:60::/48",
		Suffix: uint32ptr(0x01020304),
	}
}

func TestIPv6SchemePreservesLegacyDefaults(t *testing.T) {
	legacy := exampleConfig(t)
	legacy.Addressing = AddressingConfig{}
	a, err := BuildTopology(legacy)
	if err != nil {
		t.Fatal(err)
	}
	b, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(a.Nodes, b.Nodes) || !reflect.DeepEqual(a.VMs, b.VMs) || !reflect.DeepEqual(a.Sessions, b.Sessions) || !reflect.DeepEqual(a.Routes, b.Routes) {
		t.Fatal("explicit defaults changed the legacy topology or route snapshot")
	}
	if got := (IPv6Config{}).identity(2, 13, 45).String(); got != "2001:db8:2:d:0:2d:0:1" {
		t.Fatalf("legacy address changed: %s", got)
	}
	zero := IPv6Config{Suffix: uint32ptr(0)}
	if got := zero.identity(6, 0, 65536).String(); got != "2001:db8:6:0:1::" {
		t.Fatalf("zero suffix or 32-bit entity ignored: %s", got)
	}
}

func TestConfiguredIPv6ReachesSessionsRoutesAndPackets(t *testing.T) {
	config := exampleConfig(t)
	config.Addressing.IPv6 = configuredIPv6()
	model, err := BuildTopology(config)
	if err != nil {
		t.Fatal(err)
	}
	identities := map[string]string{}
	addresses := map[string]string{}
	check := func(id, raw, prefix string) {
		t.Helper()
		address := netip.MustParseAddr(raw)
		if !netip.MustParsePrefix(prefix).Contains(address) || !strings.HasSuffix(raw, ":102:304") {
			t.Fatalf("%s ignored its role prefix or suffix: %s", id, raw)
		}
		if previous, ok := identities[raw]; ok {
			t.Fatalf("%s and %s share an identity", id, previous)
		}
		identities[raw], addresses[id] = id, raw
	}
	for _, node := range model.Nodes {
		prefix := config.Addressing.IPv6.FabricPrefix
		if node.Kind == NodeHost {
			prefix = config.Addressing.IPv6.HostPrefix
		}
		check(node.ID, node.IPv6, prefix)
	}
	for _, vm := range model.VMs {
		prefix := map[VMRole]string{
			VMBoltRS: config.Addressing.IPv6.RSBoltPrefix, VMCtrlRS: config.Addressing.IPv6.RSCtrlPrefix,
			VMUserRS: config.Addressing.IPv6.RSUserPrefix, VMCustomer: config.Addressing.IPv6.CustomerPrefix,
		}[vm.Role]
		check(vm.ID, vm.IPv6, prefix)
	}
	if addresses["host-b1-h1"] != "fd42:2:20:1:0:1:102:304" {
		t.Fatal("scheme lost bolt scope or host identity")
	}
	for _, session := range model.Sessions {
		for _, endpoint := range []SessionEndpoint{session.A, session.B} {
			if endpoint.InterfaceID != "" {
				if !netip.MustParseAddr(endpoint.Address).IsLinkLocalUnicast() {
					t.Fatal("global scheme changed a physical link")
				}
			} else if endpoint.Address != addresses[endpoint.EntityID] {
				t.Fatalf("BGP transport ignored scheme: %+v", endpoint)
			}
		}
	}
	for _, route := range model.Routes.Origins {
		if route.IPFamily == "ipv6" && route.OriginKind != "border-default" {
			if _, ok := identities[netip.MustParsePrefix(route.Prefix).Addr().String()]; !ok {
				t.Fatalf("route origin retained old IPv6: %+v", route)
			}
		}
		if route.RouteType == 5 && !netip.MustParseAddr(route.NextHop).Is4() {
			t.Fatal("IPv6 configuration changed the IPv4 VTEP")
		}
	}
	packet := InspectPacket(model, "customer-1", "customer-3", "ipv6")
	if !packet.Reachable || !packet.VXLAN || packet.Source != addresses["customer-1"] || packet.Destination != addresses["customer-3"] || !netip.MustParseAddr(packet.OuterDestination).Is4() {
		t.Fatalf("custom IPv6 lost EVPN/VXLAN forwarding: %+v", packet)
	}
}

func TestIPv6SchemeValidationAndOverrides(t *testing.T) {
	for _, prefix := range []string{"invalid", "10.0.0.0/48", "::/48", "ff00::/48", "fe80::/48", "2001:db8:8::/64", "2001:db8:8::1/48", "2001:db8:2::/48"} {
		t.Run(prefix, func(t *testing.T) {
			config := validConfig()
			config.Addressing.IPv6.FabricPrefix = prefix
			if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "addressing.ipv6.") {
				t.Fatalf("invalid/overlapping pool accepted: %v", err)
			}
		})
	}
	config := validConfig()
	config.Addressing.IPv6 = configuredIPv6()
	config.CustomerVMs.Overrides = []CustomerVMOverride{{ID: 1, Addresses: []string{"fd42:6:60::99"}}}
	config.RouteOrigins = []RouteOriginConfig{{ID: "ula-egress", VPCID: 1, Prefix: "fd42:6:60:ffff::/64", BorderID: 1}}
	config.Traffic = []TrafficRequest{{ID: "ula-target", SourceVMID: 1, DestinationPrefix: "fd42:6:60:ffff::123/128"}}
	if _, err := BuildTopology(config); err != nil {
		t.Fatal(err)
	}
	config.CustomerVMs.Overrides[0].Addresses = []string{"fd42:6:60::2:102:304"}
	if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "unikalny w jego VPC") {
		t.Fatalf("collision with configured generated identity accepted: %v", err)
	}
	config.CustomerVMs.Overrides[0].Addresses = []string{"fd42:9::99"}
	if err := config.Validate(); err == nil || !strings.Contains(err.Error(), "addresses[0]") {
		t.Fatal("undeclared customer address pool accepted")
	}
}

func TestIPv6SchemeYAMLRebuildAndAtomicRejection(t *testing.T) {
	config := exampleConfig(t)
	config.Addressing.IPv6 = configuredIPv6()
	initial, err := yaml.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewAPIHandler(initial)
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body string) *httptest.ResponseRecorder {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(method, "/api/"+path, strings.NewReader(body)))
		return response
	}
	update, _ := json.Marshal(countUpdate{Spines: 5, Bolts: 2, RacksPerBolt: 2, HostsPerRack: 2, CustomerVMs: 3})
	if response := request(http.MethodPost, "counts", string(update)); response.Code != http.StatusOK {
		t.Fatal(response.Body.String())
	}
	exported := request(http.MethodGet, "config.yaml", "").Body.Bytes()
	reloaded, err := ParseYAML(exported)
	if err != nil || !reflect.DeepEqual(reloaded.Addressing, config.Addressing) || reloaded.Topology.Spines != 5 {
		t.Fatalf("export/reload lost scheme: %+v %v", reloaded, err)
	}
	before := request(http.MethodGet, "model", "").Body.String()
	invalid := strings.Replace(string(exported), "fd42:1:10::/48", "fd42:2:20::/48", 1)
	response := request(http.MethodPost, "config", invalid)
	if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "addressing.ipv6.host_prefix") {
		t.Fatalf("invalid scheme not diagnosed: %s", response.Body.String())
	}
	if before != request(http.MethodGet, "model", "").Body.String() {
		t.Fatal("invalid scheme replaced valid model")
	}
	if response := request(http.MethodPost, "config", string(exported)); response.Code != http.StatusOK {
		t.Fatal("could not reload exported scheme")
	}
	if before != request(http.MethodGet, "model", "").Body.String() {
		t.Fatal("scheme roundtrip changed routes or topology")
	}
}
