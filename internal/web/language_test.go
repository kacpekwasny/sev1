package web

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestLanguageSelection(t *testing.T) {
	srv := newTestServer(t)
	for _, target := range []string{"https://example.com/", "//example.com/", "/\\example.com/"} {
		req := httptest.NewRequest("GET", "/language?lang=en&return="+strings.ReplaceAll(target, "\\", "%5C"), nil)
		rec := httptest.NewRecorder()
		srv.ServeHTTP(rec, req)
		if rec.Header().Get("Location") != "/" {
			t.Errorf("unsafe destination accepted: %q", rec.Header().Get("Location"))
		}
	}
	rec := get(t, srv, "/language?lang=en&return=%2Fnotatki%2F%3Ftag%3Dbgp%26lang%3Dpl")
	if rec.Code != http.StatusSeeOther || rec.Header().Get("Location") != "/notatki/?tag=bgp" {
		t.Fatalf("redirect: %d %s", rec.Code, rec.Header().Get("Location"))
	}
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Value != "en" || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie: %+v", cookies)
	}
	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(cookies[0])
	page := httptest.NewRecorder()
	srv.ServeHTTP(page, req)
	if !strings.Contains(page.Body.String(), `<html lang="en">`) || page.Header().Get("Content-Language") != "en" {
		t.Fatal("remembered choice missing")
	}
	req = httptest.NewRequest("GET", "/?lang=pl", nil)
	req.AddCookie(cookies[0])
	page = httptest.NewRecorder()
	srv.ServeHTTP(page, req)
	if !strings.Contains(page.Body.String(), `<html lang="pl">`) {
		t.Fatal("explicit language must take precedence")
	}
	if got := get(t, srv, "/language?lang=../../bad").Code; got != http.StatusBadRequest {
		t.Fatalf("unsupported language: %d", got)
	}
	if got := get(t, srv, "/?lang=unknown").Header().Get("Content-Language"); got != "pl" {
		t.Fatalf("fallback: %s", got)
	}
}
