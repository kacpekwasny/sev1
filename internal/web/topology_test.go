package web

import (
	"net/http"
	"strings"
	"testing"
)

// Każdy widok rysuje tę samą sieć inaczej, ale żaden nie może zgubić
// urządzeń - pudełka są w każdym z nich.
func TestEveryViewDrawsEveryDevice(t *testing.T) {
	topo := newTestServer(t).lib().TopologyBySlug["spine-leaf"]
	if topo == nil {
		t.Fatal("brak topologii spine-leaf")
	}
	for _, view := range topologyViews {
		got := topologyView(topo, view.ID)
		if len(got.Nodes) != len(topo.DeviceByName) {
			t.Errorf("%s: %d pudełek, a urządzeń %d", view.ID, len(got.Nodes), len(topo.DeviceByName))
		}
		for _, node := range got.Nodes {
			if node.CX <= 0 || node.CX >= got.Width || node.Y+node.H > got.Height {
				t.Errorf("%s: %s wypadł poza rysunek (%d,%d)", view.ID, node.Name, node.CX, node.Y)
			}
		}
	}
}

// Rysunku nie da się obejrzeć w teście, więc pilnujemy tego, co da się
// policzyć: pudełka w jednym rzędzie nie mogą na siebie wchodzić.
func TestBoxesInARowDoNotOverlap(t *testing.T) {
	topo := newTestServer(t).lib().TopologyBySlug["spine-leaf"]
	view := topologyView(topo, ViewCabling)

	rightEdge := map[string]int{} // warstwa -> gdzie skończyło się poprzednie pudełko
	for _, node := range view.Nodes {
		if edge, seen := rightEdge[node.Tier]; seen && node.X < edge {
			t.Errorf("%s zaczyna się na %d, a poprzednie pudełko kończy na %d", node.Name, node.X, edge)
		}
		rightEdge[node.Tier] = node.X + node.W
	}
}

// Widok uproszczony ma zastąpić pęk kabli jedną wiązką na urządzenie: mniej
// linii niż kabli, a mimo to nic nie znika z opisu.
func TestSimpleViewBundlesCables(t *testing.T) {
	topo := newTestServer(t).lib().TopologyBySlug["spine-leaf"]
	full := topologyView(topo, ViewCabling)
	simple := topologyView(topo, ViewSimple)

	if len(simple.Cables) >= len(full.Cables) {
		t.Errorf("uproszczenie nie uprościło: %d linii zamiast %d", len(simple.Cables), len(full.Cables))
	}
	if len(simple.Groups) == 0 {
		t.Error("brak ramki wokół zwiniętej warstwy")
	}
	bundles := 0
	for _, c := range simple.Cables {
		if c.Class == "bundle" {
			bundles++
			if c.Label == "" {
				t.Error("wiązka bez podpisu, ile kabli zastępuje")
			}
		}
	}
	if bundles == 0 {
		t.Error("nie narysowano ani jednej wiązki")
	}
}

// Wypis "show ip route" powstaje z tych samych kabli, które są podświetlone
// na rysunku - to jest cały sens liczenia tego po stronie serwera.
func TestRoutingViewMatchesTheHighlightedCables(t *testing.T) {
	topo := newTestServer(t).lib().TopologyBySlug["spine-leaf"]
	got := topologyView(topo, ViewRouting)
	if got.Route == nil {
		t.Fatal("brak panelu z routingiem")
	}

	hot := 0
	for _, c := range got.Cables {
		if c.Class == "hot" {
			hot++
		}
	}
	// Trzy spine'y, każdy na drodze leaf1 -> spine -> leaf3: sześć kabli.
	if want := 2 * len(topo.Route.Paths); hot != want {
		t.Errorf("podświetlono %d kabli, a ścieżki potrzebują %d", hot, want)
	}
	for _, p := range topo.Route.Paths {
		if !strings.Contains(got.Route.Output, "via "+p.Port) {
			t.Errorf("w wypisie brakuje wyjścia przez %s:\n%s", p.Port, got.Route.Output)
		}
		if !strings.Contains(got.Route.Output, p.NextHop) {
			t.Errorf("w wypisie brakuje next-hopa %s:\n%s", p.NextHop, got.Route.Output)
		}
	}
}

// Widok adresów pokazuje każdy kabel w tabeli i podpisuje na rysunku te,
// które mają /31.
func TestAddressViewListsEveryCable(t *testing.T) {
	topo := newTestServer(t).lib().TopologyBySlug["spine-leaf"]
	got := topologyView(topo, ViewAddresses)

	if len(got.Table) != len(topo.Cables) {
		t.Errorf("tabela ma %d wierszy, a kabli jest %d", len(got.Table), len(topo.Cables))
	}
	labelled, routed := 0, 0
	for i, c := range topo.Cables {
		if c.Routed() {
			routed++
		}
		if got.Cables[i].Label != "" {
			labelled++
		}
	}
	if labelled != routed {
		t.Errorf("podpisano %d kabli, a zaadresowanych jest %d", labelled, routed)
	}
}

func TestUnknownTopologyViewIsNotFound(t *testing.T) {
	srv := newTestServer(t)
	if rec := get(t, srv, "/topologie/spine-leaf/widok/kabelki"); rec.Code != http.StatusNotFound {
		t.Errorf("kod = %d, chcę 404", rec.Code)
	}
}

// Przycisk widoku to zwykły GET wymieniający jeden fragment - taki sam
// kształt jak odkrywanie podpowiedzi do zadania.
func TestViewButtonReturnsTheWholeFigure(t *testing.T) {
	srv := newTestServer(t)
	body := get(t, srv, "/topologie/spine-leaf/widok/adresy").Body.String()
	for _, want := range []string{`id="topo-spine-leaf"`, "<svg", "10.255.0.0/31"} {
		if !strings.Contains(body, want) {
			t.Errorf("fragment nie zawiera %q", want)
		}
	}
}
