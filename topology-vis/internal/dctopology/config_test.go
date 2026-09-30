package dctopology

import (
	"errors"
	"os"
	"strings"
	"testing"
)

func TestParseDefaultExample(t *testing.T) {
	data, err := os.ReadFile("../../examples/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	config, err := ParseYAML(data)
	if err != nil {
		t.Fatal(err)
	}
	if config.Topology.Borders != 2 || config.Topology.Bolts != 2 || config.CustomerVMs.Count != 3 {
		t.Fatalf("unexpected defaults in parsed config: %+v", config)
	}
	if len(config.Traffic) != 3 || len(config.RouteOrigins) != 1 {
		t.Fatalf("fixture scenarios not parsed: traffic=%d routes=%d", len(config.Traffic), len(config.RouteOrigins))
	}
}

func TestParseYAMLRejectsUnknownFieldAndMultipleDocuments(t *testing.T) {
	unknown := []byte("schema_version: 1\ntopology:\n  borders: 2\n  typo: 3\n")
	if _, err := ParseYAML(unknown); err == nil || !strings.Contains(err.Error(), "typo") {
		t.Fatalf("expected unknown field error, got %v", err)
	}
	multiple := []byte("schema_version: 1\n---\nschema_version: 1\n")
	if _, err := ParseYAML(multiple); err == nil || !strings.Contains(err.Error(), "jeden dokument") {
		t.Fatalf("expected multiple document error, got %v", err)
	}
}

func TestValidationReportsActionableFieldPaths(t *testing.T) {
	config := validConfig()
	config.Topology.Spines = 9
	config.CustomerVMs.RSUserPeers = []int{1, 1, 4}
	config.CustomerVMs.Overrides = []CustomerVMOverride{{
		ID:        1,
		VPCID:     uint32ptr(2),
		Host:      &HostRef{BoltID: 9, HostID: 99},
		Addresses: []string{"not-an-ip"},
	}}
	config.RouteOrigins = []RouteOriginConfig{{ID: "bad", VPCID: 42, Prefix: "garbage", BorderID: 3}}
	config.Traffic = []TrafficRequest{{ID: "bad-flow", SourceVMID: 8}}

	err := config.Validate()
	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("expected ValidationError, got %T %v", err, err)
	}
	for _, path := range []string{
		"topology.spines", "customer_vms.rs_user_peers[1]", "customer_vms.rs_user_peers[2]",
		"customer_vms.overrides[0].vpc_id", "customer_vms.overrides[0].host.bolt_id",
		"customer_vms.overrides[0].addresses[0]", "route_origins[0].prefix",
		"route_origins[0].vpc_id", "route_origins[0].border_id", "traffic[0].source_vm_id",
		"traffic[0]",
	} {
		if !strings.Contains(err.Error(), path) {
			t.Errorf("error did not identify %q: %v", path, err)
		}
	}
}

func TestValidationAllowsSameAddressInDifferentVPCs(t *testing.T) {
	config := validConfig()
	config.CustomerVMs.Count = 2
	config.VPCs = append(config.VPCs, VPCConfig{ID: 2, Name: "druga"})
	config.CustomerVMs.Overrides = []CustomerVMOverride{
		{ID: 1, Addresses: []string{"10.64.0.20", "2001:db8:6:1::20"}},
		{ID: 2, VPCID: uint32ptr(2), Addresses: []string{"10.64.0.20", "2001:db8:6:1::20"}},
	}
	if err := config.Validate(); err != nil {
		t.Fatalf("same addresses in isolated VPCs should be valid: %v", err)
	}
}

func TestValidationRejectsDuplicateAddressInsideOneVPC(t *testing.T) {
	config := validConfig()
	config.CustomerVMs.Count = 2
	config.CustomerVMs.Overrides = []CustomerVMOverride{
		{ID: 1, Addresses: []string{"10.64.0.20"}},
		{ID: 2, Addresses: []string{"10.64.0.20"}},
	}
	err := config.Validate()
	if err == nil || !strings.Contains(err.Error(), "unikalny w jego VPC") {
		t.Fatalf("expected duplicate VPC address error, got %v", err)
	}
}

func TestValidationRejectsCollisionWithGeneratedAddress(t *testing.T) {
	config := validConfig()
	config.CustomerVMs.Count = 2
	config.CustomerVMs.Overrides = []CustomerVMOverride{{ID: 1, Addresses: []string{"10.64.0.2"}}}
	err := config.Validate()
	if err == nil || !strings.Contains(err.Error(), "adres klienta musi być unikalny w jego VPC") {
		t.Fatalf("expected explicit/generated address collision error, got %v", err)
	}
}

func TestValidationRejectsDuplicateRouteServerPlacement(t *testing.T) {
	config := validConfig()
	placement := RouteServerPlacement{Role: "bolt", ServedBolt: 1, Member: 1, Host: HostRef{BoltID: 1, HostID: 1}}
	config.RouteServers.Placements = []RouteServerPlacement{placement, placement}
	err := config.Validate()
	if err == nil || !strings.Contains(err.Error(), "powtórzone rozmieszczenie") {
		t.Fatalf("expected duplicate placement error, got %v", err)
	}
}

func TestValidationRejectsDuplicateRouteOriginIdentity(t *testing.T) {
	config := validConfig()
	origin := RouteOriginConfig{ID: "origin-a", VPCID: 1, Prefix: "198.51.100.0/24", BorderID: 1}
	config.RouteOrigins = []RouteOriginConfig{origin, {ID: "origin-b", VPCID: 1, Prefix: "198.51.100.0/24", BorderID: 1}}
	err := config.Validate()
	if err == nil || !strings.Contains(err.Error(), "powtórzone źródło tego prefiksu") {
		t.Fatalf("expected duplicate route identity error, got %v", err)
	}
}

func validConfig() Config {
	return Config{
		SchemaVersion: SchemaVersion,
		Topology: TopologyConfig{
			Borders: 2, Stems: 2, Spines: 4, Bolts: 2,
			LeavesPerBolt: 2, RacksPerBolt: 2, HostsPerRack: 2,
		},
		VPCs:        []VPCConfig{{ID: 1, Name: "wspolna"}},
		CustomerVMs: CustomerVMConfig{Count: 3, DefaultVPCID: 1},
	}
}

func uint32ptr(value uint32) *uint32 { return &value }
