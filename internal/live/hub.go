// Package live keeps the state that changes while a lecture is running:
// which question is on screen, how the room voted, and what the audience
// asked. Everything lives in memory - a lecture is short and losing the
// state on restart is not a problem.
package live

import (
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
	ID        string
	Nick      string
	IP        string
	Banned    bool // banned by id (a cookie - easy to dodge, enough for a lecture)
	IPBanned  bool // their address is on the ban list
	Questions int
	Answers   int
	LastSeen  time.Time
}

// Blocked says whether this person may still write anything.
func (p Participant) Blocked() bool { return p.Banned || p.IPBanned }

// Question is a question from the audience, signed with a nickname.
type Question struct {
	ID       string
	Text     string
	Author   string // participant id, so the presenter can ban the author
	Nick     string
	Votes    int
	Answered bool
	Created  time.Time
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
	// QuestionsLocked and Participants are for the presenter's panel; the
	// audience never sees a template that reads them.
	QuestionsLocked bool
	Participants    []Participant
}

type Hub struct {
	mu              sync.Mutex
	pollVersion     int
	pollID          string
	open            bool
	votes           map[string]map[string]string // poll -> participant -> option
	questions       map[string]*Question
	participants    map[string]*Participant
	bannedIPs       map[string]bool
	questionsLocked bool
	nextID          int
	subscribers     map[chan Snapshot]struct{}
}

func NewHub() *Hub {
	return &Hub{
		votes:        map[string]map[string]string{},
		questions:    map[string]*Question{},
		participants: map[string]*Participant{},
		bannedIPs:    map[string]bool{},
		subscribers:  map[chan Snapshot]struct{}{},
	}
}

// Subscribe returns a channel carrying the latest snapshot. The channel holds
// at most one pending snapshot: a slow reader gets the newest state, not a
// backlog of stale ones.
func (h *Hub) Subscribe() (<-chan Snapshot, func()) {
	ch := make(chan Snapshot, 1)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()

	ch <- h.Snapshot()

	return ch, func() {
		h.mu.Lock()
		delete(h.subscribers, ch)
		h.mu.Unlock()
	}
}

func (h *Hub) Snapshot() Snapshot {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.snapshotLocked()
}

func (h *Hub) snapshotLocked() Snapshot {
	tally := map[string]int{}
	total := 0
	for _, option := range h.votes[h.pollID] {
		tally[option]++
		total++
	}
	questions := make([]Question, 0, len(h.questions))
	for _, q := range h.questions {
		// Copy the comments: the snapshot travels outside the lock and must
		// not alias a slice we are still appending to.
		copied := *q
		copied.Comments = append([]Comment(nil), q.Comments...)
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
		if participants[i].Blocked() != participants[j].Blocked() {
			return participants[i].Blocked() // zbanowani na górze, do odbanowania
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
		QuestionsLocked: h.questionsLocked,
		Participants:    participants,
	}
}

func (h *Hub) broadcastLocked() {
	snap := h.snapshotLocked()
	for ch := range h.subscribers {
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

// BanParticipant silences one browser. The ban follows a cookie, so it is easy
// to dodge by clearing it - for a lecture hall that is enough, and BanIP is
// there when it is not.
func (h *Hub) BanParticipant(id string, banned bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if p, ok := h.participants[id]; ok {
		p.Banned = banned
		h.broadcastLocked()
	}
}

// BanIP silences the address a participant is on, including any browser that
// shows up on it later. The panel deals in people, not in addresses, so it
// takes a participant id like BanParticipant does.
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

// SetQuestionsLocked closes the whole Q&A - useful when the room starts
// writing during someone else's talk, or when the lecture is over. Voting
// still works, only writing stops.
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

// blockedLocked says whether this participant is banned, by id or by address.
func (h *Hub) blockedLocked(id string) bool {
	p, ok := h.participants[id]
	if !ok {
		return false
	}
	return p.Banned || h.bannedIPs[p.IP]
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
	if h.questionsLocked || h.blockedLocked(participant) {
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

func (h *Hub) DeleteQuestion(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.questions, id)
	h.broadcastLocked()
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
	if !ok || h.questionsLocked || h.blockedLocked(participant) {
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
func (h *Hub) Question(id string) (Question, bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	q, ok := h.questions[id]
	if !ok {
		return Question{}, false
	}
	copied := *q
	copied.Comments = append([]Comment(nil), q.Comments...)
	return copied, true
}
