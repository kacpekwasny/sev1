package web

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"wykladywiet/internal/live"
)

func TestLanguageSelection(t *testing.T) {
	srv := newTestServer(t)
	for _, target := range []string{"https://example.com/", "//example.com/", "/\\example.com/"} {
		req := httptest.NewRequest("GET", "/language?lang=en&return="+strings.ReplaceAll(target, "\\", "%5C"), nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		if rec.Header().Get("Location") != "/" {
			t.Errorf("unsafe destination accepted: %q", rec.Header().Get("Location"))
		}
	}
	rec := get(t, srv, "/language?lang=en&return=%2Fnotatki%2F%3Ftag%3Dbgp%26lang%3Dpl")
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/notatki/?tag=bgp" {
		t.Fatalf("redirect: %d %s", rec.Code, rec.Header().Get("Location"))
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Value != "en" || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie: %+v", cookies)
	}
	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(cookies[0])
	page := httptest.NewRecorder()
	srv.ServeHTTP(page, req)
	if !strings.Contains(page.Body.String(), `<html lang="en">`) || page.Header().Get("Content-Language") != "en" {
		t.Fatal("remembered choice missing")
	}
	req = httptest.NewRequest("GET", "/?lang=pl", nil)
	req.AddCookie(cookies[0])
	page = httptest.NewRecorder()
	srv.ServeHTTP(page, req)
	if remembered := page.Result().Cookies(); len(remembered) != 1 || remembered[0].Value != "pl" {
		t.Fatal("explicit query choice must be remembered")
	}
	if !strings.Contains(page.Body.String(), `<html lang="pl">`) {
		t.Fatal("explicit language must take precedence")
	}
	if got := get(t, srv, "/language?lang=../../bad").Code; got != http.StatusBadRequest {
		t.Fatalf("unsupported language: %d", got)
	}
	if got := get(t, srv, "/?lang=unknown").Header().Get("Content-Language"); got != "pl" {
		t.Fatalf("fallback: %s", got)
	}
}

