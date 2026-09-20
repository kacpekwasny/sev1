// Package live keeps the state that changes while a lecture is running:
// which question is on screen, how the room voted, and what the audience
// asked. Everything lives in memory - a lecture is short and losing the
// state on restart is not a problem.
package live

import (
	"context"
	"errors"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Participant is one browser on the room. Nobody logs in - the id comes from
// a cookie and the nickname is drawn at random, so that questions from the
// same person can be recognised without asking anyone for a name.
type Participant struct {
	ID   string
	Nick string
	IP   string
	// Shadow is the quiet ban, keyed on a cookie: this person keeps writing
	// and keeps seeing their own questions, but nobody else ever does. An
	// argument with somebody who knows they were silenced costs more lecture
	// time than the spam did.
	Shadow bool
	// IPBanned is the loud one, keyed on the address: writing is refused and
	// the person is told so. It also catches the next browser from that
	// address, which a cookie ban cannot.
	IPBanned  bool
	Questions int
	Answers   int
	LastSeen  time.Time
}

// Blocked says whether this person is turned away when they try to write.
// A shadow-banned person is not blocked: their questions are accepted, they
// simply do not reach the room.
func (p Participant) Blocked() bool { return p.IPBanned }

// Restricted is "the presenter has done something about this person" - it
// sorts them to the top of the panel list, where they can be undone.
func (p Participant) Restricted() bool { return p.Shadow || p.IPBanned }

// Question is a question from the audience, signed with a nickname.
type Question struct {
	ID       string
	Text     string
	Author   string // participant id, so the presenter can ban the author
	Nick     string
	Votes    int
	Answered bool
	Created  time.Time
	// Shadow marks a question only the author can see. It is filled in for
	// the presenter's panel and nowhere else - a template that leaked it to
	// the audience would tell a shadow-banned person they were banned.
	Shadow bool
	// Comments are answers proposed by other people on the room, best voted
	// first. In a snapshot this is always a private copy.
	Comments []Comment

	voters map[string]bool
}

// Comment is an answer to a question, written by somebody in the audience.
// Often the room knows better and faster than the presenter.
type Comment struct {
	ID      string
	Text    string
	Author  string
	Nick    string
	Votes   int
	Created time.Time
	Shadow  bool // jak w Question: tylko dla panelu

	voters map[string]bool
}

// Snapshot is what every connected browser gets after any change.
type Snapshot struct {
	// PollVersion changes only when the presenter switches or opens/closes a
	// poll - not on every vote. That lets a browser keep showing "you voted"
	// instead of having the voting form pushed back over it.
	PollVersion int
	PollID      string
	Open        bool
	Tally       map[string]int
	Total       int
	Questions   []Question
	// Mood is the last half minute of "zgubiłem się" / "fajnie wytłumaczone",
	// including which of the two this particular viewer clicked.
	Mood MoodTally
	// OnAir says the lecture is happening right now. The presenter flips it
	// on in the panel and the whole site starts showing the red dot.
	OnAir bool
	// Participants are for the presenter's panel; QuestionsLocked also lets the
	// audience status card explain why writing is unavailable.
	QuestionsLocked bool
	Participants    []Participant
}

// Viewer says whose eyes a snapshot is built for. Almost everybody sees the
// same lecture; the two exceptions are the presenter, who sees everything,
// and a shadow-banned person, who sees their own questions as if the room
// could read them.
type Viewer struct {
	ID        string // uczestnik (ciasteczko)
	Presenter bool   // panel prowadzącego
}

// Presenter is the view with nothing filtered out.
var Presenter = Viewer{Presenter: true}

type Hub struct {
	mu              sync.Mutex
	pollVersion     int
	pollID          string
	open            bool
	votes           map[string]map[string]string // poll -> participant -> option
	questions       map[string]*Question
	participants    map[string]*Participant
	moods           moodBoard // patrz mood.go
	bannedIPs       map[string]bool
	onAir           bool
	questionsLocked bool
	nextID          int
	subscribers     map[chan Snapshot]Viewer
}

func NewHub() *Hub {
	return &Hub{
		votes:        map[string]map[string]string{},
		questions:    map[string]*Question{},
		participants: map[string]*Participant{},
		moods:        newMoodBoard(),
		bannedIPs:    map[string]bool{},
		subscribers:  map[chan Snapshot]Viewer{},
	}
}

// Subscribe returns a channel carrying the latest snapshot, as seen by v. The
// channel holds at most one pending snapshot: a slow reader gets the newest
// state, not a backlog of stale ones.
func (h *Hub) Subscribe(v Viewer) (<-chan Snapshot, func()) {
	ch := make(chan Snapshot, 1)
	h.mu.Lock()
	h.subscribers[ch] = v
	h.mu.Unlock()

	ch <- h.SnapshotFor(v)

	return ch, func() {
		h.mu.Lock()
		delete(h.subscribers, ch)
		h.mu.Unlock()
	}
}

// SnapshotFor is the state of the lecture as v is allowed to see it.
func (h *Hub) SnapshotFor(v Viewer) Snapshot {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.snapshotLocked(v)
}

func (h *Hub) snapshotLocked(v Viewer) Snapshot {
	tally := map[string]int{}
	total := 0
	for _, option := range h.votes[h.pollID] {
		tally[option]++
		total++
	}
	questions := make([]Question, 0, len(h.questions))
	for _, q := range h.questions {
		if !h.visibleTo(v, q.Author) {
			continue
		}
		// Copy the comments: the snapshot travels outside the lock and must
		// not alias a slice we are still appending to.
		copied := *q
		copied.Shadow = v.Presenter && h.shadowedLocked(q.Author)
		copied.Comments = nil
		for _, c := range q.Comments {
			if !h.visibleTo(v, c.Author) {
				continue
			}
			c.Shadow = v.Presenter && h.shadowedLocked(c.Author)
			copied.Comments = append(copied.Comments, c)
		}
		sort.Slice(copied.Comments, func(i, j int) bool {
			if copied.Comments[i].Votes != copied.Comments[j].Votes {
				return copied.Comments[i].Votes > copied.Comments[j].Votes
			}
			return copied.Comments[i].Created.Before(copied.Comments[j].Created)
		})
		questions = append(questions, copied)
	}
	sort.Slice(questions, func(i, j int) bool {
		if questions[i].Answered != questions[j].Answered {
			return !questions[i].Answered // unanswered first
		}
		if questions[i].Votes != questions[j].Votes {
			return questions[i].Votes > questions[j].Votes
		}
		return questions[i].Created.Before(questions[j].Created)
	})
	participants := make([]Participant, 0, len(h.participants))
	for _, p := range h.participants {
		copied := *p
		copied.IPBanned = h.bannedIPs[p.IP]
		participants = append(participants, copied)
	}
	sort.Slice(participants, func(i, j int) bool {
		if participants[i].Restricted() != participants[j].Restricted() {
			return participants[i].Restricted() // ukarani na górze, do odkręcenia
		}
		return participants[i].LastSeen.After(participants[j].LastSeen)
	})

	return Snapshot{
		PollVersion:     h.pollVersion,
		PollID:          h.pollID,
		Open:            h.open,
		Tally:           tally,
		Total:           total,
		Questions:       questions,
		Mood:            h.moods.tally(v.ID),
		OnAir:           h.onAir,
		QuestionsLocked: h.questionsLocked,
		Participants:    participants,
	}
}

// broadcastLocked sends every open stream its own view of the state. The room
// nearly always sees one and the same thing, so the snapshot is built once per
// distinct view - once for the room, plus one for the panel and one for each
// shadow-banned person who happens to be watching.
func (h *Hub) broadcastLocked() {
	built := map[string]Snapshot{}
	for ch, v := range h.subscribers {
		key := h.viewKeyLocked(v)
		snap, ok := built[key]
		if !ok {
			snap = h.snapshotLocked(v)
			built[key] = snap
		}
		push(ch, snap)
	}
}

// viewKeyLocked groups together the subscribers who see exactly the same
// thing. Participant ids are hex, so neither marker can collide with one.
//
// Sala różni się tylko tym, który przycisk nastroju sama kliknęła, więc
// rozpada się najwyżej na trzy grupy - a nie na tyle kopii, ile przeglądarek.
func (h *Hub) viewKeyLocked(v Viewer) string {
	switch {
	case v.Presenter:
		return "!panel"
	case h.shadowedLocked(v.ID):
		return v.ID
	default:
		return "!sala " + h.moods.clicks[v.ID].mood
	}
}

func push(ch chan Snapshot, snap Snapshot) {
	select {
	case ch <- snap:
	default: // drop the stale one, push the fresh one
		select {
		case <-ch:
		default:
		}
		select {
		case ch <- snap:
		default:
		}
	}
}

// visibleTo answers the one question a shadow ban asks: may this viewer see
// what author wrote? Everybody sees ordinary people, the presenter sees
// everybody, and a shadow-banned person sees themselves.
func (h *Hub) visibleTo(v Viewer, author string) bool {
	return v.Presenter || author == v.ID || !h.shadowedLocked(author)
}

func (h *Hub) shadowedLocked(id string) bool {
	p, ok := h.participants[id]
	return ok && p.Shadow
}

// Join registers a browser (or refreshes what we know about it) and returns
// what to show it: its nickname and whether it is allowed to write. Called on
// every page load of /live/, so the presenter's list stays current.
func (h *Hub) Join(id, ip string) Participant {
	h.mu.Lock()
	defer h.mu.Unlock()
	p, ok := h.participants[id]
	if !ok {
		p = &Participant{ID: id, Nick: h.freeNickLocked()}
		h.participants[id] = p
	}
	p.IP = ip
	p.LastSeen = time.Now()

	copied := *p
	copied.IPBanned = h.bannedIPs[ip]
	h.broadcastLocked()
	return copied
}

// Renaming can fail in three ways; the form shows the message back to the
// person typing, so these are written for them and not for a log.
var (
	ErrNickTaken    = errors.New("ktoś już ma taką ksywkę")
	ErrNickEmpty    = errors.New("ksywka nie może być pusta")
	ErrNoSuchPerson = errors.New("odśwież stronę i spróbuj jeszcze raz")
)

// SetNick renames a participant. Old questions keep the nickname they were
// signed with - rewriting history would be more surprising than helpful.
func (h *Hub) SetNick(id, nick string) (Participant, error) {
	nick = trim(nick, maxNickLen)
	h.mu.Lock()
	defer h.mu.Unlock()
	p, ok := h.participants[id]
	if !ok {
		return Participant{}, ErrNoSuchPerson
	}
	current := *p
	current.IPBanned = h.bannedIPs[p.IP]
	if nick == "" {
		return current, ErrNickEmpty
	}
	if h.nickTakenLocked(nick, id) {
		return current, ErrNickTaken
	}
	p.Nick = nick
	p.LastSeen = time.Now()

	copied := *p
	copied.IPBanned = h.bannedIPs[p.IP]
	h.broadcastLocked()
	return copied, nil
}

// Who returns what we know about a participant without registering them.
func (h *Hub) Who(id string) (Participant, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	p, ok := h.participants[id]
	if !ok {
		return Participant{}, false
	}
	copied := *p
	copied.IPBanned = h.bannedIPs[p.IP]
	return copied, true
}

// SetShadow hides one browser from the room without telling it. Everything
// this person writes is still accepted, still signed, still counted on the
// panel - it just stops at the server. Undoing it brings back everything they
// wrote in the meantime, because nothing was thrown away.
//
// The ban follows a cookie, so clearing it dodges the ban; that is fine,
// because the point is not to build a wall, it is to stop a conversation
// nobody in the room needs to watch. BanIP is there for the determined.
func (h *Hub) SetShadow(id string, shadow bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if p, ok := h.participants[id]; ok {
		p.Shadow = shadow
		h.broadcastLocked()
	}
}

// BanIP silences the address a participant is on, including any browser that
// shows up on it later. The panel deals in people, not in addresses, so it
// takes a participant id, just like SetShadow.
func (h *Hub) BanIP(participant string, banned bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	p, ok := h.participants[participant]
	if !ok || p.IP == "" {
		return
	}
	if banned {
		h.bannedIPs[p.IP] = true
	} else {
		delete(h.bannedIPs, p.IP)
	}
	h.broadcastLocked()
}

// React records how one person feels right now. It is not writing, so - like
// voting in a poll - even a banned person gets to do it: one reaction per
// person means there is nothing here to spam with.
func (h *Hub) React(participant, mood string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.moods.set(participant, mood, time.Now()) {
		h.broadcastLocked()
	}
}

// SweepMoods lets reactions fade. The hub has no clock of its own, so somebody
// has to call this; WatchMoods is that somebody. Nothing else would ever
// trigger the update, and the whole point of the meter is that it drops back
// to silence when the room stops clicking.
func (h *Hub) SweepMoods(now time.Time) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.moods.expire(now) {
		h.broadcastLocked()
	}
}

