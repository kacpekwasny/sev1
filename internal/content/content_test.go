package content

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// writeLibrary builds a tiny content tree in a temp dir and loads it.
func writeLibrary(t *testing.T, files map[string]string) *Library {
	t.Helper()
	dir := t.TempDir()
	for name, body := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	lib, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	return lib
}

func TestNotesLinkBothWays(t *testing.T) {
	lib := writeLibrary(t, map[string]string{
		"notes/overlay.md":      "---\ntitle: Overlay\n---\n\nPatrz [[bgp-podstawy]] i [[nie-ma-tego]].\n",
		"notes/bgp-podstawy.md": "---\ntitle: BGP\n---\n\nTreść.\n",
	})

	overlay := lib.NoteBySlug["overlay"]
	if got := overlay.Links; len(got) != 1 || got[0] != "bgp-podstawy" {
		t.Errorf("Links = %v, chcę [bgp-podstawy]", got)
	}
	if got := overlay.Missing; len(got) != 1 || got[0] != "nie-ma-tego" {
		t.Errorf("Missing = %v, chcę [nie-ma-tego]", got)
	}
	bgp := lib.NoteBySlug["bgp-podstawy"]
	if got := bgp.Backlinks; len(got) != 1 || got[0] != "overlay" {
		t.Errorf("Backlinks = %v, chcę [overlay]", got)
	}
	if !strings.Contains(string(overlay.Body), `href="/notatki/bgp-podstawy"`) {
		t.Errorf("wikilink nie zamienił się w link: %s", overlay.Body)
	}
}

func TestWikilinkWithFolderPointsOutsideNotes(t *testing.T) {
	lib := writeLibrary(t, map[string]string{
		"notes/a.md": "---\ntitle: A\n---\n\n[[zadania/gobgp-pamiec|zadanie]]\n",
	})
	note := lib.NoteBySlug["a"]
	if len(note.Links) != 0 || len(note.Missing) != 0 {
		t.Errorf("link do innego działu nie powinien być krawędzią grafu: %v %v", note.Links, note.Missing)
	}
	if !strings.Contains(string(note.Body), `href="/zadania/gobgp-pamiec"`) {
		t.Errorf("zły cel linku: %s", note.Body)
	}
}

func TestWikilinkInsideCodeBlockIsLeftAlone(t *testing.T) {
	lib := writeLibrary(t, map[string]string{
		"notes/a.md": "---\ntitle: A\n---\n\n```\n[[to-nie-link]]\n```\n",
	})
	note := lib.NoteBySlug["a"]
	if len(note.Links)+len(note.Missing) != 0 {
		t.Errorf("wikilink w bloku kodu został policzony: %v %v", note.Links, note.Missing)
	}
	if !strings.Contains(string(note.Body), "[[to-nie-link]]") {
		t.Errorf("blok kodu został zmieniony: %s", note.Body)
	}
}

func TestLectureAgendaAndDuration(t *testing.T) {
	lib := writeLibrary(t, map[string]string{
		"lectures/01-x.md": "---\ntitle: Pierwszy\nnumber: 1\nagenda:\n  - minutes: 10\n    title: Wstęp\n  - minutes: 20\n    title: Reszta\n    poll: p1\n---\n\nOpis.\n",
	})
	lec := lib.LectureBySlug["01-x"]
	if lec == nil {
		t.Fatal("nie wczytano wykładu")
	}
	if lec.Duration() != 30 {
		t.Errorf("Duration = %d, chcę 30", lec.Duration())
	}
	if lec.Agenda[1].Poll != "p1" {
		t.Errorf("agenda zgubiła pytanie: %+v", lec.Agenda[1])
	}
}

func TestTaskHintsAreRendered(t *testing.T) {
	lib := writeLibrary(t, map[string]string{
		"tasks/z.md": "---\ntitle: Zadanie\nhints:\n  - title: Raz\n    text: \"Zobacz `pprof`.\"\n---\n\nTreść.\n",
	})
	task := lib.TaskBySlug["z"]
	if len(task.Hints) != 1 {
		t.Fatalf("Hints = %v", task.Hints)
	}
	if !strings.Contains(string(task.Hints[0].HTML), "<code>pprof</code>") {
		t.Errorf("podpowiedź nie została zrenderowana: %s", task.Hints[0].HTML)
	}
}

func TestVaultContainsRawFiles(t *testing.T) {
	lib := writeLibrary(t, map[string]string{
		"notes/a.md": "---\ntitle: A\n---\n\nTreść [[b]].\n",
		"notes/b.md": "---\ntitle: B\n---\n\nTreść.\n",
	})
	zipped, err := lib.Vault()
	if err != nil {
		t.Fatalf("Vault: %v", err)
	}
	if len(zipped) == 0 {
		t.Fatal("pusty vault")
	}
	if lib.NoteBySlug["a"].Raw == "" {
		t.Error("notatka nie zachowała oryginalnej treści")
	}
}
