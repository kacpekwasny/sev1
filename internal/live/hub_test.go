package live

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestOneVotePerParticipant(t *testing.T) {
	h := NewHub()
	h.SetPoll("fib", true)

	h.Vote("ala", "a")
	h.Vote("bob", "a")
	h.Vote("ala", "b") // zmiana zdania, nie drugi głos

	snap := h.Snapshot()
	if snap.Total != 2 {
		t.Errorf("Total = %d, chcę 2", snap.Total)
	}
	if snap.Tally["a"] != 1 || snap.Tally["b"] != 1 {
		t.Errorf("Tally = %v, chcę a:1 b:1", snap.Tally)
	}
}

func TestVoteIgnoredWhenPollClosed(t *testing.T) {
	h := NewHub()
	h.SetPoll("fib", false)
	if _, ok := h.Vote("ala", "a"); ok {
		t.Error("głos przyjęty mimo zamkniętego głosowania")
	}
	if h.Snapshot().Total != 0 {
		t.Error("policzono głos w zamkniętym głosowaniu")
	}
}

// Wersja pytania zmienia się tylko przy zmianie pytania, a nie przy głosach -
// dzięki temu strony widzów nie tracą zaznaczonej odpowiedzi.
func TestPollVersionChangesOnlyWithThePoll(t *testing.T) {
	h := NewHub()
	h.SetPoll("fib", true)
	before := h.Snapshot().PollVersion

	h.Vote("ala", "a")
	if got := h.Snapshot().PollVersion; got != before {
		t.Errorf("wersja zmieniła się po głosie: %d -> %d", before, got)
	}

	h.SetPoll("fib", false)
	if got := h.Snapshot().PollVersion; got == before {
		t.Error("wersja nie zmieniła się po zamknięciu głosowania")
	}
}

func TestResetClearsOnlyCurrentPoll(t *testing.T) {
	h := NewHub()
	h.SetPoll("p1", true)
	h.Vote("ala", "a")
	h.SetPoll("p2", true)
	h.Vote("bob", "a")

	h.ResetPoll() // czyści p2
	if h.Snapshot().Total != 0 {
		t.Error("p2 nie zostało wyzerowane")
	}
	h.SetPoll("p1", true)
	if h.Snapshot().Total != 1 {
		t.Error("reset skasował głosy innego pytania")
	}
}

func TestQuestionUpvotedOncePerParticipant(t *testing.T) {
	h := NewHub()
	h.AskQuestion("ala", "Czy SRv6 zastąpi MPLS?")
	id := h.Snapshot().Questions[0].ID

	h.UpvoteQuestion("ala", id) // autor już głosował
	h.UpvoteQuestion("bob", id)
	h.UpvoteQuestion("bob", id)

	if got := h.Snapshot().Questions[0].Votes; got != 2 {
		t.Errorf("Votes = %d, chcę 2", got)
	}
}

func TestEmptyQuestionRejected(t *testing.T) {
	h := NewHub()
	if h.AskQuestion("ala", "   ") {
		t.Error("puste pytanie zostało przyjęte")
	}
	if len(h.Snapshot().Questions) != 0 {
		t.Error("puste pytanie trafiło na listę")
	}
}

func TestQuestionsSortedByVotesAnsweredLast(t *testing.T) {
	h := NewHub()
	h.AskQuestion("ala", "pierwsze")
	h.AskQuestion("bob", "drugie")
	ids := map[string]string{}
	for _, q := range h.Snapshot().Questions {
		ids[q.Text] = q.ID
	}
	h.UpvoteQuestion("cyryl", ids["drugie"])
	h.MarkAnswered(ids["drugie"])

	questions := h.Snapshot().Questions
	if questions[0].Text != "pierwsze" {
		t.Errorf("odpowiedziane pytanie powinno spaść na dół: %v", questions)
	}
}

func TestAnswersFromTheAudience(t *testing.T) {
	h := NewHub()
	h.AskQuestion("ala", "Ile sesji w pełnej siatce?")
	id := h.Snapshot().Questions[0].ID

	if !h.AddComment("bob", id, "n(n-1)/2") {
		t.Fatal("odpowiedź nie została przyjęta")
	}
	h.AddComment("cyryl", id, "dużo")

	comments := h.Snapshot().Questions[0].Comments
	if len(comments) != 2 {
		t.Fatalf("Comments = %v", comments)
	}
	if comments[0].Votes != 1 {
		t.Errorf("autor powinien mieć własny głos, jest %d", comments[0].Votes)
	}
}

func TestAnswersSortedByVotes(t *testing.T) {
	h := NewHub()
	h.AskQuestion("ala", "pytanie")
	id := h.Snapshot().Questions[0].ID
	h.AddComment("bob", id, "słabsza")
	h.AddComment("cyryl", id, "lepsza")

	var better string
	for _, c := range h.Snapshot().Questions[0].Comments {
		if c.Text == "lepsza" {
			better = c.ID
		}
	}
	h.UpvoteComment("dawid", id, better)
	h.UpvoteComment("dawid", id, better) // drugi raz się nie liczy
	h.UpvoteComment("ala", id, better)

	comments := h.Snapshot().Questions[0].Comments
	if comments[0].Text != "lepsza" || comments[0].Votes != 3 {
		t.Errorf("kolejność lub liczba głosów zła: %+v", comments)
	}
}

