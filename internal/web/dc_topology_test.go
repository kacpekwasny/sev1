package web

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestDCTopologyPageAndAPI(t *testing.T) {
	srv := newTestServer(t)
	page := get(t, srv, "/topologie/dc/")
	if page.Code != http.StatusOK || !strings.Contains(page.Body.String(), `data-api-base="/api/dc-topology"`) {
		t.Fatalf("DC page did not mount the JavaScript app: %d %s", page.Code, page.Body.String())
	}
	if strings.Contains(page.Body.String(), "htmx.min.js") || !strings.Contains(page.Body.String(), "/static/dc-topology/app.css") {
		t.Fatal("DC page must load its own styles and use JavaScript interactions")
	}
	index := get(t, srv, "/topologie/")
	if !strings.Contains(index.Body.String(), `href="/topologie/dc/"`) {
		t.Fatal("DC page missing from the topology index")
	}
	model := get(t, srv, "/api/dc-topology/model")
	var data struct {
		Nodes []any `json:"nodes"`
	}
	if model.Code != http.StatusOK || json.Unmarshal(model.Body.Bytes(), &data) != nil || len(data.Nodes) != 28 {
		t.Fatalf("invalid integrated default model: status %d", model.Code)
	}
	for _, path := range []string{"/api/dc-topology/status", "/api/dc-topology/config.yaml", "/api/dc-topology/default.yaml",
		"/api/dc-topology/inspector?kind=speaker&id=border-1", "/static/dc-topology/app.js", "/static/dc-topology/dev.js", "/static/dc-topology/app.css"} {
		if result := get(t, srv, path); result.Code != http.StatusOK {
			t.Errorf("integrated asset/API %s: %d", path, result.Code)
		}
	}
}
