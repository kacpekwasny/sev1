package dctopology

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestUpdateInspectionUsesDirectedExports(t *testing.T) {
	model, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	flow := InspectUpdateFlow(model, "host-b1-h1", "host-b2-h1", "vm/customer-1/ipv4/10.64.0.1")
	if !flow.Reachable || len(flow.Steps) != 4 || flow.Route.RouteType != 5 {
		t.Fatalf("unexpected flow: %+v", flow)
	}
	expected := []string{"host-b1-h1", "rs-bolt-b1-m1", "rs-ctrl-m1", "rs-bolt-b2-m1", "host-b2-h1"}
	hops := []string{flow.FromID}
	for index, step := range flow.Steps {
		hops = append(hops, step.ToID)
		if step.NextHopNodeID != "host-b1-h1" || step.VNI != 10001 || len(step.ASPath) != index+1 {
			t.Fatal("RS lost next hop or did not prepend its ASN")
		}
	}
	entityASN := map[string]uint32{}
	for _, node := range model.Nodes {
		entityASN[node.ID] = node.ASN
	}
	for _, vm := range model.VMs {
		entityASN[vm.ID] = vm.ASN
	}
	for index, step := range flow.Steps {
		for pathIndex, asn := range step.ASPath {
			if asn != entityASN[expected[index-pathIndex]] {
				t.Fatalf("wrong ASN order in UPDATE %d: %v", index, step.ASPath)
			}
		}
	}
	for _, table := range model.Routes.Tables {
		for _, route := range table.Selected {
			want := make([]uint32, 0, len(route.Path)-1)
			for i := len(route.Path) - 2; i >= 0; i-- {
				want = append(want, entityASN[route.Path[i]])
			}
			if !reflect.DeepEqual(route.ASPath, want) {
				t.Fatalf("RIB path does not match its BGP hops: %+v", route)
			}
		}
	}
	if !reflect.DeepEqual(hops, expected) {
		t.Fatalf("unexpected hierarchy: %v", hops)
	}
	reverse := InspectUpdateFlow(model, "host-b2-h1", "host-b1-h1", flow.Route.ID)
	if reverse.Reachable {
		t.Fatal("fabricated an export of a remotely learned route from host")
	}
	auto := InspectUpdateFlow(model, "border-1", "host-b1-h1", "")
	if auto.Reachable {
		t.Fatal("border must not advertise any BGP routes")
	}
	for _, ad := range model.Routes.Advertisements {
		for _, node := range model.Nodes {
			if node.Kind == NodeHost && ad.FromID == node.ID && ad.VPCID == 0 && ad.OriginID != node.ID {
				t.Fatalf("host relayed a remote underlay prefix: %+v", ad)
			}
		}
	}
}

func TestPacketInspectionEncapsulationAndTAPs(t *testing.T) {
	model, err := BuildTopology(exampleConfig(t))
	if err != nil {
		t.Fatal(err)
	}
	for _, family := range []string{"ipv4", "ipv6"} {
		p := InspectPacket(model, "customer-1", "customer-3", family)
		if !p.Reachable || !p.VXLAN || p.VNI != 10001 || p.UDPDestinationPort != 4789 || p.OuterSource == p.OuterDestination || strings.Contains(p.OuterSource, ":") || strings.Contains(p.OuterDestination, ":") {
			t.Fatalf("invalid VXLAN packet: %+v", p)
		}
		if p.Hops[0].Egress != "eth0" || p.Hops[1].Ingress != "tap-c1" || p.Hops[len(p.Hops)-2].Egress != "tap-c3" || p.Hops[len(p.Hops)-1].Ingress != "eth0" {
			t.Fatal("packet omitted VM attachment")
		}
	}
	local := InspectPacket(model, "customer-1", "customer-2", "ipv4")
	if !local.Reachable || local.VXLAN || len(local.PhysicalLinkIDs) != 0 || len(local.DisplayHopIDs) != 3 {
		t.Fatal("local packet left its host")
	}
	border := InspectPacket(model, "customer-1", "border-1", "ipv4")
	if !border.Reachable || border.Destination != "198.51.100.1" {
		t.Fatalf("border prefix was not resolved: %+v", border)
	}
	fabric := InspectPacket(model, "tor-b1-r1-1", "tor-b1-r1-2", "ipv4")
	if !fabric.Reachable || len(fabric.PhysicalNodeIDs) != 3 || fabric.PhysicalNodeIDs[1][:4] != "leaf" {
		t.Fatalf("host used as fabric transit: %+v", fabric)
	}
	c := exampleConfig(t)
	c.VPCs = append(c.VPCs, VPCConfig{ID: 2, Name: "druga"})
	c.CustomerVMs.Overrides[2].VPCID = uint32ptr(2)
	isolated, err := BuildTopology(c)
	if err != nil {
		t.Fatal(err)
	}
	blocked := InspectPacket(isolated, "customer-1", "customer-3", "ipv4")
	if blocked.Reachable || blocked.Reason != "cross-vpc-not-permitted" {
		t.Fatal("packet crossed VPC boundary")
	}
}

func TestExplorationAPIIsReadOnlyAndValidatesEndpoints(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewAPIHandler(initial)
	if err != nil {
		t.Fatal(err)
	}
	request := func(query string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/"+query, nil))
		return w
	}
	before := request("config.yaml").Body.String()
	for _, kind := range []string{"packet", "update"} {
		response := request("explore?kind=" + kind + "&from=host-b1-h1&to=host-b2-h1")
		var result explorationResponse
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &result) != nil || !result.OK {
			t.Fatalf("explore: %d %s", response.Code, response.Body.String())
		}
	}
	for _, query := range []string{"kind=packet&from=missing&to=border-1", "kind=packet&from=border-1&to=border-1", "kind=bad&from=border-1&to=border-2", "kind=packet&from=border-1&to=border-2&family=bad", "kind=update&from=border-1&to=border-2&route=" + url.QueryEscape("missing")} {
		if request("explore?"+query).Code != 400 {
			t.Fatal("accepted invalid exploration")
		}
	}
	if request("config.yaml").Body.String() != before {
		t.Fatal("inspection mutated configuration")
	}
}

func TestBorderReachabilityDoesNotRequireBorderAdvertisements(t *testing.T) {
	c := exampleConfig(t)
	c.RouteOrigins = nil
	model, err := BuildTopology(c)
	if err != nil {
		t.Fatal(err)
	}
	for _, from := range []string{"customer-1", "host-b1-h1", "rs-user-m1", "stem-1"} {
		for _, to := range []string{"border-1", "border-2"} {
			for _, family := range []string{"ipv4", "ipv6"} {
				p := InspectPacket(model, from, to, family)
				if !p.Reachable || p.PhysicalNodeIDs[len(p.PhysicalNodeIDs)-1] != to {
					t.Fatalf("%s to %s (%s): %+v", from, to, family, p)
				}
			}
		}
	}
	for _, ad := range model.Routes.Advertisements {
		if strings.HasPrefix(ad.FromID, "border-") {
			t.Fatalf("border exported: %+v", ad)
		}
	}
}
