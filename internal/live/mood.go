package live

import "time"

// Nastrój sali: dwa przyciski, którymi można powiedzieć "nie nadążam" albo
// "teraz rozumiem" bez przerywania wykładu. Nikt o to nie pyta - w odróżnieniu
// od ankiety nastrój nie jest pytaniem prowadzącego, tylko czymś, co sala mówi
// z własnej woli i w dowolnym momencie.
//
// Reakcja żyje pół minuty i sama znika. Dzięki temu miernik pokazuje, jak jest
// teraz, przy tym slajdzie, a nie sumuje całego wykładu - a nikt nie musi
// pamiętać, żeby "odkliknąć" swój wcześniejszy nastrój.
const (
	MoodLost  = "zgubilem-sie"
	MoodClear = "fajnie-wytlumaczone"
)

const moodWindow = 30 * time.Second

// MoodTally is how the room feels right now, ready for the bar on screen.
type MoodTally struct {
	Lost  int
	Clear int
	Total int    // Lost + Clear, czyli ilu ludzi w ogóle coś kliknęło
	Mine  string // co kliknął ten konkretny widz; puste = nic
}

// MineLost i MineClear mówią szablonowi, który przycisk podświetlić, żeby nie
// musiał porównywać nazw nastrojów z ręki.
func (t MoodTally) MineLost() bool  { return t.Mine == MoodLost }
func (t MoodTally) MineClear() bool { return t.Mine == MoodClear }

// LostPercent i ClearPercent dzielą pasek. Przy zerze reakcji pasek jest pusty
// i szablon pokazuje zamiast niego "cisza".
func (t MoodTally) LostPercent() int  { return t.percent(t.Lost) }
func (t MoodTally) ClearPercent() int { return t.percent(t.Clear) }

func (t MoodTally) percent(n int) int {
	if t.Total == 0 {
		return 0
	}
	return n * 100 / t.Total
}

// moodBoard trzyma po jednej aktualnej reakcji na osobę. Wszystkie metody są
// wołane spod muteksa huba - sam moodBoard nie ma własnego zamka.
type moodBoard struct {
	clicks map[string]moodClick
}

type moodClick struct {
	mood string
	when time.Time
}

func newMoodBoard() moodBoard { return moodBoard{clicks: map[string]moodClick{}} }

// set zapisuje reakcję. Kliknięcie tego samego przycisku jeszcze raz odnawia
// pół minuty ("dalej się gubię"), kliknięcie drugiego zastępuje poprzednią -
// w danej chwili człowiek czuje się jakoś jednoznacznie.
func (b moodBoard) set(participant, mood string, now time.Time) bool {
	if mood != MoodLost && mood != MoodClear {
		return false
	}
	b.clicks[participant] = moodClick{mood: mood, when: now}
	return true
}

// expire wyrzuca reakcje starsze niż okno i mówi, czy obrazek się przez to
// zmienił - czyli czy jest po co budzić całą salę.
func (b moodBoard) expire(now time.Time) (changed bool) {
	for id, click := range b.clicks {
		if now.Sub(click.when) >= moodWindow {
			delete(b.clicks, id)
			changed = true
		}
	}
	return changed
}

func (b moodBoard) tally(viewer string) MoodTally {
	t := MoodTally{Mine: b.clicks[viewer].mood}
	for _, click := range b.clicks {
		switch click.mood {
		case MoodLost:
			t.Lost++
		case MoodClear:
			t.Clear++
		}
	}
	t.Total = t.Lost + t.Clear
	return t
}
