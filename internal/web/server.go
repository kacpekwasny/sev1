// Package web wires the content and the live hub into an HTTP server.
package web

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"wykladywiet/internal/content"
	"wykladywiet/internal/live"
)

// Options configures the server.
type Options struct {
	ContentDir string // directory with markdown sources
	Files      fs.FS  // templates/ and static/, embedded or from disk
	PanelToken string // secret for the presenter panel
	Dev        bool   // reload content and templates on every request
}

type Server struct {
	opts Options
	hub  *live.Hub
	mux  *http.ServeMux

	mu    sync.RWMutex
	cache *content.Library
	tpl   *templates
}

func New(opts Options) (*Server, error) {
	s := &Server{opts: opts, hub: live.NewHub(), mux: http.NewServeMux()}
	lib, err := content.Load(opts.ContentDir)
	if err != nil {
		return nil, err
	}
	tpl, err := parseTemplates(opts.Files)
	if err != nil {
		return nil, err
	}
	s.cache, s.tpl = lib, tpl
	s.routes()
	return s, nil
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

// lib returns the content, reloaded from disk when running with -dev so that
// editing a note is visible on refresh.
func (s *Server) lib() *content.Library {
	if !s.opts.Dev {
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.cache
	}
	lib, err := content.Load(s.opts.ContentDir)
	if err != nil {
		log.Printf("content reload failed, using last good copy: %v", err)
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.cache
	}
	s.mu.Lock()
	s.cache = lib
	s.mu.Unlock()
	return lib
}

func (s *Server) routes() {
	static, err := fs.Sub(s.opts.Files, "static")
	if err != nil {
		panic(err)
	}
	s.mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(static))))

	s.mux.HandleFunc("GET /{$}", s.handleHome)
	s.mux.HandleFunc("GET /wyklady/{slug}", s.handleLecture)

	s.mux.HandleFunc("GET /notatki/{$}", s.handleNotes)
	s.mux.HandleFunc("GET /notatki/graf", s.handleGraphPage)
	s.mux.HandleFunc("GET /notatki/vault.zip", s.handleVault)
	s.mux.HandleFunc("GET /notatki/{slug}", s.handleNote)
	s.mux.HandleFunc("GET /notatki/{slug}/md", s.handleNoteRaw)
	s.mux.HandleFunc("GET /api/graf.json", s.handleGraphJSON)

	s.mux.HandleFunc("GET /topologie/{$}", s.handleTopologies)
	s.mux.HandleFunc("GET /topologie/{slug}", s.handleTopology)
	s.mux.HandleFunc("GET /topologie/{slug}/widok/{view}", s.handleTopologyView)

	s.mux.HandleFunc("GET /zadania/{$}", s.handleTasks)
	s.mux.HandleFunc("GET /zadania/{slug}", s.handleTask)
	s.mux.HandleFunc("POST /zadania/{slug}/podpowiedz/{n}", s.handleHint)

	s.mux.HandleFunc("GET /live/{$}", s.handleLive)
	s.mux.HandleFunc("GET /live/stream", s.handleStream)
	s.mux.HandleFunc("POST /live/glos", s.handleVote)
	s.mux.HandleFunc("POST /live/ksywka", s.handleNick)
	s.mux.HandleFunc("POST /live/pytanie", s.handleAsk)
	s.mux.HandleFunc("POST /live/pytanie/{id}/glos", s.handleUpvote)
	s.mux.HandleFunc("GET /live/odpowiedz", s.handleAnswerForm)
	s.mux.HandleFunc("POST /live/pytanie/{id}/odpowiedz", s.handleAnswer)
	s.mux.HandleFunc("POST /live/pytanie/{id}/odpowiedz/{cid}/glos", s.handleUpvoteAnswer)

	s.mux.HandleFunc("GET /panel", s.requirePanel(s.handlePanel))
	s.mux.HandleFunc("POST /panel/ankieta", s.requirePanel(s.handlePanelPoll))
	s.mux.HandleFunc("POST /panel/pytanie/{id}/{action}", s.requirePanel(s.handlePanelQuestion))
	s.mux.HandleFunc("POST /panel/pytanie/{id}/odpowiedz/{cid}/usun", s.requirePanel(s.handlePanelDeleteAnswer))
	s.mux.HandleFunc("POST /panel/pytania", s.requirePanel(s.handlePanelLock))
	s.mux.HandleFunc("POST /panel/uczestnik/{id}/{action}", s.requirePanel(s.handlePanelParticipant))
}

// --- pages ---------------------------------------------------------------

func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	lib := s.lib()
	s.render(w, r, "home", map[string]any{
		"Title":    "Jak rozpętałem drugą Sev1",
		"Lectures": lib.Lectures,
		"Tasks":    lib.Tasks,
		"Notes":    lib.Notes,
	})
}

