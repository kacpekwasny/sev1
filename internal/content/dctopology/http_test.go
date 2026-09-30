package dctopology

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
)

func TestSummaryDefaultCounts(t *testing.T) {
	data, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	config, err := ParseYAML(data)
	if err != nil {
		t.Fatal(err)
	}
	summary := Summarize(config)
	if summary.PhysicalDevices != 28 || summary.Hosts != 8 || summary.PhysicalLinks != 60 || summary.BGPSessions != 160 {
		t.Fatalf("unexpected default summary: %+v", summary)
	}
	maximum := config
	maximum.Topology = TopologyConfig{Borders: 4, Stems: 4, Spines: 8, Bolts: 4, LeavesPerBolt: 4, RacksPerBolt: 4, HostsPerRack: 4}
	maximum.CustomerVMs.Count = 64
	maximum.CustomerVMs.RSUserPeers = make([]int, 64)
	for i := range maximum.CustomerVMs.RSUserPeers {
		maximum.CustomerVMs.RSUserPeers[i] = i + 1
	}
	maxSummary := Summarize(maximum)
	if maxSummary.PhysicalDevices != 128 || maxSummary.PhysicalLinks != 432 || maxSummary.BGPSessions != 1040 || maxSummary.RouteServerVMs != 24 {
		t.Fatalf("unexpected maximum summary: %+v", maxSummary)
	}
}