// WatchMoods expires reactions once a second until ctx is done. A second is
// finer than anybody can read off a bar, and coarse enough to be free.
func (h *Hub) WatchMoods(ctx context.Context) {
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-tick.C:
			h.SweepMoods(now)
		}
	}
}

// SetQuestionsLocked closes the whole Q&A - useful when the room starts
// writing during someone else's talk, or when the lecture is over. Voting
// still works, only writing stops.
// SetOnAir marks the lecture as happening right now. It lights the red dot in
// the menu and opens the audience's question and answer forms.
func (h *Hub) SetOnAir(on bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.onAir = on
	h.broadcastLocked()
}

// OnAir is read while rendering the menu, which happens on every page, so it
// takes the lock and nothing else.
func (h *Hub) OnAir() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.onAir
}

func (h *Hub) SetQuestionsLocked(locked bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.questionsLocked = locked
	h.broadcastLocked()
}

// nickLocked is the name to sign a question with; unknown browsers (no page
// load registered yet) get a placeholder rather than an empty line.
func (h *Hub) nickLocked(id string) string {
	if p, ok := h.participants[id]; ok {
		return p.Nick
	}
	return "ktoś-z-sali"
}

// blockedLocked says whether writing should be refused outright. Note what is
// missing here: a shadow ban. A shadow-banned person writes exactly as before
// and their upvotes still count - if the numbers they see stopped moving,
// they would work out what happened, which is the one thing a shadow ban is
// supposed to avoid.
func (h *Hub) blockedLocked(id string) bool {
	p, ok := h.participants[id]
	return ok && h.bannedIPs[p.IP]
}