func (s *Server) handleLecture(w http.ResponseWriter, r *http.Request) {
	lib := s.lib()
	lec, ok := lib.LectureBySlug[r.PathValue("slug")]
	if !ok {
		s.notFound(w, r)
		return
	}
	s.render(w, r, "lecture", map[string]any{
		"Title":   lec.Title,
		"Lecture": lec,
		"Lib":     lib,
	})
}

func (s *Server) handleNotes(w http.ResponseWriter, r *http.Request) {
	lib := s.lib()
	s.render(w, r, "notes", map[string]any{
		"Title": "Notatki",
		"Notes": lib.Notes,
	})
}

func (s *Server) handleNote(w http.ResponseWriter, r *http.Request) {
	lib := s.lib()
	note, ok := lib.NoteBySlug[r.PathValue("slug")]
	if !ok {
		s.notFound(w, r)
		return
	}
	s.render(w, r, "note", map[string]any{
		"Title": note.Title,
		"Note":  note,
		"Lib":   lib,
	})
}

func (s *Server) handleNoteRaw(w http.ResponseWriter, r *http.Request) {
	note, ok := s.lib().NoteBySlug[r.PathValue("slug")]
	if !ok {
		s.notFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+note.Slug+".md\"")
	_, _ = w.Write([]byte(note.Raw))
}

