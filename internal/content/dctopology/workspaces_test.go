package dctopology

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
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

func TestEvictedWorkspaceDoesNotReturnSomeoneElsesTables(t *testing.T) {
	initial, err := os.ReadFile("../../../content/dc-topology/default.yaml")
	if err != nil {
		t.Fatal(err)
	}
	handler, err := NewBrowserAPIHandler(initial, "/api/")
	if err != nil {
		t.Fatal(err)
	}
	var first *http.Cookie
	for i := 0; i <= workspaceLimit; i++ {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/config", strings.NewReader(string(initial))))
		if rec.Code != http.StatusOK {
			t.Fatalf("create workspace: %d", rec.Code)
		}
		if i == 0 {
			first = rec.Result().Cookies()[0]
		}
	}
	request := httptest.NewRequest(http.MethodGet, "/api/inspector?kind=speaker&id=border-1", nil)
	request.AddCookie(first)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, request)
	if rec.Code != http.StatusConflict || !strings.Contains(rec.Body.String(), "wygasł") {
		t.Fatalf("expired browser must not receive the default tables: %d %s", rec.Code, rec.Body.String())
	}
	// The original fixture remains available so the user can recover via Reset.
	request = httptest.NewRequest(http.MethodGet, "/api/default.yaml", nil)
	request.AddCookie(first)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, request)
	if rec.Code != http.StatusOK {
		t.Fatalf("reset fixture unavailable after eviction: %d", rec.Code)
	}
}
