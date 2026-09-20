package content

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// loadTopology zapisuje jeden plik topologii i wczytuje go - większość testów
// niżej pyta o to, co się z niego rozwinęło.
func loadTopology(t *testing.T, yaml string) *Topology {
	t.Helper()
	lib := writeLibrary(t, map[string]string{"topologies/test.yaml": yaml})
	topo := lib.TopologyBySlug["test"]
	if topo == nil {
		t.Fatal("topologia się nie wczytała")
	}
	return topo
}

// loadTopologyError sprawdza, że zły plik nie wjeżdża cicho na stronę w
// dziwnej formie, tylko zatrzymuje wczytywanie.
func loadTopologyError(t *testing.T, yaml string) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "topologies"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "topologies", "test.yaml"), []byte(yaml), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err := Load(dir)
	if err == nil {
		t.Fatal("chcę błędu, a plik się wczytał")
	}
	return err.Error()
}

const smallFabric = `
title: "Mały fabric"
fabric_net: 10.255.0.0/24
tiers:
  - id: spine
    label: Spine
    devices:
      - { name: spine1, asn: 65001, loopback: 10.0.0.1 }
      - { name: spine2, asn: 65002, loopback: 10.0.0.2 }
  - id: leaf
    label: Leaf
    devices:
      - { name: leaf1, asn: 65101, loopback: 10.0.1.1 }
      - { name: leaf2, asn: 65102, loopback: 10.0.1.2 }
  - id: rack
    label: Szafa
    kind: endpoint
    devices:
      - { name: szafa1, subnet: 10.1.1.0/24 }
      - { name: szafa2, subnet: 10.1.2.0/24 }
mesh:
  - { from: leaf, to: spine }
pairs:
  - { from: rack, to: leaf }
route:
  from: leaf1
  to: leaf2
  prefix: 10.1.2.0/24
`

// Reguła "każdy leaf do każdego spine'a" ma się rozwinąć w konkretne kable -
// to jest cały powód, dla którego topologia jest danymi, a nie obrazkiem.
func TestMeshAndPairsExpandIntoCables(t *testing.T) {
	topo := loadTopology(t, smallFabric)

	// 2 leafy × 2 spine'y z mesha + 2 szafy z pairs.
	if len(topo.Cables) != 6 {
		t.Fatalf("kabli = %d, chcę 6", len(topo.Cables))
	}
	ends := map[string]bool{}
	for _, c := range topo.Cables {
		ends[c.From+"-"+c.To] = true
	}
	for _, want := range []string{"leaf1-spine1", "leaf1-spine2", "leaf2-spine1", "leaf2-spine2"} {
		if !ends[want] {
			t.Errorf("brakuje kabla %s", want)
		}
	}
}

// Porty numerują się w kolejności wpinania, a szafa portu nie dostaje - nie
// ma tam przełącznika, na którym miałby być nazwany.
func TestPortsAreNumberedPerDevice(t *testing.T) {
	topo := loadTopology(t, smallFabric)

	ports := map[string][]string{}
	for _, c := range topo.Cables {
		ports[c.From] = append(ports[c.From], c.FromPort)
		ports[c.To] = append(ports[c.To], c.ToPort)
	}
	if got := strings.Join(ports["leaf1"], ","); got != "swp1,swp2,swp3" {
		t.Errorf("porty leaf1 = %q, chcę swp1,swp2,swp3", got)
	}
	if got := strings.Join(ports["szafa1"], ","); got != "" {
		t.Errorf("szafa dostała port %q, a nie powinna", got)
	}
}

// Każde łącze między routerami dostaje własny /31 z puli, po kolei i bez
// powtórek. Łącze do szafy nie dostaje nic - tam nie ma sesji BGP.
func TestRoutedLinksGetTheirOwn31(t *testing.T) {
	topo := loadTopology(t, smallFabric)

	seen := map[string]bool{}
	routed := 0
	for _, c := range topo.Cables {
		if !c.Routed() {
			continue
		}
		routed++
		if !strings.HasSuffix(c.Net, "/31") {
			t.Errorf("%s-%s dostało %q, a chcę /31", c.From, c.To, c.Net)
		}
		if seen[c.Net] {
			t.Errorf("%s przydzielone dwa razy", c.Net)
		}
		seen[c.Net] = true
		if c.FromIP == c.ToIP {
			t.Errorf("%s: oba końce mają %s", c.Net, c.FromIP)
		}
	}
	if routed != 4 {
		t.Errorf("zaadresowanych łączy = %d, chcę 4 (bez kabli do szaf)", routed)
	}
}

// Trasa liczy się z kabli, więc dołożenie spine'a dokłada ścieżkę - bez
// dopisywania czegokolwiek w pliku.
func TestRouteFindsEveryEqualCostPath(t *testing.T) {
	topo := loadTopology(t, smallFabric)

	if len(topo.Route.Paths) != 2 {
		t.Fatalf("ścieżek = %d, chcę 2 (po jednej przez każdy spine)", len(topo.Route.Paths))
	}
	for _, p := range topo.Route.Paths {
		if len(p.Devices) != 3 || p.Devices[0] != "leaf1" || p.Devices[2] != "leaf2" {
			t.Errorf("dziwna ścieżka: %v", p.Devices)
		}
		if p.Port == "" || p.NextHop == "" {
			t.Errorf("ścieżka %v bez portu albo next-hopa", p.Devices)
		}
	}
	if a, b := topo.Route.Paths[0].NextHop, topo.Route.Paths[1].NextHop; a == b {
		t.Errorf("obie ścieżki mają ten sam next-hop %s", a)
	}
}

func TestBrokenTopologiesAreRejected(t *testing.T) {
	cases := map[string]struct{ yaml, want string }{
		"nieznana warstwa w regule": {
			yaml: "tiers:\n  - { id: a, devices: [{ name: x }] }\nmesh:\n  - { from: a, to: b }\n",
			want: "nieistniejącą warstwę",
		},
		"pairs o różnej długości": {
			yaml: "tiers:\n  - { id: a, devices: [{ name: x }] }\n  - { id: b, devices: [{ name: y }, { name: z }] }\npairs:\n  - { from: a, to: b }\n",
			want: "łączę i-te z i-tym",
		},
		"to samo urządzenie dwa razy": {
			yaml: "tiers:\n  - { id: a, devices: [{ name: x }, { name: x }] }\n",
			want: "dwa razy",
		},
		"trasa donikąd": {
			yaml: "tiers:\n  - { id: a, devices: [{ name: x }, { name: y }] }\nroute:\n  { from: x, to: y, prefix: 10.0.0.0/24 }\n",
			want: "nie ma między nimi drogi",
		},
		"pula za mała": {
			yaml: "fabric_net: 10.255.0.0/31\ntiers:\n  - { id: a, devices: [{ name: x }] }\n  - { id: b, devices: [{ name: y }, { name: z }] }\nmesh:\n  - { from: a, to: b }\n",
			want: "skończyła się",
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			if got := loadTopologyError(t, tc.yaml); !strings.Contains(got, tc.want) {
				t.Errorf("błąd = %q, chcę coś o %q", got, tc.want)
			}
		})
	}
}