func TestAnswerToUnknownQuestionRejected(t *testing.T) {
	h := NewHub()
	if h.AddComment("ala", "nie-ma", "cokolwiek") {
		t.Error("przyjęto odpowiedź na nieistniejące pytanie")
	}
}

func TestDeleteComment(t *testing.T) {
	h := NewHub()
	h.AskQuestion("ala", "pytanie")
	id := h.Snapshot().Questions[0].ID
	h.AddComment("bob", id, "zostaje")
	h.AddComment("cyryl", id, "do usunięcia")

	var doomed string
	for _, c := range h.Snapshot().Questions[0].Comments {
		if c.Text == "do usunięcia" {
			doomed = c.ID
		}
	}
	h.DeleteComment(id, doomed)

	comments := h.Snapshot().Questions[0].Comments
	if len(comments) != 1 || comments[0].Text != "zostaje" {
		t.Errorf("Comments = %+v", comments)
	}
}

// Snapshot wychodzi poza blokadę, więc nie może dzielić tablicy komentarzy
// z hubem - inaczej dopisanie odpowiedzi w trakcie renderowania to wyścig.
func TestSnapshotCommentsAreACopy(t *testing.T) {
	h := NewHub()
	h.AskQuestion("ala", "pytanie")
	id := h.Snapshot().Questions[0].ID
	h.AddComment("bob", id, "pierwsza")

	snap := h.Snapshot()
	snap.Questions[0].Comments[0].Text = "podmienione"

	if got := h.Snapshot().Questions[0].Comments[0].Text; got != "pierwsza" {
		t.Errorf("snapshot dzieli pamięć z hubem: %q", got)
	}
}

func TestJoinGivesEverybodyADifferentNick(t *testing.T) {
	h := NewHub()
	ala := h.Join("ala", "10.0.0.1")
	bob := h.Join("bob", "10.0.0.2")

	if ala.Nick == "" || bob.Nick == "" {
		t.Fatalf("puste ksywki: %q, %q", ala.Nick, bob.Nick)
	}
	if ala.Nick == bob.Nick {
		t.Errorf("dwie osoby dostały tę samą ksywkę %q", ala.Nick)
	}
	if again := h.Join("ala", "10.0.0.1"); again.Nick != ala.Nick {
		t.Errorf("ksywka zmieniła się przy odświeżeniu: %q -> %q", ala.Nick, again.Nick)
	}
}

func TestNickCanBeChangedButNotStolen(t *testing.T) {
	h := NewHub()
	h.Join("ala", "10.0.0.1")
	h.Join("bob", "10.0.0.2")

	if _, err := h.SetNick("ala", "  kacper  "); err != nil {
		t.Fatalf("SetNick: %v", err)
	}
	if me, _ := h.Who("ala"); me.Nick != "kacper" {
		t.Errorf("Nick = %q, chcę kacper (obcięte spacje)", me.Nick)
	}
	if _, err := h.SetNick("bob", "kacper"); err != ErrNickTaken {
		t.Errorf("err = %v, chcę ErrNickTaken", err)
	}
	if _, err := h.SetNick("ala", "   "); err != ErrNickEmpty {
		t.Errorf("err = %v, chcę ErrNickEmpty", err)
	}
}

// Ksywka jest liczona w znakach, nie w bajtach - inaczej obcięcie w środku
// polskiej litery daje na stronie krzaki.
func TestLongNickCutOnCharacters(t *testing.T) {
	h := NewHub()
	h.Join("ala", "10.0.0.1")
	me, err := h.SetNick("ala", strings.Repeat("ą", 40))
	if err != nil {
		t.Fatalf("SetNick: %v", err)
	}
	if got := utf8.RuneCountInString(me.Nick); got != maxNickLen {
		t.Errorf("długość = %d znaków, chcę %d", got, maxNickLen)
	}
	if !utf8.ValidString(me.Nick) {
		t.Errorf("ksywka nie jest poprawnym UTF-8: %q", me.Nick)
	}
}

// Pytania są podpisane ksywką z chwili napisania. Późniejsza zmiana ksywki
// nie przepisuje historii - sala pamięta, kto co powiedział.
func TestQuestionKeepsTheNickItWasSignedWith(t *testing.T) {
	h := NewHub()
	me := h.Join("ala", "10.0.0.1")
	h.AskQuestion("ala", "pytanie")
	if _, err := h.SetNick("ala", "ktos-inny"); err != nil {
		t.Fatalf("SetNick: %v", err)
	}

	if got := h.Snapshot().Questions[0].Nick; got != me.Nick {
		t.Errorf("Nick = %q, chcę %q", got, me.Nick)
	}
}