// SetPoll puts a question on screen (empty id = nothing on screen).
func (h *Hub) SetPoll(id string, open bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pollID, h.open = id, open
	h.pollVersion++
	h.broadcastLocked()
}

// Vote records one vote per participant; voting again changes the answer.
func (h *Hub) Vote(participant, option string) (pollID string, ok bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.pollID == "" || !h.open {
		return h.pollID, false
	}
	if h.votes[h.pollID] == nil {
		h.votes[h.pollID] = map[string]string{}
	}
	h.votes[h.pollID][participant] = option
	h.broadcastLocked()
	return h.pollID, true
}

// ResetPoll clears the answers of the poll currently on screen.
func (h *Hub) ResetPoll() {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.votes, h.pollID)
	h.pollVersion++
	h.broadcastLocked()
}

const maxQuestionLen = 400

// trim cuts input down to size, counting characters and not bytes - "ą" is two
// bytes, and cutting between them would produce broken text on the page.
func trim(text string, max int) string {
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) > max {
		return string(runes[:max])
	}
	return text
}

func (h *Hub) AskQuestion(participant, text string) bool {
	text = trim(text, maxQuestionLen)
	if text == "" {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if !h.onAir || h.questionsLocked || h.blockedLocked(participant) {
		return false
	}
	h.nextID++
	id := "q" + strconv.Itoa(h.nextID)
	h.questions[id] = &Question{
		ID:      id,
		Text:    text,
		Author:  participant,
		Nick:    h.nickLocked(participant),
		Votes:   1,
		Created: time.Now(),
		voters:  map[string]bool{participant: true},
	}
	if p, ok := h.participants[participant]; ok {
		p.Questions++
	}
	h.broadcastLocked()
	return true
}

// UpvoteQuestion counts one vote per participant, so the list really is
// ordered by what the room wants to hear.
func (h *Hub) UpvoteQuestion(participant, id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	q, ok := h.questions[id]
	if !ok || q.voters[participant] || h.blockedLocked(participant) {
		return
	}
	q.voters[participant] = true
	q.Votes++
	h.broadcastLocked()
}

func (h *Hub) MarkAnswered(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if q, ok := h.questions[id]; ok {
		q.Answered = !q.Answered
		h.broadcastLocked()
	}
}

// MarkAnsweredBy lets a question's author mark their own question as handled.
// The presenter uses MarkAnswered, because the panel is allowed to moderate
// every question.
func (h *Hub) MarkAnsweredBy(participant, id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	q, ok := h.questions[id]
	if !ok || q.Author != participant {
		return false
	}
	q.Answered = !q.Answered
	h.broadcastLocked()
	return true
}

func (h *Hub) DeleteQuestion(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.questions, id)
	h.broadcastLocked()
}