func (s *Server) handleVault(w http.ResponseWriter, r *http.Request) {
	zipped, err := s.lib().Vault()
	if err != nil {
		http.Error(w, "nie udało się spakować notatek", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\"sev1-notatki.zip\"")
	_, _ = w.Write(zipped)
}

func (s *Server) handleGraphPage(w http.ResponseWriter, r *http.Request) {
	s.render(w, r, "graph", map[string]any{"Title": "Graf notatek"})
}

func (s *Server) handleGraphJSON(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(s.lib().Graph())
}

func (s *Server) handleTopologies(w http.ResponseWriter, r *http.Request) {
	s.render(w, r, "topologies", map[string]any{
		"Title":      "Topologie",
		"Topologies": s.lib().Topologies,
	})
}

func (s *Server) handleTopology(w http.ResponseWriter, r *http.Request) {
	lib := s.lib()
	topo, ok := lib.TopologyBySlug[r.PathValue("slug")]
	if !ok {
		s.notFound(w, r)
		return
	}
	s.render(w, r, "topology", map[string]any{
		"Title":  topo.Title,
		"Topo":   topo,
		"Lib":    lib,
		"Figure": topologyView(topo, ViewCabling),
	})
}

// handleTopologyView redraws the same network another way. It is the same
// shape as revealing a hint: a GET that returns one fragment, which htmx
// swaps in place. No JavaScript of ours, and the page keeps working without
// htmx - the buttons are then just links to a full page.
func (s *Server) handleTopologyView(w http.ResponseWriter, r *http.Request) {
	topo, ok := s.lib().TopologyBySlug[r.PathValue("slug")]
	if !ok {
		s.notFound(w, r)
		return
	}
	view := r.PathValue("view")
	if !knownTopologyView(view) {
		http.Error(w, "nie ma takiego widoku", http.StatusNotFound)
		return
	}
	s.renderFragment(w, "topology-figure", topologyView(topo, view))
}

func (s *Server) handleTasks(w http.ResponseWriter, r *http.Request) {
	s.render(w, r, "tasks", map[string]any{
		"Title": "Zadania",
		"Tasks": s.lib().Tasks,
	})
}

func (s *Server) handleTask(w http.ResponseWriter, r *http.Request) {
	lib := s.lib()
	task, ok := lib.TaskBySlug[r.PathValue("slug")]
	if !ok {
		s.notFound(w, r)
		return
	}
	s.render(w, r, "task", map[string]any{
		"Title": task.Title,
		"Task":  task,
		"Lib":   lib,
	})
}

// handleHint reveals hints one by one instead of dumping the solution.
func (s *Server) handleHint(w http.ResponseWriter, r *http.Request) {
	task, ok := s.lib().TaskBySlug[r.PathValue("slug")]
	if !ok {
		s.notFound(w, r)
		return
	}
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || n < 0 || n >= len(task.Hints) {
		http.Error(w, "nie ma takiej podpowiedzi", http.StatusNotFound)
		return
	}
	s.renderFragment(w, "hint-revealed", map[string]any{
		"Task":  task,
		"Hint":  task.Hints[n],
		"Index": n,
		"Next":  n + 1,
	})
}

// --- live audience -------------------------------------------------------

func (s *Server) handleLive(w http.ResponseWriter, r *http.Request) {
	lib := s.lib()
	// Opening the page is also how somebody gets a nickname and how they show
	// up on the presenter's list of people.
	me := s.hub.Join(s.participant(w, r), clientIP(r))
	snap := s.hub.Snapshot()
	s.render(w, r, "live", map[string]any{
		"Title": "Na żywo",
		"Poll":  pollView(lib, snap),
		"Snap":  snap,
		"Nick":  NickView{Me: me},
		"Ask":   AskView{Me: me, Problem: writingProblem(me, snap)},
	})
}

// handleNick lets people replace the nickname they were given. Questions that
// are already on the list keep the name they were signed with - rewriting
// history mid-lecture would only confuse the room.
func (s *Server) handleNick(w http.ResponseWriter, r *http.Request) {
	id := s.participant(w, r)
	s.hub.Join(id, clientIP(r))
	me, err := s.hub.SetNick(id, r.FormValue("nick"))
	view := NickView{Me: me, Saved: err == nil}
	if err != nil {
		view.Error = err.Error()
	}
	s.renderFragment(w, "whoami", view)
}

func (s *Server) handleVote(w http.ResponseWriter, r *http.Request) {
	option := r.FormValue("option")
	if _, ok := s.hub.Vote(s.participant(w, r), option); !ok {
		option = "" // poll was closed in the meantime
	}
	view := pollView(s.lib(), s.hub.Snapshot())
	view.Chosen = option
	s.renderFragment(w, "vote-card", view)
}

func (s *Server) handleAsk(w http.ResponseWriter, r *http.Request) {
	id := s.participant(w, r)
	sent := s.hub.AskQuestion(id, r.FormValue("text"))
	me, _ := s.hub.Who(id)
	s.renderFragment(w, "ask-form", AskView{
		Me:      me,
		Sent:    sent,
		Problem: writingProblem(me, s.hub.Snapshot()),
	})
}

func (s *Server) handleUpvote(w http.ResponseWriter, r *http.Request) {
	s.hub.UpvoteQuestion(s.participant(w, r), r.PathValue("id"))
	s.renderFragment(w, "questions", s.hub.Snapshot())
}

// handleAnswerForm opens the box for answering one question, or closes it
// again when called without a question - that is the "anuluj" button.
//
// The box sits outside the part of the page that the live stream replaces,
// so an incoming vote cannot wipe out what somebody is typing.
func (s *Server) handleAnswerForm(w http.ResponseWriter, r *http.Request) {
	question, ok := s.hub.Question(r.URL.Query().Get("pytanie"))
	if !ok {
		s.renderFragment(w, "answer-box", map[string]any{})
		return
	}
	s.renderFragment(w, "answer-box", map[string]any{"Question": question})
}

func (s *Server) handleAnswer(w http.ResponseWriter, r *http.Request) {
	id := s.participant(w, r)
	added := s.hub.AddComment(id, r.PathValue("id"), r.FormValue("text"))
	me, _ := s.hub.Who(id)
	s.renderFragment(w, "answer-box", map[string]any{
		"Sent":    added,
		"Problem": writingProblem(me, s.hub.Snapshot()),
	})
}

func (s *Server) handleUpvoteAnswer(w http.ResponseWriter, r *http.Request) {
	s.hub.UpvoteComment(s.participant(w, r), r.PathValue("id"), r.PathValue("cid"))
	s.renderFragment(w, "questions", s.hub.Snapshot())
}

// handleStream pushes rendered HTML fragments over SSE. htmx swaps them in,
// so there is no hand-written JavaScript for the live parts.
func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming nieobsługiwany", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	panel := r.URL.Query().Get("widok") == "panel"
	updates, unsubscribe := s.hub.Subscribe()
	defer unsubscribe()

	lastPollVersion := -1
	for {
		select {
		case <-r.Context().Done():
			return
		case snap := <-updates:
			view := pollView(s.lib(), snap)
			if snap.PollVersion != lastPollVersion {
				// The question itself changed, so everyone gets a fresh
				// voting card. Plain vote updates must not do this, or we
				// would wipe out "you voted" on other people's screens.
				lastPollVersion = snap.PollVersion
				s.sendEvent(w, "vote", "vote-card", view)
			}
			s.sendEvent(w, "results", "poll-results", view)
			if panel {
				s.sendEvent(w, "questions", "panel-questions", snap)
				s.sendEvent(w, "moderation", "panel-moderation", snap)
			} else {
				s.sendEvent(w, "questions", "questions", snap)
			}
			flusher.Flush()
		}
	}
}

func (s *Server) sendEvent(w http.ResponseWriter, event, tplName string, data any) {
	html, err := s.templates().fragment(tplName, data)
	if err != nil {
		log.Printf("render %s: %v", tplName, err)
		return
	}
	var b strings.Builder
	b.WriteString("event: " + event + "\n")
	for _, line := range strings.Split(html, "\n") {
		b.WriteString("data: " + line + "\n")
	}
	b.WriteString("\n")
	_, _ = w.Write([]byte(b.String()))
}

