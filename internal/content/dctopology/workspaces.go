package dctopology

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"sync"
	"time"
)

const workspaceCookie = "sev1_dc_workspace"
const workspaceIdleLimit = 30 * time.Minute
const workspaceLimit = 16

type browserWorkspace struct {
	handler http.Handler
	usedAt  time.Time
}

// NewBrowserAPIHandler shares an immutable default snapshot with readers, and
// gives each browser its own in-memory configuration on its first write.
// Private examples expire after inactivity and are bounded to limit memory use.
func NewBrowserAPIHandler(initialYAML []byte, cookiePath string) (http.Handler, error) {
	config, err := ParseYAML(initialYAML)
	if err != nil {
		return nil, err
	}
	model, err := BuildTopology(config)
	if err != nil {
		return nil, err
	}
	defaultHandler := newAPIHandler(&configStore{config: config, snapshot: model, loaded: true}, initialYAML)
	var mu sync.Mutex
	workspaces := make(map[string]browserWorkspace)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		now := time.Now()
		mu.Lock()
		for id, workspace := range workspaces {
			if now.Sub(workspace.usedAt) > workspaceIdleLimit {
				delete(workspaces, id)
			}
		}
		id := ""
		if cookie, err := r.Cookie(workspaceCookie); err == nil {
			id = cookie.Value
		}
		workspace, exists := workspaces[id]
		if !exists && r.Method == http.MethodPost {
			var token [16]byte
			if _, err := rand.Read(token[:]); err != nil {
				mu.Unlock()
				http.Error(w, "nie udało się utworzyć scenariusza", http.StatusInternalServerError)
				return
			}
			if len(workspaces) >= workspaceLimit {
				oldestID, oldestTime := "", now
				for candidateID, candidate := range workspaces {
					if candidate.usedAt.Before(oldestTime) {
						oldestID, oldestTime = candidateID, candidate.usedAt
					}
				}
				delete(workspaces, oldestID)
			}
			id = hex.EncodeToString(token[:])
			workspace.handler = newAPIHandler(&configStore{config: config, snapshot: model, loaded: true}, initialYAML)
			exists = true
			http.SetCookie(w, &http.Cookie{Name: workspaceCookie, Value: id, Path: cookiePath,
				HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: r.TLS != nil})
		}
		if exists {
			workspace.usedAt = now
			workspaces[id] = workspace
		}
		mu.Unlock()
		if !exists && id != "" && r.Method != http.MethodPost && r.URL.Path != "/api/default.yaml" {
			writeJSON(w, http.StatusConflict, apiResponse{Message: "Scenariusz wygasł. Wczytaj YAML ponownie lub przywróć przykład."})
			return
		}
		if exists {
			workspace.handler.ServeHTTP(w, r)
		} else {
			defaultHandler.ServeHTTP(w, r)
		}
	}), nil
}
