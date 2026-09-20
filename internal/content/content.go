// Package content loads the lecture materials from markdown files on disk.
//
// The whole site is driven by a handful of directories:
//
//	content/lectures   - one file per lecture (agenda + description)
//	content/notes      - Obsidian-style notes, linked with [[wikilinks]]
//	content/tasks      - take-home exercises with progressive hints
//	content/topologies - networks described as devices plus cabling rules
//
// plus content/polls.yaml with the questions asked live during a lecture.
package content

import (
	"bytes"
	"fmt"
	"html/template"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/renderer/html"
	"gopkg.in/yaml.v3"
)

// Lecture is a single meeting of the series.
type Lecture struct {
	Slug    string
	Title   string        `yaml:"title"`
	Number  int           `yaml:"number"`
	Date    string        `yaml:"date"`
	Place   string        `yaml:"place"`
	Status  string        `yaml:"status"` // planowany | najblizszy | odbyty
	Summary string        `yaml:"summary"`
	Agenda  []AgendaItem  `yaml:"agenda"`
	Body    template.HTML `yaml:"-"`
}

// Kolejne stany wykładu w serii. Sterują tym, co strona główna wysuwa na
// przód: promocja ma pokazywać najbliższy termin, a nie pierwszy z listy.
const (
	StatusPlanned = "planowany"
	StatusNext    = "najblizszy"
	StatusDone    = "odbyty"
)

// Upcoming is the lecture the front page advertises: the one marked as next,
// or - if nobody remembered to move the marker - the first one not yet given.
func (l *Library) Upcoming() *Lecture {
	for _, lec := range l.Lectures {
		if lec.Status == StatusNext {
			return lec
		}
	}
	for _, lec := range l.Lectures {
		if lec.Status != StatusDone {
			return lec
		}
	}
	return nil
}

// Poster is the date written the way the printed poster writes it:
// 2026-11-01, 18:00 becomes 01.11.2026 — 18:00. In the file the date stays
// sortable, on the entry page it has to look like the thing on the wall.
// A date in any other shape is passed through untouched.
func (l *Lecture) Poster() string {
	day, hour, ok := strings.Cut(l.Date, ", ")
	if !ok {
		return l.Date
	}
	when, err := time.Parse("2006-01-02", day)
	if err != nil {
		return l.Date
	}
	return when.Format("02.01.2006") + " — " + hour
}

// AgendaItem is one block of a lecture. It may point at the interactive poll
// that gets shown to the audience while this block is on screen.
type AgendaItem struct {
	Minutes    int      `yaml:"minutes"`
	Title      string   `yaml:"title"`
	Desc       string   `yaml:"desc"`
	Poll       string   `yaml:"poll"`
	Notes      []string `yaml:"notes"`
	Tasks      []string `yaml:"tasks"`
	Topologies []string `yaml:"topologies"`
}

// Note is one markdown file of the downloadable vault.
type Note struct {
	Slug      string
	Title     string   `yaml:"title"`
	Summary   string   `yaml:"summary"`
	Tags      []string `yaml:"tags"`
	Raw       string   // original file, served as-is for download
	Body      template.HTML
	Links     []string // wikilink targets that exist
	Missing   []string // wikilink targets without a file yet
	Backlinks []string
}

// Task is a take-home exercise based on a real problem from work.
type Task struct {
	Slug       string
	Title      string        `yaml:"title"`
	Summary    string        `yaml:"summary"`
	Difficulty string        `yaml:"difficulty"`
	Time       string        `yaml:"time"`
	Tags       []string      `yaml:"tags"`
	Links      []Link        `yaml:"links"`
	Hints      []Hint        `yaml:"hints"`
	Notes      []string      `yaml:"notes"`
	Raw        string        `yaml:"-"`
	Body       template.HTML `yaml:"-"`
}

type Link struct {
	Title string `yaml:"title"`
	URL   string `yaml:"url"`
}

// Hint is revealed one at a time, so that a stuck student can get unstuck
// without being handed the answer.
type Hint struct {
	Title string `yaml:"title"`
	Text  string `yaml:"text"`
	HTML  template.HTML
}

// Poll is a question thrown at the audience during the lecture.
type Poll struct {
	ID       string   `yaml:"id"`
	Lecture  string   `yaml:"lecture"`
	Question string   `yaml:"question"`
	Options  []Option `yaml:"options"`
	Reveal   string   `yaml:"reveal"` // shown by the presenter after closing
}