func TestEnglishPagesAndDownloads(t *testing.T) {
	srv := newTestServer(t)
	english := srv.libFor(httptest.NewRequest("GET", "/?lang=en", nil))
	polish := srv.lib()
	if english.Language != "en" || len(english.Notes) != len(polish.Notes) || len(english.Tasks) != len(polish.Tasks) || len(english.Lectures) != len(polish.Lectures) || len(english.Topologies) != len(polish.Topologies) {
		t.Fatal("English library is incomplete")
	}
	paths := []string{"/", "/wyklady/", "/notatki/", "/notatki/graf", "/zadania/", "/topologie/", "/topologie/dc/", "/live/"}
	for _, lecture := range english.Lectures {
		paths = append(paths, "/wyklady/"+lecture.Slug)
		original := polish.LectureBySlug[lecture.Slug]
		if original == nil || len(lecture.Agenda) != len(original.Agenda) {
			t.Fatalf("lecture structure changed: %s", lecture.Slug)
		}
		for i, item := range lecture.Agenda {
			if item.Poll != original.Agenda[i].Poll || !reflect.DeepEqual(item.Notes, original.Agenda[i].Notes) || !reflect.DeepEqual(item.Tasks, original.Agenda[i].Tasks) || !reflect.DeepEqual(item.Terms, original.Agenda[i].Terms) {
				t.Errorf("lecture references changed: %s, item %d", lecture.Slug, i)
			}
		}
	}
	for _, note := range english.Notes {
		paths = append(paths, "/notatki/"+note.Slug)
		original := polish.NoteBySlug[note.Slug]
		if original == nil || len(note.Missing) > 0 || !reflect.DeepEqual(note.Links, original.Links) {
			t.Errorf("English note links changed: %s", note.Slug)
		}
		raw := get(t, srv, "/notatki/"+note.Slug+"/md?lang=en")
		if raw.Code != http.StatusOK || raw.Body.String() != note.Raw {
			t.Errorf("raw English download: %s", note.Slug)
		}
	}
	for _, task := range english.Tasks {
		paths = append(paths, "/zadania/"+task.Slug)
		original := polish.TaskBySlug[task.Slug]
		if original == nil || len(task.Hints) != len(original.Hints) || !reflect.DeepEqual(task.Notes, original.Notes) {
			t.Fatalf("exercise structure changed: %s", task.Slug)
		}
		for i, hint := range task.Hints {
			rec := httptest.NewRecorder()
			srv.ServeHTTP(rec, httptest.NewRequest("POST", fmt.Sprintf("/zadania/%s/podpowiedz/%d?lang=en", task.Slug, i), nil))
			if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), html.EscapeString(hint.Title)) {
				t.Errorf("English hint %s/%d: %d", task.Slug, i+1, rec.Code)
			}
		}
	}
	for _, topo := range english.Topologies {
		paths = append(paths, "/topologie/"+topo.Slug)
		for _, view := range topologyViews {
			fragment := get(t, srv, "/topologie/"+topo.Slug+"/widok/"+view.ID+"?lang=en")
			if fragment.Code != http.StatusOK || !strings.Contains(fragment.Body.String(), `aria-label="Topology view"`) || strings.Contains(fragment.Body.String(), " ma po jednym kablu ") {
				t.Errorf("English topology fragment %s/%s", topo.Slug, view.ID)
			}
		}
	}
	for _, path := range paths {
		rec := get(t, srv, path+"?lang=en")
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `<html lang="en">`) || !strings.Contains(rec.Body.String(), `>Language</label>`) {
			t.Errorf("English page %s: %d", path, rec.Code)
		}
	}
	hub := get(t, srv, "/wyklady/?lang=en").Body.String()
	if strings.Contains(hub, `>trudne</span>`) || !strings.Contains(hub, `>hard</span>`) {
		t.Error("English difficulty missing from hub")
	}
	poster := get(t, srv, "/?lang=en").Body.String()
	if !strings.Contains(poster, "How I Caused a Second Sev1") || !strings.Contains(poster, "free entry, no registration") || !strings.Contains(poster, "Open lectures at AGH WIET") {
		t.Error("English poster or metadata missing")
	}
	notFound := get(t, srv, "/notatki/does-not-exist?lang=en")
	if notFound.Code != http.StatusNotFound || !strings.Contains(notFound.Body.String(), "This route is not in the routing table.") {
		t.Error("English 404 missing")
	}
	graph := get(t, srv, "/api/graf.json?lang=en").Body.String()
	var graphData struct {
		Nodes []struct {
			Title string `json:"title"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(graph), &graphData); err != nil {
		t.Fatal(err)
	}
	for _, note := range english.Notes {
		found := false
		for _, node := range graphData.Nodes {
			found = found || node.Title == note.Title
		}
		if !found {
			t.Errorf("English graph title missing: %s", note.Title)
		}
	}
	vault := get(t, srv, "/notatki/vault.zip?lang=en")
	zr, err := zip.NewReader(bytes.NewReader(vault.Body.Bytes()), int64(vault.Body.Len()))
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range zr.File {
		r, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		raw, err := io.ReadAll(r)
		r.Close()
		if err != nil {
			t.Fatal(err)
		}
		if file.Name == "README.md" && (!bytes.Contains(raw, []byte("## Notes")) || !bytes.Contains(raw, []byte("## Exercises"))) {
			t.Error("English vault index missing")
		}
		if slug := strings.TrimSuffix(strings.TrimPrefix(file.Name, "notatki/"), ".md"); english.NoteBySlug[slug] != nil && string(raw) != english.NoteBySlug[slug].Raw {
			t.Errorf("vault translation: %s", file.Name)
		}
	}
}

func TestMixedLanguageLiveInteractions(t *testing.T) {
	srv := newTestServer(t)
	srv.hub.SetOnAir(true)
	srv.hub.SetPoll("fib-overflow", true)
	english := &browser{srv: srv, cookies: []*http.Cookie{{Name: "sev1_language", Value: "en"}}}
	polish := &browser{srv: srv}
	enPage := english.get(t, "/live/").Body.String()
	plPage := polish.get(t, "/live/").Body.String()
	if !strings.Contains(enPage, "A whitebox has room for 32k FIB routes.") || !strings.Contains(plPage, srv.lib().PollByID["fib-overflow"].Question) {
		t.Fatal("poll translation missing")
	}
	for _, client := range []*browser{english, polish} {
		rec := client.post(t, "/live/glos", "option=b")
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "chosen") {
			t.Fatal("translated voting failed")
		}
	}
	if srv.hub.SnapshotFor(live.Presenter).Tally["b"] != 2 {
		t.Fatal("languages do not share a tally")
	}
	rec := english.post(t, "/live/ksywka", "nick=Notatki")
	if rec.Code != http.StatusOK {
		t.Fatalf("nickname: %d", rec.Code)
	}
	// Use catalog keys as audience text to detect accidental translation.
	english.post(t, "/live/pytanie", "text="+url.QueryEscape("Wybierz odpowiedź <script>"))
	page := polish.get(t, "/live/").Body.String()
	if !strings.Contains(page, `<span class="qtext">Wybierz odpowiedź &lt;script&gt;</span>`) || !strings.Contains(page, `— Notatki</span>`) {
		t.Fatal("audience text was translated or unescaped")
	}
	request := httptest.NewRequest("GET", "/live/stream", nil)
	request.AddCookie(&http.Cookie{Name: "sev1_language", Value: "en"})
	snapshot := srv.hub.SnapshotFor(live.Presenter)
	out := httptest.NewRecorder()
	srv.sendEvent(out, request, "vote", "vote-card", pollView(srv.libFor(request), snapshot))
	srv.sendEvent(out, request, "questions", "questions", questionsView(snapshot, ""))
	if !strings.Contains(out.Body.String(), "event: vote\n") || !strings.Contains(out.Body.String(), "A whitebox has room for 32k FIB routes.") || !strings.Contains(out.Body.String(), "Wybierz odpowiedź &lt;script&gt;") {
		t.Fatal("SSE translation or audience text missing")
	}
	panelRequest := httptest.NewRequest("GET", "/panel", nil)
	panelRequest.AddCookie(&http.Cookie{Name: "panel", Value: "test"})
	panelRequest.AddCookie(&http.Cookie{Name: "sev1_language", Value: "en"})
	panel := httptest.NewRecorder()
	srv.ServeHTTP(panel, panelRequest)
	if panel.Code != http.StatusOK || !strings.Contains(panel.Body.String(), "Presenter panel") {
		t.Fatal("English presenter panel missing")
	}
}

func TestCatalogAndDynamicTranslations(t *testing.T) {
	catalog, err := readCatalog(os.DirFS("../../web"), "en")
	if err != nil {
		t.Fatal(err)
	}
	files, err := filepath.Glob("../../web/templates/*/*.html")
	if err != nil {
		t.Fatal(err)
	}
	files = append(files, "../../web/templates/base.html")
	literal := regexp.MustCompile(`\{\{tr ("(?:[^"\\]|\\.)*")\}\}`)
	for _, file := range files {
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for _, match := range literal.FindAllSubmatch(raw, -1) {
			key, err := strconv.Unquote(string(match[1]))
			if err != nil {
				t.Fatal(err)
			}
			if _, ok := catalog[key]; !ok {
				t.Errorf("missing English catalog key in %s: %q", file, key)
			}
		}
	}
	tr := translator(catalog)
	for source, want := range map[string]string{
		`leaf1 ma po jednym kablu do każdego z 3 urządzeń warstwy "spine"`: `leaf1 has one cable to each of the 3 devices in tier "spine"`,
		"brak szablonu unknown": "missing template unknown",
	} {
		if got := tr(source); got != want {
			t.Errorf("translate %q: %q, want %q", source, got, want)
		}
	}
	if got := translator(map[string]string{"Od {0} do {1}": "To {1} from {0}"})("Od <a> do $value"); got != "To $value from <a>" {
		t.Fatalf("literal reordered placeholders: %s", got)
	}
}
