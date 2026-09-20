package live

import (
	"testing"
	"time"
)

func TestMoodCountsTheLastHalfMinute(t *testing.T) {
	h := NewHub()
	h.React("ala", MoodLost)
	h.React("bob", MoodLost)
	h.React("cela", MoodClear)

	mood := h.SnapshotFor(Presenter).Mood
	if mood.Lost != 2 || mood.Clear != 1 || mood.Total != 3 {
		t.Fatalf("Mood = %+v", mood)
	}
	if mood.LostPercent() != 66 || mood.ClearPercent() != 33 {
		t.Errorf("pasek = %d%% / %d%%", mood.LostPercent(), mood.ClearPercent())
	}

	// Reakcje same gasną - bez tego miernik pokazywałby sumę całego wykładu
	// zamiast tego, jak jest przy tym slajdzie.
	h.SweepMoods(time.Now().Add(29 * time.Second))
	if got := h.SnapshotFor(Presenter).Mood.Total; got != 3 {
		t.Errorf("po 29 s zostało %d reakcji, chcę 3", got)
	}
	h.SweepMoods(time.Now().Add(31 * time.Second))
	if got := h.SnapshotFor(Presenter).Mood; got.Total != 0 {
		t.Errorf("po 31 s zostało %+v, chcę pustkę", got)
	}
}

// Jedna reakcja na osobę: drugi przycisk zmienia zdanie, ten sam odnawia pół
// minuty. Inaczej wystarczyłoby klikać, żeby przechylić pasek.
func TestMoodIsOneReactionPerPerson(t *testing.T) {
	h := NewHub()
	h.React("ala", MoodLost)
	h.React("ala", MoodLost)
	if got := h.SnapshotFor(Presenter).Mood.Lost; got != 1 {
		t.Errorf("Lost = %d, chcę 1", got)
	}

	h.React("ala", MoodClear)
	mood := h.SnapshotFor(Presenter).Mood
	if mood.Lost != 0 || mood.Clear != 1 {
		t.Errorf("zmiana zdania nie zastąpiła poprzedniej reakcji: %+v", mood)
	}

	h.React("ala", "wszystko-jedno")
	if got := h.SnapshotFor(Presenter).Mood.Total; got != 1 {
		t.Errorf("wymyślony nastrój trafił do miernika, Total = %d", got)
	}
}

// Każdy widzi te same liczby, ale podświetlony ma własny przycisk.
func TestMoodTellsEachViewerWhatTheyClicked(t *testing.T) {
	h := NewHub()
	h.React("ala", MoodLost)
	h.React("bob", MoodClear)

	if got := h.SnapshotFor(Viewer{ID: "ala"}).Mood; !got.MineLost() || got.MineClear() {
		t.Errorf("ala kliknęła „zgubiłem się”, a widzi %+v", got)
	}
	if got := h.SnapshotFor(Viewer{ID: "bob"}).Mood; !got.MineClear() {
		t.Errorf("bob kliknął „fajnie wytłumaczone”, a widzi %+v", got)
	}
	if got := h.SnapshotFor(Viewer{ID: "cela"}).Mood; got.Mine != "" {
		t.Errorf("cela nic nie kliknęła, a widzi %+v", got)
	}
	if got := h.SnapshotFor(Presenter).Mood; got.Mine != "" {
		t.Errorf("prowadzący nie jest salą: %+v", got)
	}
}

// Migawki różnią się tylko podświetlonym przyciskiem, więc sala rozpada się
// najwyżej na trzy grupy - a nie na jedną kopię na przeglądarkę.
func TestMoodDoesNotSplitTheRoomPerBrowser(t *testing.T) {
	h := NewHub()
	h.React("ala", MoodLost)
	h.React("bob", MoodLost)

	h.mu.Lock()
	defer h.mu.Unlock()
	keys := map[string]bool{}
	for _, id := range []string{"ala", "bob", "cela", "dawid"} {
		keys[h.viewKeyLocked(Viewer{ID: id})] = true
	}
	if len(keys) != 2 {
		t.Errorf("widoki sali = %v, chcę po jednym na kliknięty nastrój", keys)
	}
}

// Miernik budzi salę tylko wtedy, kiedy coś naprawdę wygasło - w przeciwnym
// razie co sekundę przepychalibyśmy wszystkim całą listę pytań.
func TestSweepingMoodsIsQuietWhenNothingExpired(t *testing.T) {
	h := NewHub()
	h.React("ala", MoodLost)
	updates, unsubscribe := h.Subscribe(Viewer{ID: "ala"})
	defer unsubscribe()
	<-updates // migawka powitalna

	h.SweepMoods(time.Now())
	select {
	case snap := <-updates:
		t.Errorf("niepotrzebne odświeżenie sali: %+v", snap.Mood)
	default:
	}

	h.SweepMoods(time.Now().Add(moodWindow))
	select {
	case snap := <-updates:
		if snap.Mood.Total != 0 {
			t.Errorf("Mood = %+v, chcę pustkę", snap.Mood)
		}
	default:
		t.Error("wygaśnięcie reakcji nie dotarło do sali")
	}
}
