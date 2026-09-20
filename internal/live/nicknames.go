package live

import (
	"math/rand/v2"
	"strconv"
)

// Ksywki są losowe, ale nie anonimowe do bólu: dzięki nim widać, że dwa
// pytania są od tej samej osoby, a prowadzący ma co powiedzieć na głos
// ("odpowiadam zgubionemu-pakietowi"). Każdy może sobie swoją zmienić.
var (
	nickAdjectives = []string{
		"zgubiony", "zapętlony", "flapujący", "zdublowany", "opóźniony",
		"rozgłoszony", "zaszyfrowany", "przeciążony", "wycofany", "zafiltrowany",
		"asymetryczny", "redundantny", "pofragmentowany", "zbuforowany", "niestabilny",
		"uparty", "szybki", "leniwy", "cichy", "zagubiony",
	}
	nickNouns = []string{
		"pakiet", "router", "prefiks", "peer", "tunel", "switch", "bit",
		"nagłówek", "most", "kabel", "port", "węzeł", "rekord", "fragment",
		"agregat", "sąsiad", "licznik", "bufor", "próbnik", "next-hop",
	}
)

const maxNickLen = 24

// freeNickLocked losuje ksywkę, której nikt jeszcze nie ma. Po kilku próbach
// dokleja numer, żeby na pewno się skończyło.
func (h *Hub) freeNickLocked() string {
	for attempt := 0; attempt < 20; attempt++ {
		nick := nickAdjectives[rand.IntN(len(nickAdjectives))] + "-" +
			nickNouns[rand.IntN(len(nickNouns))]
		if !h.nickTakenLocked(nick, "") {
			return nick
		}
	}
	base := nickAdjectives[rand.IntN(len(nickAdjectives))] + "-" +
		nickNouns[rand.IntN(len(nickNouns))]
	for i := 2; ; i++ {
		nick := base + "-" + strconv.Itoa(i)
		if !h.nickTakenLocked(nick, "") {
			return nick
		}
	}
}

// nickTakenLocked sprawdza, czy ksywkę ma już ktoś inny niż except.
func (h *Hub) nickTakenLocked(nick, except string) bool {
	for id, p := range h.participants {
		if id != except && p.Nick == nick {
			return true
		}
	}
	return false
}