func TestBannedParticipantCannotWriteButCanStillVote(t *testing.T) {
	h := NewHub()
	h.Join("ala", "10.0.0.1")
	h.Join("troll", "10.0.0.2")
	h.AskQuestion("ala", "pytanie")
	id := h.Snapshot().Questions[0].ID

	h.BanParticipant("troll", true)

	if h.AskQuestion("troll", "spam") {
		t.Error("zbanowany napisał pytanie")
	}
	if h.AddComment("troll", id, "spam") {
		t.Error("zbanowany napisał odpowiedź")
	}
	h.UpvoteQuestion("troll", id)
	if got := h.Snapshot().Questions[0].Votes; got != 1 {
		t.Errorf("zbanowany podbił pytanie, Votes = %d", got)
	}

	h.SetPoll("fib", true)
	if _, ok := h.Vote("troll", "a"); !ok {
		t.Error("ban powinien zamykać pisanie, nie głosowanie w ankiecie")
	}

	h.BanParticipant("troll", false)
	if !h.AskQuestion("troll", "już się poprawiłem") {
		t.Error("odbanowany nadal nie może pisać")
	}
}

// Ban adresu łapie też kolejne przeglądarki z tego samego IP - na tym polega
// jego przewaga nad banem po ciasteczku, które wystarczy wyczyścić.
func TestIPBanCoversNewBrowsersFromThatAddress(t *testing.T) {
	h := NewHub()
	h.Join("pierwszy", "10.0.0.7")
	h.BanIP("pierwszy", true)

	h.Join("drugi", "10.0.0.7") // to samo IP, nowe ciasteczko
	if h.AskQuestion("drugi", "spam") {
		t.Error("nowe ciasteczko ominęło ban adresu")
	}
	h.Join("trzeci", "10.0.0.8")
	if !h.AskQuestion("trzeci", "normalne pytanie") {
		t.Error("ban adresu zablokował kogoś z innego IP")
	}

	h.BanIP("drugi", false) // odbanowanie z drugiej strony, ten sam adres
	if !h.AskQuestion("drugi", "dzięki") {
		t.Error("odbanowanie adresu nie zadziałało")
	}
}

func TestLockingQuestionsStopsWritingForEveryone(t *testing.T) {
	h := NewHub()
	h.Join("ala", "10.0.0.1")
	h.AskQuestion("ala", "pytanie")
	id := h.Snapshot().Questions[0].ID

	h.SetQuestionsLocked(true)
	if !h.Snapshot().QuestionsLocked {
		t.Error("panel nie widzi, że pytania są zamknięte")
	}
	if h.AskQuestion("ala", "drugie") {
		t.Error("przyjęto pytanie przy zamkniętym pisaniu")
	}
	if h.AddComment("ala", id, "odpowiedź") {
		t.Error("przyjęto odpowiedź przy zamkniętym pisaniu")
	}
	h.UpvoteQuestion("bob", id)
	if got := h.Snapshot().Questions[0].Votes; got != 2 {
		t.Errorf("podbijanie ma działać dalej, Votes = %d", got)
	}

	h.SetQuestionsLocked(false)
	if !h.AskQuestion("ala", "drugie") {
		t.Error("po otwarciu pytania nadal nie przechodzą")
	}
}

// Prowadzący musi widzieć w panelu, kto pisze i skąd - inaczej nie ma na czym
// oprzeć decyzji o banie.
func TestPanelSeesWhoWritesWithBannedFirst(t *testing.T) {
	h := NewHub()
	h.Join("ala", "10.0.0.1")
	h.Join("troll", "10.0.0.2")
	h.AskQuestion("ala", "pytanie")
	id := h.Snapshot().Questions[0].ID
	h.AddComment("ala", id, "sam sobie odpowiem")
	h.BanParticipant("troll", true)

	people := h.Snapshot().Participants
	if len(people) != 2 {
		t.Fatalf("Participants = %+v", people)
	}
	if !people[0].Blocked() || people[0].ID != "troll" {
		t.Errorf("zbanowany powinien być na górze listy: %+v", people)
	}
	var ala Participant
	for _, p := range people {
		if p.ID == "ala" {
			ala = p
		}
	}
	if ala.Questions != 1 || ala.Answers != 1 || ala.IP != "10.0.0.1" {
		t.Errorf("liczniki ali = %+v", ala)
	}
}

func TestSubscriberGetsCurrentStateAndUpdates(t *testing.T) {
	h := NewHub()
	updates, unsubscribe := h.Subscribe()
	defer unsubscribe()

	if snap := <-updates; snap.PollID != "" {
		t.Errorf("pierwszy snapshot powinien być pusty, jest %q", snap.PollID)
	}
	h.SetPoll("fib", true)
	if snap := <-updates; snap.PollID != "fib" {
		t.Errorf("PollID = %q, chcę fib", snap.PollID)
	}
}
