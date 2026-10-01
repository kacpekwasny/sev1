package web

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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
	setLanguageCookie(w, r, language)
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

func setLanguageCookie(w http.ResponseWriter, r *http.Request, language string) {
	http.SetCookie(w, &http.Cookie{Name: "sev1_language", Value: language, Path: "/", MaxAge: 365 * 24 * 60 * 60, HttpOnly: true, Secure: r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https", SameSite: http.SameSiteLaxMode})
}

type translationPattern struct {
	match *regexp.Regexp
	text  string
}

var formatPlaceholder = regexp.MustCompile(`%[sdq]|\{[0-9]+\}`)

func translator(catalog map[string]string) func(any) string {
	// Patterns are only for authored dynamic prose, such as cable tooltips.
	// Values remain literal strings; no HTML or format directives are executed.
	var patterns []translationPattern
	keys := make([]string, 0, len(catalog))
	for key := range catalog {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if len(keys[i]) == len(keys[j]) {
			return keys[i] < keys[j]
		}
		return len(keys[i]) > len(keys[j])
	})
	for _, key := range keys {
		if key == catalog[key] || !formatPlaceholder.MatchString(key) {
			continue
		}
		parts := formatPlaceholder.Split(key, -1)
		var expression strings.Builder
		expression.WriteString("^")
		for i, part := range parts {
			if i > 0 {
				expression.WriteString("(.+?)")
			}
			expression.WriteString(regexp.QuoteMeta(part))
		}
		expression.WriteString("$")
		patterns = append(patterns, translationPattern{regexp.MustCompile(expression.String()), catalog[key]})
	}
	return func(value any) string {
		source := fmt.Sprint(value)
		if translated, ok := catalog[source]; ok {
			return translated
		}
		for _, pattern := range patterns {
			values := pattern.match.FindStringSubmatch(source)
			if values == nil {
				continue
			}
			index := 0
			return formatPlaceholder.ReplaceAllStringFunc(pattern.text, func(placeholder string) string {
				position := index
				index++
				if strings.HasPrefix(placeholder, "{") {
					_, _ = fmt.Sscanf(placeholder, "{%d}", &position)
				}
				if position+1 < len(values) {
					return values[position+1]
				}
				return placeholder
			})
		}
		return source
	}
}

func (s *Server) translate(r *http.Request, text string) string {
	return s.templates().forLanguage(requestLanguage(r)).translate(text)
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
	loaded.Language = language
	return loaded
}