type Option struct {
	ID   string `yaml:"id"`
	Text string `yaml:"text"`
}

// Library is the whole site content, loaded in one go.
type Library struct {
	Lectures       []*Lecture
	Notes          []*Note
	NoteBySlug     map[string]*Note
	Tasks          []*Task
	TaskBySlug     map[string]*Task
	Topologies     []*Topology
	TopologyBySlug map[string]*Topology
	Polls          []*Poll
	PollByID       map[string]*Poll
	LectureBySlug  map[string]*Lecture
}

var markdown = goldmark.New(
	goldmark.WithExtensions(extension.GFM),
	goldmark.WithRendererOptions(html.WithUnsafe()), // content is written by us
)

// Load reads the whole content directory. Cheap enough to call on every
// request in -dev mode, so notes can be edited without a restart.
func Load(dir string) (*Library, error) {
	lib := &Library{
		NoteBySlug:     map[string]*Note{},
		TaskBySlug:     map[string]*Task{},
		TopologyBySlug: map[string]*Topology{},
		PollByID:       map[string]*Poll{},
		LectureBySlug:  map[string]*Lecture{},
	}
	if err := lib.loadLectures(filepath.Join(dir, "lectures")); err != nil {
		return nil, err
	}
	if err := lib.loadNotes(filepath.Join(dir, "notes")); err != nil {
		return nil, err
	}
	if err := lib.loadTasks(filepath.Join(dir, "tasks")); err != nil {
		return nil, err
	}
	if err := lib.loadTopologies(filepath.Join(dir, "topologies")); err != nil {
		return nil, err
	}
	if err := lib.loadPolls(filepath.Join(dir, "polls.yaml")); err != nil {
		return nil, err
	}
	return lib, nil
}

func (l *Library) loadLectures(dir string) error {
	return eachMarkdownFile(dir, func(slug, raw string) error {
		lec := &Lecture{Slug: slug}
		body, err := splitFrontMatter(raw, lec)
		if err != nil {
			return fmt.Errorf("%s: %w", slug, err)
		}
		lec.Body = renderMarkdown(body)
		if lec.Title == "" {
			lec.Title = slug
		}
		l.Lectures = append(l.Lectures, lec)
		l.LectureBySlug[slug] = lec
		return nil
	})
}

func (l *Library) loadNotes(dir string) error {
	err := eachMarkdownFile(dir, func(slug, raw string) error {
		note := &Note{Slug: slug, Raw: raw}
		body, err := splitFrontMatter(raw, note)
		if err != nil {
			return fmt.Errorf("%s: %w", slug, err)
		}
		linked, md := rewriteWikilinks(body)
		note.Body = renderMarkdown(md)
		note.Links = linked
		if note.Title == "" {
			note.Title = firstHeading(body, slug)
		}
		l.Notes = append(l.Notes, note)
		l.NoteBySlug[slug] = note
		return nil
	})
	if err != nil {
		return err
	}
	l.resolveLinks()
	return nil
}

// resolveLinks splits outgoing links into existing/missing and fills in
// backlinks, which is what makes the note set feel like a graph.
func (l *Library) resolveLinks() {
	backlinks := map[string]map[string]bool{}
	for _, note := range l.Notes {
		var exists []string
		for _, target := range note.Links {
			if _, ok := l.NoteBySlug[target]; !ok {
				note.Missing = append(note.Missing, target)
				continue
			}
			exists = append(exists, target)
			if backlinks[target] == nil {
				backlinks[target] = map[string]bool{}
			}
			backlinks[target][note.Slug] = true
		}
		note.Links = exists
	}
	for _, note := range l.Notes {
		for from := range backlinks[note.Slug] {
			note.Backlinks = append(note.Backlinks, from)
		}
		sort.Strings(note.Backlinks)
	}
}

func (l *Library) loadTasks(dir string) error {
	return eachMarkdownFile(dir, func(slug, raw string) error {
		task := &Task{Slug: slug, Raw: raw}
		body, err := splitFrontMatter(raw, task)
		if err != nil {
			return fmt.Errorf("%s: %w", slug, err)
		}
		_, md := rewriteWikilinks(body)
		task.Body = renderMarkdown(md)
		for i := range task.Hints {
			_, hintMD := rewriteWikilinks(task.Hints[i].Text)
			task.Hints[i].HTML = renderMarkdown(hintMD)
		}
		if task.Title == "" {
			task.Title = slug
		}
		l.Tasks = append(l.Tasks, task)
		l.TaskBySlug[slug] = task
		return nil
	})
}

