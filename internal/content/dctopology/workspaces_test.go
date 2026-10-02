package dctopology

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestBrowserScenariosDoNotReplaceEachOther(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewBrowserAPIHandler(initial, "/api/")
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("%s %s: %d %s", method, path, w.Code, w.Body.String())
		}
		return w
	}
	modified := strings.Replace(string(initial), "spines: 4", "spines: 6", 1)
	first := request(http.MethodPost, "/api/config", modified, nil)
	cookies := first.Result().Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].Path != "/api/" {
		t.Fatalf("workspace cookie missing or incorrectly scoped: %+v", cookies)
	}
	if result := request(http.MethodGet, "/api/config.yaml", "", cookies[0]); !strings.Contains(result.Body.String(), "spines: 6") {
		t.Fatal("first browser lost its configuration")
	}
	if result := request(http.MethodGet, "/api/config.yaml", "", nil); !strings.Contains(result.Body.String(), "spines: 4") {
		t.Fatal("first browser changed the shared default")
	}
	second := request(http.MethodPost, "/api/config", strings.Replace(string(initial), "spines: 4", "spines: 2", 1), nil)
	if result := request(http.MethodGet, "/api/config.yaml", "", second.Result().Cookies()[0]); !strings.Contains(result.Body.String(), "spines: 2") {
		t.Fatal("second browser does not have its own configuration")
	}
	if result := request(http.MethodGet, "/api/config.yaml", "", cookies[0]); !strings.Contains(result.Body.String(), "spines: 6") {
		t.Fatal("second browser changed the first browser's configuration")
	}
	if result := request(http.MethodGet, "/api/default.yaml", "", cookies[0]); result.Body.String() != string(initial) {
		t.Fatal("reset fixture was mutated")
	}
}

func TestExpiredWorkspaceFallsBackToDefault(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	for _, reason := range []string{"idle", "eviction", "restart"} {
		t.Run(reason, func(t *testing.T) {
			now := time.Now()
			newHandler := func() http.Handler {
				h, err := newBrowserAPIHandler(initial, "/api/", func() time.Time { return now })
				if err != nil {
					t.Fatal(err)
				}
				return h
			}
			handler := newHandler()
			request := func(method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
				r := httptest.NewRequest(method, path, strings.NewReader(body))
				if cookie != nil {
					r.AddCookie(cookie)
				}
				w := httptest.NewRecorder()
				handler.ServeHTTP(w, r)
				return w
			}
			modified := strings.Replace(string(initial), "spines: 4", "spines: 6", 1)
			created := request(http.MethodPost, "/api/config", modified, nil)
			if created.Code != http.StatusOK {
				t.Fatalf("create workspace: %d %s", created.Code, created.Body.String())
			}
			expired := created.Result().Cookies()[0]
			switch reason {
			case "idle":
				now = now.Add(workspaceIdleLimit + time.Second)
			case "restart":
				handler = newHandler()
			case "eviction":
				// Retain other browsers with different tables while evicting the first.
				modified = strings.Replace(string(initial), "spines: 4", "spines: 2", 1)
				for i := 0; i < workspaceLimit; i++ {
					now = now.Add(time.Second)
					if rec := request(http.MethodPost, "/api/config", modified, nil); rec.Code != http.StatusOK {
						t.Fatalf("create workspace: %d", rec.Code)
					}
				}
			}
			paths := []string{"/api/config.yaml", "/api/status", "/api/model", "/api/default.yaml",
				"/api/inspector?kind=speaker&id=border-1",
				"/api/explore?kind=packet&from=customer-1&to=customer-3&family=ipv4"}
			var wg sync.WaitGroup
			for _, path := range paths {
				wg.Add(1)
				go func(path string) {
					defer wg.Done()
					rec := request(http.MethodGet, path, "", expired)
					baseline := request(http.MethodGet, path, "", nil)
					if rec.Code != http.StatusOK || rec.Body.String() != baseline.Body.String() {
						t.Errorf("%s must use the default after %s: %d %s", path, reason, rec.Code, rec.Body.String())
					}
					if rec.Header().Get("X-DC-Topology-Reset") != "default" || rec.Header().Get("Cache-Control") != "no-store" {
						t.Errorf("%s missing uncached recovery marker", path)
					}
					cookies := rec.Result().Cookies()
					if len(cookies) != 1 || cookies[0].Name != workspaceCookie || cookies[0].MaxAge != -1 || cookies[0].Path != "/api/" || !cookies[0].HttpOnly {
						t.Errorf("%s did not clear the expired cookie: %+v", path, cookies)
					}
				}(path)
			}
			wg.Wait()
			// A write after expiry creates an isolated scenario with a fresh cookie.
			modified = strings.Replace(string(initial), "spines: 4", "spines: 6", 1)
			restored := request(http.MethodPost, "/api/config", modified, expired)
			if restored.Code != http.StatusOK {
				t.Fatalf("restore workspace: %d", restored.Code)
			}
			fresh := restored.Result().Cookies()[0]
			if fresh.Value == expired.Value || fresh.MaxAge < 0 {
				t.Fatal("write must mint a new workspace cookie")
			}
			if rec := request(http.MethodGet, "/api/config.yaml", "", fresh); !strings.Contains(rec.Body.String(), "spines: 6") || rec.Header().Get("X-DC-Topology-Reset") != "" {
				t.Fatal("new custom scenario was not preserved")
			}
			if rec := request(http.MethodGet, "/api/config.yaml", "", nil); !strings.Contains(rec.Body.String(), "spines: 4") {
				t.Fatal("recovery changed the shared default")
			}
		})
	}
}