// DeleteQuestionBy lets an author remove only their own question. The
// presenter uses DeleteQuestion for moderation.
func (h *Hub) DeleteQuestionBy(participant, id string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	q, ok := h.questions[id]
	if !ok || q.Author != participant {
		return false
	}
	delete(h.questions, id)
	h.broadcastLocked()
	return true
}

// AddComment records an answer proposed by somebody in the audience. Like a
// question, it starts with its author's own vote.
func (h *Hub) AddComment(participant, questionID, text string) bool {
	text = trim(text, maxQuestionLen)
	if text == "" {
		return false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	q, ok := h.questions[questionID]
	if !ok || !h.onAir || h.questionsLocked || h.blockedLocked(participant) {
		return false
	}
	h.nextID++
	q.Comments = append(q.Comments, Comment{
		ID:      "c" + strconv.Itoa(h.nextID),
		Text:    text,
		Author:  participant,
		Nick:    h.nickLocked(participant),
		Votes:   1,
		Created: time.Now(),
		voters:  map[string]bool{participant: true},
	})
	if p, ok := h.participants[participant]; ok {
		p.Answers++
	}
	h.broadcastLocked()
	return true
}

// UpvoteComment lets the room say "yes, this is the answer" - one vote per
// participant, same rule as for questions.
func (h *Hub) UpvoteComment(participant, questionID, commentID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	q, ok := h.questions[questionID]
	if !ok || h.blockedLocked(participant) {
		return
	}
	for i := range q.Comments {
		if q.Comments[i].ID != commentID || q.Comments[i].voters[participant] {
			continue
		}
		q.Comments[i].voters[participant] = true
		q.Comments[i].Votes++
		h.broadcastLocked()
		return
	}
}

// DeleteComment is moderation for the presenter.
func (h *Hub) DeleteComment(questionID, commentID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	q, ok := h.questions[questionID]
	if !ok {
		return
	}
	kept := q.Comments[:0]
	for _, c := range q.Comments {
		if c.ID != commentID {
			kept = append(kept, c)
		}
	}
	q.Comments = kept
	h.broadcastLocked()
}

// Question returns a copy of one question, for rendering the answer form.
// It takes a viewer for the same reason the snapshot does: a shadowed
// question must not come back to somebody who guessed its id.
func (h *Hub) Question(v Viewer, id string) (Question, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	q, ok := h.questions[id]
	if !ok || !h.visibleTo(v, q.Author) {
		return Question{}, false
	}
	copied := *q
	copied.Comments = append([]Comment(nil), q.Comments...)
	return copied, true
}