func TestInvalidConfigDoesNotReplaceActiveConfig(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewAPIHandler(initial)
	if err != nil {
		t.Fatal(err)
	}
	invalid := strings.Replace(string(initial), "spines: 4", "spines: 99", 1)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/config", strings.NewReader(invalid))
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid POST status=%d body=%s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("status GET=%d body=%s", response.Code, response.Body.String())
	}
	var result struct {
		Summary ConfigSummary `json:"summary"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Summary.Topology.Spines != 4 {
		t.Fatalf("invalid config replaced active state: spines=%d", result.Summary.Topology.Spines)
	}
}

func TestValidConfigReplacesAndExportsActiveConfig(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewAPIHandler(initial)
	if err != nil {
		t.Fatal(err)
	}
	updated := strings.Replace(string(initial), "spines: 4", "spines: 5", 1)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/config", strings.NewReader(updated)))
	if response.Code != http.StatusOK {
		t.Fatalf("valid POST status=%d body=%s", response.Code, response.Body.String())
	}

	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/config.yaml", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "spines: 5") {
		t.Fatalf("export did not use active config: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestModelEndpointReturnsCurrentPhysicalGraph(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewAPIHandler(initial)
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/model", nil))
	if response.Code != http.StatusOK {
		t.Fatalf("model GET=%d body=%s", response.Code, response.Body.String())
	}
	var model Model
	if err := json.Unmarshal(response.Body.Bytes(), &model); err != nil {
		t.Fatal(err)
	}
	if len(model.Nodes) != 28 || len(model.Links) != 60 || len(model.VMs) != 19 || len(model.Sessions) != 160 {
		t.Fatalf("unexpected model response: nodes=%d links=%d vms=%d sessions=%d", len(model.Nodes), len(model.Links), len(model.VMs), len(model.Sessions))
	}
	if len(model.Routes.Tables) != 0 || len(model.Routes.Advertisements) != 0 || len(model.Routes.Forwarding) != 0 {
		t.Fatalf("base model should defer detailed route data: tables=%d advertisements=%d forwarding=%d", len(model.Routes.Tables), len(model.Routes.Advertisements), len(model.Routes.Forwarding))
	}
	if len(model.Routes.AdvertisementCounts) != len(model.Sessions) {
		t.Fatalf("base model lacks compact per-session route counts: got %d sessions, want %d", len(model.Routes.AdvertisementCounts), len(model.Sessions))
	}
}

func TestInspectorEndpointReturnsOnlyRequestedRouteDetails(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewAPIHandler(initial)
	if err != nil {
		t.Fatal(err)
	}
	get := func(kind, id string) *httptest.ResponseRecorder {
		query := url.Values{"kind": {kind}, "id": {id}}
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/inspector?"+query.Encode(), nil))
		return response
	}
	var speaker inspectorResponse
	response := get("speaker", "host-b1-h1")
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &speaker) != nil || speaker.SpeakerTable == nil || len(speaker.Forwarding) == 0 {
		t.Fatalf("speaker detail response missing BGP/forwarding data: status=%d body=%s", response.Code, response.Body.String())
	}
	var session inspectorResponse
	response = get("session", "bgp/host-rs-bolt/host-b1-h1--rs-bolt-b1-m1")
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &session) != nil || len(session.Advertisements) == 0 {
		t.Fatalf("session detail response missing advertisements: status=%d body=%s", response.Code, response.Body.String())
	}
	var route inspectorResponse
	response = get("route", "vm/customer-3/ipv4/10.64.0.3")
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &route) != nil || route.Route == nil || len(route.Advertisements) == 0 {
		t.Fatalf("route detail response missing origin/propagation: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestCountUpdateRebuildsAtomicallyAndExportsEffectiveConfig(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewAPIHandler(initial)
	if err != nil {
		t.Fatal(err)
	}
	update, err := json.Marshal(countUpdate{Spines: 5, Bolts: 2, RacksPerBolt: 2, HostsPerRack: 2, CustomerVMs: 3, ConfigYAML: string(initial)})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/counts", strings.NewReader(string(update))))
	if response.Code != http.StatusOK {
		t.Fatalf("valid count update status=%d body=%s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/model", nil))
	var model Model
	if err := json.Unmarshal(response.Body.Bytes(), &model); err != nil {
		t.Fatal(err)
	}
	if model.Config.Topology.Spines != 5 || len(model.Nodes) != 29 || len(model.Links) != 66 || len(model.Sessions) != 166 {
		t.Fatalf("accepted count update did not rebuild the complete model: nodes=%d links=%d sessions=%d", len(model.Nodes), len(model.Links), len(model.Sessions))
	}

	invalid := `{"spines":99,"bolts":2,"racks_per_bolt":2,"hosts_per_rack":2,"customer_vms":3}`
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/counts", strings.NewReader(invalid)))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid count update status=%d body=%s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	var status struct {
		Summary ConfigSummary `json:"summary"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &status); err != nil {
		t.Fatal(err)
	}
	if status.Summary.Topology.Spines != 5 {
		t.Fatalf("rejected count update changed active topology to %d spines", status.Summary.Topology.Spines)
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/config.yaml", nil))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "spines: 5") {
		t.Fatalf("effective count change missing from YAML export: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestCountUpdateToZeroRemovesOnlyReferencesToDeletedCustomerVMs(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewAPIHandler(initial)
	if err != nil {
		t.Fatal(err)
	}
	update, err := json.Marshal(countUpdate{
		Spines: 4, Bolts: 2, RacksPerBolt: 2, HostsPerRack: 2, CustomerVMs: 0,
		ConfigYAML: string(initial),
	})
	if err != nil {
		t.Fatal(err)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/counts", strings.NewReader(string(update))))
	if response.Code != http.StatusOK {
		t.Fatalf("zero-customer count update status=%d body=%s", response.Code, response.Body.String())
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/model", nil))
	var model Model
	if err := json.Unmarshal(response.Body.Bytes(), &model); err != nil {
		t.Fatal(err)
	}
	if model.Config.CustomerVMs.Count != 0 || len(model.VMs) != 16 || len(model.Routes.Traffic) != 0 {
		t.Fatalf("zero-customer rebuild retained customer model state: configured=%d VMs=%d traffic=%d", model.Config.CustomerVMs.Count, len(model.VMs), len(model.Routes.Traffic))
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/config.yaml", nil))
	exported, err := ParseYAML(response.Body.Bytes())
	if err != nil {
		t.Fatalf("exported zero-customer YAML is invalid: %v", err)
	}
	if len(exported.CustomerVMs.Overrides) != 0 || len(exported.CustomerVMs.RSUserPeers) != 0 || len(exported.Traffic) != 0 {
		t.Fatalf("export retained references to removed customer VMs: %+v", exported.CustomerVMs)
	}
}
