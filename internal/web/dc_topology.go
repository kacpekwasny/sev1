package web

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"wykladywiet/internal/content/dctopology"
)

func newDCTopologyAPI(contentDir string) (http.Handler, error) {
	initial, err := os.ReadFile(filepath.Join(contentDir, "dc-topology", "default.yaml"))
	if err != nil {
		return nil, fmt.Errorf("konfiguracja topologii DC: %w", err)
	}
	return dctopology.NewBrowserAPIHandler(initial, "/api/dc-topology/")
}

func (s *Server) handleDCTopology(w http.ResponseWriter, r *http.Request) {
	s.render(w, r, "dc-topology", map[string]any{
		"Title": "Eksplorator centrum danych", "DCTopology": true,
		"Description": "Interaktywna topologia centrum danych: urządzenia, sesje BGP i oczekiwane tablice tras.",
	})
}

func (s *Server) handleDCTopologyAPI(w http.ResponseWriter, r *http.Request) {
	request := r.Clone(r.Context())
	request.URL.Path = "/api" + strings.TrimPrefix(r.URL.Path, "/api/dc-topology")
	s.dcAPI.ServeHTTP(w, request)
}