// --- presenter panel -----------------------------------------------------

func (s *Server) requirePanel(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if token := r.URL.Query().Get("token"); token != "" {
			if token != s.opts.PanelToken {
				http.Error(w, "zły token", http.StatusForbidden)
				return
			}
			http.SetCookie(w, &http.Cookie{
				Name: "panel", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode,
			})
			http.Redirect(w, r, "/panel", http.StatusSeeOther)
			return
		}
		c, err := r.Cookie("panel")
		if err != nil || c.Value != s.opts.PanelToken {
			http.Error(w, "panel prowadzącego: dopisz ?token=...", http.StatusForbidden)
			return
		}
		next(w, r)
	}
}

func (s *Server) handlePanel(w http.ResponseWriter, r *http.Request) {
	lib := s.lib()
	snap := s.hub.Snapshot()
	s.render(w, r, "panel", map[string]any{
		"Title": "Panel prowadzącego",
		"Lib":   lib,
		"Poll":  pollView(lib, snap),
		"Snap":  snap,
	})
}

func (s *Server) handlePanelPoll(w http.ResponseWriter, r *http.Request) {
	switch r.FormValue("action") {
	case "show":
		s.hub.SetPoll(r.FormValue("poll"), true)
	case "close":
		s.hub.SetPoll(r.FormValue("poll"), false)
	case "hide":
		s.hub.SetPoll("", false)
	case "reset":
		s.hub.ResetPoll()
	}
	s.renderFragment(w, "panel-controls", map[string]any{
		"Lib":  s.lib(),
		"Poll": pollView(s.lib(), s.hub.Snapshot()),
	})
}

func (s *Server) handlePanelQuestion(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	switch r.PathValue("action") {
	case "odpowiedziane":
		s.hub.MarkAnswered(id)
	case "usun":
		s.hub.DeleteQuestion(id)
	}
	s.renderFragment(w, "panel-questions", s.hub.Snapshot())
}

func (s *Server) handlePanelDeleteAnswer(w http.ResponseWriter, r *http.Request) {
	s.hub.DeleteComment(r.PathValue("id"), r.PathValue("cid"))
	s.renderFragment(w, "panel-questions", s.hub.Snapshot())
}

// handlePanelLock closes or opens writing for the whole room at once. Voting
// and upvoting keep working - the switch is for "stop typing, listen".
func (s *Server) handlePanelLock(w http.ResponseWriter, r *http.Request) {
	s.hub.SetQuestionsLocked(r.FormValue("locked") == "tak")
	s.renderFragment(w, "panel-moderation", s.hub.Snapshot())
}

// handlePanelParticipant bans and unbans one person. A ban never deletes what
// they already wrote - the question list has its own "usuń" for that.
func (s *Server) handlePanelParticipant(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	switch r.PathValue("action") {
	case "ban":
		s.hub.BanParticipant(id, true)
	case "odbanuj":
		s.hub.BanParticipant(id, false)
	case "ban-ip":
		s.hub.BanIP(id, true)
	case "odbanuj-ip":
		s.hub.BanIP(id, false)
	}
	s.renderFragment(w, "panel-moderation", s.hub.Snapshot())
}

// --- helpers -------------------------------------------------------------

// participant is an anonymous per-browser id, used to keep votes honest
// (one vote per person) without asking anybody to log in.
func (s *Server) participant(w http.ResponseWriter, r *http.Request) string {
	if c, err := r.Cookie("uczestnik"); err == nil && c.Value != "" {
		return c.Value
	}
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "anon"
	}
	id := hex.EncodeToString(buf)
	http.SetCookie(w, &http.Cookie{
		Name: "uczestnik", Value: id, Path: "/", HttpOnly: true,
		MaxAge: 60 * 60 * 12, SameSite: http.SameSiteLaxMode,
	})
	return id
}

// clientIP is the address the ban list works on. Behind a reverse proxy the
// real one is in X-Forwarded-For; its first entry is the client.
func clientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		first, _, _ := strings.Cut(forwarded, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// writingProblem says, in one sentence meant for the audience, why the boxes
// for writing are closed right now. Empty means: write away.
func writingProblem(me live.Participant, snap live.Snapshot) string {
	switch {
	case me.Blocked():
		return "Prowadzący wyłączył ci pisanie. Głosować i podbijać dalej możesz."
	case snap.QuestionsLocked:
		return "Pytania są chwilowo zamknięte. Głosować i podbijać dalej możesz."
	}
	return ""
}

func (s *Server) notFound(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotFound)
	s.render(w, r, "notfound", map[string]any{"Title": "Nie ma takiej strony"})
}
