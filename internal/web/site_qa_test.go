package web

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"wykladywiet/internal/content/dctopology"
)

func TestLanguageControlAcrossPages(t *testing.T) {
	srv := newTestServer(t)
	paths := []string{"/", "/wyklady/", "/live/", "/notatki/", "/notatki/graf", "/zadania/", "/topologie/", "/topologie/dc/", "/panel"}
	lib := srv.lib()
	for _, lecture := range lib.Lectures {
		paths = append(paths, "/wyklady/"+lecture.Slug)
	}
	for _, note := range lib.Notes {
		paths = append(paths, "/notatki/"+note.Slug)
	}
	for _, task := range lib.Tasks {
		paths = append(paths, "/zadania/"+task.Slug)
	}
	for _, topology := range lib.Topologies {
		paths = append(paths, "/topologie/"+topology.Slug)
	}
	for _, path := range paths {
		t.Run(path, func(t *testing.T) {
			client := &browser{srv: srv, cookies: []*http.Cookie{{Name: "panel", Value: "test", Path: "/"}}}
			for _, language := range []string{"en", "pl", "en"} {
				destination := path + "?keep=1"
				result := client.get(t, "/language?lang="+language+"&return="+url.QueryEscape(destination))
				if result.Code != http.StatusSeeOther || result.Header().Get("Location") != destination {
					t.Fatalf("language redirect: %d %q", result.Code, result.Header().Get("Location"))
				}
				page := client.get(t, result.Header().Get("Location"))
				if page.Code != http.StatusOK || !strings.Contains(page.Body.String(), `<html lang="`+language+`">`) || page.Header().Get("Content-Language") != language {
					t.Fatalf("remembered language on %s: %d", path, page.Code)
				}
				if !strings.Contains(page.Body.String(), `src="/static/site.js" defer`) || !strings.Contains(page.Body.String(), `<option value="`+language+`" selected>`) {
					t.Fatal("automatic language control or selected value missing")
				}
				control := strings.Split(strings.Split(page.Body.String(), `<form class="language-switch"`)[1], `</form>`)[0]
				withoutFallback := strings.Split(control, "<noscript>")[0]
				if strings.Contains(withoutFallback, `type="submit"`) {
					t.Fatal("language selection still needs a Change button")
				}
			}
		})
	}
	for _, asset := range []string{"/static/site.js", "/static/i18n.js", "/static/i18n/en.json", "/static/graph.js", "/static/vendor/htmx.min.js", "/static/vendor/htmx-ext-sse.js"} {
		if get(t, srv, asset).Code != http.StatusOK {
			t.Errorf("asset unavailable: %s", asset)
		}
	}
}

func TestTopologyControlsAPIInBothLanguages(t *testing.T) {
	for _, language := range []string{"pl", "en"} {
		t.Run(language, func(t *testing.T) {
			srv := newTestServer(t)
			client := &browser{srv: srv}
			client.get(t, "/language?lang="+language)
			client.get(t, "/topologie/dc/")
			modelResponse := client.get(t, "/api/dc-topology/model")
			var model dctopology.Model
			if err := json.Unmarshal(modelResponse.Body.Bytes(), &model); err != nil {
				t.Fatal(err)
			}
			for _, node := range model.Nodes {
				assertAPI(t, client, "/api/dc-topology/inspector?kind=speaker&id="+url.QueryEscape(node.ID))
			}
			for _, vm := range model.VMs {
				assertAPI(t, client, "/api/dc-topology/inspector?kind=speaker&id="+url.QueryEscape(vm.ID))
			}
			for _, session := range model.Sessions {
				assertAPI(t, client, "/api/dc-topology/inspector?kind=session&id="+url.QueryEscape(session.ID))
			}
			for _, family := range []string{"ipv4", "ipv6"} {
				assertAPI(t, client, "/api/dc-topology/explore?kind=packet&from=customer-1&to=customer-3&family="+family)
			}
			assertAPI(t, client, "/api/dc-topology/explore?kind=update&from=customer-1&to=rs-user-m1")
			initial := client.get(t, "/api/dc-topology/config.yaml").Body.String()
			invalid := client.post(t, "/api/dc-topology/config", "invalid: [")
			if invalid.Code != http.StatusBadRequest || client.get(t, "/api/dc-topology/config.yaml").Body.String() != initial {
				t.Fatal("invalid YAML changed the scenario")
			}
			request := httptest.NewRequest("POST", "/api/dc-topology/counts", strings.NewReader(`{"spines":3,"bolts":2,"racks_per_bolt":2,"hosts_per_rack":2,"customer_vms":3}`))
			request.Header.Set("Content-Type", "application/json")
			if response := client.do(t, request); response.Code != http.StatusOK {
				t.Fatalf("count rebuild: %d %s", response.Code, response.Body.String())
			}
			changed := client.get(t, "/api/dc-topology/config.yaml").Body.String()
			if !strings.Contains(changed, "spines: 3") {
				t.Fatal("count rebuild did not update the topology")
			}
			other := "en"
			if language == "en" {
				other = "pl"
			}
			client.get(t, "/language?lang="+other+"&return=%2Ftopologie%2Fdc%2F")
			if client.get(t, "/api/dc-topology/config.yaml").Body.String() != changed {
				t.Fatal("language switching reset the browser scenario")
			}
			assertAPI(t, client, "/api/dc-topology/explore?kind=packet&from=customer-1&to=customer-3&family=ipv4&traffic=miedzy-boltami")
		})
	}
}

func assertAPI(t *testing.T, client *browser, path string) {
	t.Helper()
	response := client.get(t, path)
	var result struct {
		OK bool `json:"ok"`
	}
	if response.Code != http.StatusOK || json.Unmarshal(response.Body.Bytes(), &result) != nil || !result.OK {
		t.Fatalf("%s: %d %s", path, response.Code, response.Body.String())
	}
}

type streamRecorder struct {
	*httptest.ResponseRecorder
	cancel context.CancelFunc
}

func (r streamRecorder) Flush() { r.ResponseRecorder.Flush(); r.cancel() }
func readStream(t *testing.T, srv *Server, target string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	req := httptest.NewRequest("GET", target, nil).WithContext(ctx)
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	out := httptest.NewRecorder()
	srv.ServeHTTP(streamRecorder{out, cancel}, req)
	return out
}

func TestPresenterStreamAuthorization(t *testing.T) {
	srv := newTestServer(t)
	viewer := &browser{srv: srv}
	viewer.get(t, "/live/")
	for _, cookies := range [][]*http.Cookie{nil, {{Name: "panel", Value: "wrong"}}} {
		response := readStream(t, srv, "/live/stream?widok=panel", cookies...)
		if response.Code != http.StatusForbidden {
			t.Fatalf("unauthorized presenter stream: %d (moderation data: %t)", response.Code, strings.Contains(response.Body.String(), "event: moderation"))
		}
	}
	authorized := readStream(t, srv, "/live/stream?widok=panel", &http.Cookie{Name: "panel", Value: "test"}, &http.Cookie{Name: "sev1_language", Value: "en"})
	if authorized.Code != http.StatusOK || !strings.Contains(authorized.Body.String(), "event: moderation\n") || !strings.Contains(authorized.Body.String(), ">nickname</th>") {
		t.Fatal("authorized English presenter stream did not render")
	}
	audience := readStream(t, srv, "/live/stream", &http.Cookie{Name: "sev1_language", Value: "en"})
	if audience.Code != http.StatusOK || strings.Contains(audience.Body.String(), "event: moderation") || strings.Contains(audience.Body.String(), "192.0.2.1") {
		t.Fatal("audience stream exposed presenter data")
	}
}
