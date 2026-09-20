package web

import (
	"bytes"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"path"
	"strings"

	"wykladywiet/internal/content"
	"wykladywiet/internal/live"
)

// templates holds one template set per page (base + partials + the page) and
// one set with just the partials, used for the htmx/SSE fragments.
type templates struct {
	pages map[string]*template.Template
	frags *template.Template
}

var funcs = template.FuncMap{
	"join": strings.Join,
	"noteTitle": func(lib *content.Library, slug string) string {
		if note, ok := lib.NoteBySlug[slug]; ok {
			return note.Title
		}
		return slug
	},
	"taskTitle": func(lib *content.Library, slug string) string {
		if task, ok := lib.TaskBySlug[slug]; ok {
			return task.Title
		}
		return slug
	},
	"topologyTitle": func(lib *content.Library, slug string) string {
		if topo, ok := lib.TopologyBySlug[slug]; ok {
			return topo.Title
		}
		return slug
	},
	"pollQuestion": func(lib *content.Library, id string) string {
		if poll, ok := lib.PollByID[id]; ok {
			return poll.Question
		}
		return id
	},
	"add": func(a, b int) int { return a + b },
}

func parseTemplates(files fs.FS) (*templates, error) {
	pageFiles, err := fs.Glob(files, "templates/pages/*.html")
	if err != nil {
		return nil, err
	}
	t := &templates{pages: map[string]*template.Template{}}
	for _, page := range pageFiles {
		name := strings.TrimSuffix(path.Base(page), ".html")
		set, err := template.New("base.html").Funcs(funcs).ParseFS(files,
			"templates/base.html", "templates/partials/*.html", page)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", page, err)
		}
		t.pages[name] = set
	}
	frags, err := template.New("partials").Funcs(funcs).ParseFS(files, "templates/partials/*.html")
	if err != nil {
		return nil, err
	}
	t.frags = frags
	return t, nil
}

func (t *templates) fragment(name string, data any) (string, error) {
	var buf bytes.Buffer
	if err := t.frags.ExecuteTemplate(&buf, name, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// templates returns the parsed templates, re-reading them in -dev mode.
func (s *Server) templates() *templates {
	if !s.opts.Dev {
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.tpl
	}
	tpl, err := parseTemplates(s.opts.Files)
	if err != nil {
		log.Printf("template reload failed, using last good copy: %v", err)
		s.mu.RLock()
		defer s.mu.RUnlock()
		return s.tpl
	}
	s.mu.Lock()
	s.tpl = tpl
	s.mu.Unlock()
	return tpl
}

// defaultDescription is what Facebook, Messenger and Slack show when somebody
// pastes a link to the site. Every page gets it unless it sets its own - an
// empty preview under a shared link is a wasted poster.
const defaultDescription = "Otwarte wykłady na WIET AGH o pracy w cloud networkingu: " +
	"prawdziwe incydenty, BGP, centra obliczeniowe i klastry GPU. Wstęp wolny, bez zapisów."

// baseURL is the address this page was reached at, taken from the request so
// that nothing has to be configured. Facebook and Slack refuse to fetch a
// relative og:image, so the preview needs the whole thing spelled out.
func baseURL(r *http.Request) string {
	scheme := "http"
	if forwarded := r.Header.Get("X-Forwarded-Proto"); forwarded != "" {
		scheme = forwarded
	} else if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host
}

func (s *Server) render(w http.ResponseWriter, r *http.Request, page string, data map[string]any) {
	tpl := s.templates()
	set, ok := tpl.pages[page]
	if !ok {
		http.Error(w, "brak szablonu "+page, http.StatusInternalServerError)
		return
	}
	data["Path"] = r.URL.Path
	data["BaseURL"] = baseURL(r)
	if _, ok := data["Description"]; !ok {
		data["Description"] = defaultDescription
	}
	// Render into a buffer first: a template error halfway through would
	// otherwise leave a half-written page on the wire.
	var buf bytes.Buffer
	if err := set.ExecuteTemplate(&buf, "base.html", data); err != nil {
		log.Printf("render %s: %v", page, err)
		http.Error(w, "błąd renderowania strony", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = buf.WriteTo(w)
}

func (s *Server) renderFragment(w http.ResponseWriter, name string, data any) {
	html, err := s.templates().fragment(name, data)
	if err != nil {
		log.Printf("render %s: %v", name, err)
		http.Error(w, "błąd renderowania", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(html))
}

// --- view models ---------------------------------------------------------

// AskView and NickView are per-browser: one person's nickname and whether
// they in particular may write. That is why neither is ever pushed over SSE -
// the stream carries one shared copy of the HTML for the whole room.
type AskView struct {
	Me      live.Participant
	Problem string // why writing is off; empty means the form is shown
	Sent    bool
}

type NickView struct {
	Me    live.Participant
	Error string // shown next to the field, e.g. nickname already taken
	Saved bool
}

// PollView is the live poll as the templates want it: the question from the
// content files merged with the counts from the hub.
type PollView struct {
	Poll    *content.Poll
	Open    bool
	Total   int
	Chosen  string // option picked by this particular browser, if any
	Results []OptionResult
}

type OptionResult struct {
	ID      string
	Text    string
	Count   int
	Percent int
	Leading bool
}

func (v PollView) Active() bool { return v.Poll != nil }

func pollView(lib *content.Library, snap live.Snapshot) PollView {
	poll, ok := lib.PollByID[snap.PollID]
	if !ok {
		return PollView{}
	}
	view := PollView{Poll: poll, Open: snap.Open, Total: snap.Total}
	best := 0
	for _, opt := range poll.Options {
		if snap.Tally[opt.ID] > best {
			best = snap.Tally[opt.ID]
		}
	}
	for _, opt := range poll.Options {
		count := snap.Tally[opt.ID]
		percent := 0
		if snap.Total > 0 {
			percent = count * 100 / snap.Total
		}
		view.Results = append(view.Results, OptionResult{
			ID:      opt.ID,
			Text:    opt.Text,
			Count:   count,
			Percent: percent,
			Leading: count > 0 && count == best,
		})
	}
	return view
}
