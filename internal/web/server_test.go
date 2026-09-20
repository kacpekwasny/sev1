package web

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// newTestServer serves the real content and templates from the repo, so a
// broken template or a typo in a wikilink shows up as a failing test.
func newTestServer(t *testing.T) *Server {
	t.Helper()
	srv, err := New(Options{
		ContentDir: "../../content",
		Files:      os.DirFS("../../web"),
		PanelToken: "test",
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return srv
}

func get(t *testing.T, srv *Server, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestEveryPageRenders(t *testing.T) {
	srv := newTestServer(t)
	lib := srv.lib()

	paths := []string{"/", "/notatki/", "/notatki/graf", "/notatki/vault.zip",
		"/zadania/", "/topologie/", "/live/", "/api/graf.json"}
	for _, lec := range lib.Lectures {
		paths = append(paths, "/wyklady/"+lec.Slug)
	}
	for _, note := range lib.Notes {
		paths = append(paths, "/notatki/"+note.Slug, "/notatki/"+note.Slug+"/md")
	}
	for _, task := range lib.Tasks {
		paths = append(paths, "/zadania/"+task.Slug)
	}
	for _, topo := range lib.Topologies {
		paths = append(paths, "/topologie/"+topo.Slug)
		for _, view := range topologyViews {
			paths = append(paths, "/topologie/"+topo.Slug+"/widok/"+view.ID)
		}
	}

	for _, path := range paths {
		if rec := get(t, srv, path); rec.Code != http.StatusOK {
			t.Errorf("GET %s = %d", path, rec.Code)
		}
	}
}

func TestUnknownPageIsNotFound(t *testing.T) {
	srv := newTestServer(t)
	if rec := get(t, srv, "/notatki/nie-ma-takiej"); rec.Code != http.StatusNotFound {
		t.Errorf("kod = %d, chcę 404", rec.Code)
	}
}

func TestPanelNeedsToken(t *testing.T) {
	srv := newTestServer(t)
	if rec := get(t, srv, "/panel"); rec.Code != http.StatusForbidden {
		t.Errorf("panel bez tokenu = %d, chcę 403", rec.Code)
	}
	rec := get(t, srv, "/panel?token=test")
	if rec.Code != http.StatusSeeOther {
		t.Fatalf("logowanie do panelu = %d, chcę 303", rec.Code)
	}
	req := httptest.NewRequest(http.MethodGet, "/panel", nil)
	for _, c := range rec.Result().Cookies() {
		req.AddCookie(c)
	}
	out := httptest.NewRecorder()
	srv.ServeHTTP(out, req)
	if out.Code != http.StatusOK {
		t.Errorf("panel z ciasteczkiem = %d, chcę 200", out.Code)
	}
}

func TestVotingUpdatesTheTally(t *testing.T) {
	srv := newTestServer(t)
	srv.hub.SetPoll("fib-overflow", true)

	req := httptest.NewRequest(http.MethodPost, "/live/glos", strings.NewReader("option=b"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("kod = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "chosen") {
		t.Error("oddany głos nie został zaznaczony w odpowiedzi")
	}
	if srv.hub.Snapshot().Tally["b"] != 1 {
		t.Errorf("Tally = %v", srv.hub.Snapshot().Tally)
	}
}

func post(t *testing.T, srv *Server, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	return rec
}

func TestAudienceCanAnswerAndVoteOnAnswers(t *testing.T) {
	srv := newTestServer(t)
	srv.hub.AskQuestion("ala", "Ile sesji w pełnej siatce?")
	qid := srv.hub.Snapshot().Questions[0].ID

	if rec := get(t, srv, "/live/odpowiedz?pytanie="+qid); !strings.Contains(rec.Body.String(), "Ile sesji") {
		t.Errorf("formularz odpowiedzi nie cytuje pytania: %s", rec.Body.String())
	}
	if rec := get(t, srv, "/live/odpowiedz"); strings.Contains(rec.Body.String(), "<form") {
		t.Error("bez parametru pudełko powinno być puste (anuluj)")
	}

	if rec := post(t, srv, "/live/pytanie/"+qid+"/odpowiedz", "text=n(n-1)/2"); rec.Code != http.StatusOK {
		t.Fatalf("kod = %d", rec.Code)
	}
	comments := srv.hub.Snapshot().Questions[0].Comments
	if len(comments) != 1 {
		t.Fatalf("Comments = %+v", comments)
	}

	rec := post(t, srv, "/live/pytanie/"+qid+"/odpowiedz/"+comments[0].ID+"/glos", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("głos na odpowiedź = %d", rec.Code)
	}
	if got := srv.hub.Snapshot().Questions[0].Comments[0].Votes; got != 2 {
		t.Errorf("Votes = %d, chcę 2", got)
	}
	if !strings.Contains(rec.Body.String(), "n(n-1)/2") {
		t.Error("odpowiedź nie pojawiła się na liście pytań")
	}
}

// Wejście na /live/ ma od razu dać ksywkę i wpisać człowieka na listę w
// panelu - nikt nie klika "zaloguj się".
func TestLivePageGivesANickname(t *testing.T) {
	srv := newTestServer(t)
	rec := get(t, srv, "/live/")

	people := srv.hub.Snapshot().Participants
	if len(people) != 1 {
		t.Fatalf("Participants = %+v", people)
	}
	if !strings.Contains(rec.Body.String(), people[0].Nick) {
		t.Errorf("strona nie pokazuje ksywki %q", people[0].Nick)
	}
}

func TestNicknameCanBeEdited(t *testing.T) {
	srv := newTestServer(t)
	widz := &browser{srv: srv}
	widz.get(t, "/live/")

	rec := widz.post(t, "/live/ksywka", "nick=kacper-z-akamai")
	if rec.Code != http.StatusOK {
		t.Fatalf("kod = %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "kacper-z-akamai") {
		t.Errorf("nowa ksywka nie wróciła w formularzu: %s", rec.Body.String())
	}
	people := srv.hub.Snapshot().Participants
	if len(people) != 1 || people[0].Nick != "kacper-z-akamai" {
		t.Errorf("Participants = %+v", people)
	}
}

// Ban i globalna blokada mają dawać sali wyjaśnienie zamiast cicho gubić
// wpisywany tekst.
func TestBlockedPersonSeesWhy(t *testing.T) {
	srv := newTestServer(t)
	widz := &browser{srv: srv}
	widz.get(t, "/live/") // dołącza uczestnika i losuje ksywkę
	id := srv.hub.Snapshot().Participants[0].ID

	srv.hub.BanParticipant(id, true)
	rec := widz.post(t, "/live/pytanie", "text=spam")
	if !strings.Contains(rec.Body.String(), "wyłączył ci pisanie") {
		t.Errorf("zbanowany nie dostał wyjaśnienia: %s", rec.Body.String())
	}
	if len(srv.hub.Snapshot().Questions) != 0 {
		t.Error("pytanie zbanowanego trafiło na listę")
	}

	srv.hub.BanParticipant(id, false)
	srv.hub.SetQuestionsLocked(true)
	rec = widz.post(t, "/live/pytanie", "text=a teraz?")
	if !strings.Contains(rec.Body.String(), "chwilowo zamknięte") {
		t.Errorf("brak informacji o zamkniętych pytaniach: %s", rec.Body.String())
	}
	if len(srv.hub.Snapshot().Questions) != 0 {
		t.Error("pytanie przy zamkniętym pisaniu trafiło na listę")
	}
}

// browser to klient testowy, który trzyma swoje ciasteczka - dzięki temu
// kolejne żądania są „od tej samej osoby na sali", tak jak w przeglądarce.
type browser struct {
	srv     *Server
	cookies []*http.Cookie
}

func (b *browser) get(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	return b.do(t, httptest.NewRequest(http.MethodGet, path, nil))
}

func (b *browser) post(t *testing.T, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	return b.do(t, req)
}

func (b *browser) do(t *testing.T, req *http.Request) *httptest.ResponseRecorder {
	t.Helper()
	for _, c := range b.cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	b.srv.ServeHTTP(rec, req)
	b.cookies = append(b.cookies, rec.Result().Cookies()...)
	return rec
}

func TestPanelBansAndLocks(t *testing.T) {
	srv := newTestServer(t)
	get(t, srv, "/live/")
	id := srv.hub.Snapshot().Participants[0].ID

	if rec := panelPost(t, srv, "/panel/uczestnik/"+id+"/ban", ""); rec.Code != http.StatusOK {
		t.Fatalf("ban = %d", rec.Code)
	}
	if !srv.hub.Snapshot().Participants[0].Banned {
		t.Error("ban nie zadziałał")
	}
	panelPost(t, srv, "/panel/uczestnik/"+id+"/ban-ip", "")
	if !srv.hub.Snapshot().Participants[0].IPBanned {
		t.Error("ban adresu nie zadziałał")
	}

	rec := panelPost(t, srv, "/panel/pytania", "locked=tak")
	if !srv.hub.Snapshot().QuestionsLocked {
		t.Error("blokada pytań nie zadziałała")
	}
	if !strings.Contains(rec.Body.String(), "otwórz pytania") {
		t.Errorf("panel nie oferuje odblokowania: %s", rec.Body.String())
	}
	panelPost(t, srv, "/panel/pytania", "locked=nie")
	if srv.hub.Snapshot().QuestionsLocked {
		t.Error("odblokowanie pytań nie zadziałało")
	}
}

// panelPost wysyła żądanie z ciasteczkiem prowadzącego.
func panelPost(t *testing.T, srv *Server, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.AddCookie(&http.Cookie{Name: "panel", Value: "test"})
	rec := httptest.NewRecorder()
	srv.ServeHTTP(rec, req)
	return rec
}

func TestClientIPPrefersForwardedFor(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/live/", nil)
	req.RemoteAddr = "10.0.0.5:44321"
	if got := clientIP(req); got != "10.0.0.5" {
		t.Errorf("clientIP = %q, chcę 10.0.0.5 (bez portu)", got)
	}
	req.Header.Set("X-Forwarded-For", "203.0.113.9, 10.0.0.1")
	if got := clientIP(req); got != "203.0.113.9" {
		t.Errorf("clientIP = %q, chcę adres klienta z X-Forwarded-For", got)
	}
}

// Notatki mają linkować tylko do istniejących notatek - inaczej na stronie
// pojawia się sekcja "jeszcze nienapisane", zwykle przez literówkę.
func TestNoDanglingWikilinks(t *testing.T) {
	srv := newTestServer(t)
	for _, note := range srv.lib().Notes {
		if len(note.Missing) > 0 {
			t.Errorf("%s linkuje do nieistniejących notatek: %v", note.Slug, note.Missing)
		}
	}
}

// Agenda wykładów wskazuje na pytania, notatki i zadania po slugu - łatwo tu
// o literówkę, a na wykładzie nie ma czasu na debugowanie.
func TestLectureReferencesExist(t *testing.T) {
	lib := newTestServer(t).lib()
	for _, lec := range lib.Lectures {
		for _, item := range lec.Agenda {
			if item.Poll != "" {
				if _, ok := lib.PollByID[item.Poll]; !ok {
					t.Errorf("%s: nie ma pytania %q", lec.Slug, item.Poll)
				}
			}
			for _, slug := range item.Notes {
				if _, ok := lib.NoteBySlug[slug]; !ok {
					t.Errorf("%s: nie ma notatki %q", lec.Slug, slug)
				}
			}
			for _, slug := range item.Tasks {
				if _, ok := lib.TaskBySlug[slug]; !ok {
					t.Errorf("%s: nie ma zadania %q", lec.Slug, slug)
				}
			}
			for _, slug := range item.Topologies {
				if _, ok := lib.TopologyBySlug[slug]; !ok {
					t.Errorf("%s: nie ma topologii %q", lec.Slug, slug)
				}
			}
		}
	}
}