func (l *Library) loadPolls(path string) error {
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	var polls []*Poll
	if err := yaml.Unmarshal(raw, &polls); err != nil {
		return fmt.Errorf("polls.yaml: %w", err)
	}
	l.Polls = polls
	for _, p := range polls {
		l.PollByID[p.ID] = p
	}
	return nil
}

// Duration sums the agenda, so the lecture page can show "how long is this".
func (lec *Lecture) Duration() int {
	total := 0
	for _, item := range lec.Agenda {
		total += item.Minutes
	}
	return total
}

// GraphNode / GraphEdge feed the note graph drawn in the browser.
type GraphNode struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Tag   string `json:"tag"`
	Size  int    `json:"size"`
}

type GraphEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type Graph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

func (l *Library) Graph() Graph {
	g := Graph{Nodes: []GraphNode{}, Edges: []GraphEdge{}}
	for _, note := range l.Notes {
		tag := ""
		if len(note.Tags) > 0 {
			tag = note.Tags[0]
		}
		g.Nodes = append(g.Nodes, GraphNode{
			ID:    note.Slug,
			Title: note.Title,
			Tag:   tag,
			Size:  len(note.Links) + len(note.Backlinks),
		})
		for _, target := range note.Links {
			g.Edges = append(g.Edges, GraphEdge{From: note.Slug, To: target})
		}
	}
	return g
}

// --- markdown plumbing ---------------------------------------------------

func eachMarkdownFile(dir string, fn func(slug, raw string) error) error {
	return eachFile(dir, ".md", fn)
}

// eachFile walks one content directory in file-name order, so the site always
// lists things in the same order. A missing directory is not an error: not
// every deployment has to have every kind of content.
func eachFile(dir, ext string, fn func(slug, raw string) error) error {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ext) {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		raw, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		slug := strings.TrimSuffix(name, ext)
		if err := fn(slug, string(raw)); err != nil {
			return err
		}
	}
	return nil
}

// splitFrontMatter decodes the leading `---` YAML block into out and returns
// the markdown that follows it.
func splitFrontMatter(raw string, out any) (string, error) {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	if !strings.HasPrefix(raw, "---\n") {
		return raw, nil
	}
	end := strings.Index(raw[4:], "\n---")
	if end < 0 {
		return raw, nil
	}
	header := raw[4 : 4+end]
	rest := raw[4+end+4:]
	if err := yaml.Unmarshal([]byte(header), out); err != nil {
		return "", err
	}
	return strings.TrimPrefix(rest, "\n"), nil
}

func renderMarkdown(src string) template.HTML {
	var buf bytes.Buffer
	if err := markdown.Convert([]byte(src), &buf); err != nil {
		return template.HTML(template.HTMLEscapeString(src))
	}
	return template.HTML(buf.String())
}

var wikilinkRe = regexp.MustCompile(`\[\[([^\]|]+)(?:\|([^\]]+))?\]\]`)

// rewriteWikilinks turns [[note]] / [[note|label]] into normal markdown links
// and reports every target it saw. Fenced code blocks are left alone.
func rewriteWikilinks(src string) (targets []string, out string) {
	var b strings.Builder
	seen := map[string]bool{}
	inFence := false
	for _, line := range strings.Split(src, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			inFence = !inFence
		}
		if !inFence {
			line = wikilinkRe.ReplaceAllStringFunc(line, func(m string) string {
				parts := wikilinkRe.FindStringSubmatch(m)
				target := Slugify(parts[1])
				label := parts[1]
				if parts[2] != "" {
					label = parts[2]
				}
				// A target with a folder, e.g. [[zadania/gobgp-pamiec]],
				// points outside the notes - link there and do not count it
				// as an edge of the note graph.
				if strings.Contains(target, "/") {
					return fmt.Sprintf("[%s](/%s)", label, target)
				}
				if !seen[target] {
					seen[target] = true
					targets = append(targets, target)
				}
				return fmt.Sprintf("[%s](/notatki/%s)", label, target)
			})
		}
		b.WriteString(line)
		b.WriteString("\n")
	}
	return targets, b.String()
}

// Slugify normalises a wikilink target to a file name.
func Slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, " ", "-")
	return strings.Trim(s, "/")
}

func firstHeading(src, fallback string) string {
	for _, line := range strings.Split(src, "\n") {
		if strings.HasPrefix(line, "# ") {
			return strings.TrimSpace(line[2:])
		}
	}
	return fallback
}
