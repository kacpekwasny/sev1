package web

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"wykladywiet/internal/content"
)

// Language is selected explicitly, then remembered in this browser. Polish is
// the default; unknown codes never become file paths or cookie values.
func requestLanguage(r *http.Request) string {
	if language := r.URL.Query().Get("lang"); supportedLanguage(language) {
		return language
	}
	if cookie, err := r.Cookie("sev1_language"); err == nil && supportedLanguage(cookie.Value) {
		return cookie.Value
	}
	return "pl"
}

func supportedLanguage(language string) bool { return language == "pl" || language == "en" }

func (s *Server) handleLanguage(w http.ResponseWriter, r *http.Request) {
	language := r.URL.Query().Get("lang")
	if !supportedLanguage(language) {
		http.Error(w, "Unsupported language", http.StatusBadRequest)
		return
	}
	destination, err := url.Parse(r.URL.Query().Get("return"))
	if err != nil || destination.IsAbs() || destination.Host != "" || !strings.HasPrefix(destination.Path, "/") || strings.HasPrefix(destination.Path, "//") || strings.ContainsAny(destination.Path, "\\\r\n") {
		destination = &url.URL{Path: "/"}
	}
	query := destination.Query()
	query.Del("lang")
	destination.RawQuery = query.Encode()
	http.SetCookie(w, &http.Cookie{Name: "sev1_language", Value: language, Path: "/", MaxAge: 365 * 24 * 60 * 60, HttpOnly: true, Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https", SameSite: http.SameSiteLaxMode})
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, destination.String(), http.StatusSeeOther)
}

func readCatalog(files fs.FS, language string) (map[string]string, error) {
	catalog := map[string]string{}
	if language == "pl" {
		return catalog, nil
	}
	raw, err := fs.ReadFile(files, "static/i18n/"+language+".json")
	if os.IsNotExist(err) {
		return catalog, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &catalog); err != nil {
		return nil, fmt.Errorf("%s translations: %w", language, err)
	}
	return catalog, nil
}

func translator(catalog map[string]string) func(any) string {
	return func(value any) string {
		source := fmt.Sprint(value)
		if translated, ok := catalog[source]; ok {
			return translated
		}
		return source
	}
}

func (s *Server) libFor(r *http.Request) *content.Library {
	language := requestLanguage(r)
	original := s.lib()
	if language == "pl" {
		return original
	}
	s.mu.RLock()
	translated := s.localized[language]
	s.mu.RUnlock()
	if !s.opts.Dev {
		if translated != nil {
			copy := *translated
			copy.Visibility = original.Visibility
			return &copy
		}
		return original
	}
	loaded, err := content.Load(filepath.Join(s.opts.ContentDir, "i18n", language))
	if err != nil || len(loaded.Lectures)+len(loaded.Notes)+len(loaded.Tasks) == 0 {
		if translated != nil {
			copy := *translated
			copy.Visibility = original.Visibility
			return &copy
		}
		return original
	}
	loaded.Visibility = original.Visibility
	return loaded
}
