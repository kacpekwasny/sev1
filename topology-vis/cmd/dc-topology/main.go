// Command dc-topology runs the isolated development application kept inside
// topology-vis while the parent site remains the eventual integration target.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"wykladywiet/topology-vis/internal/dctopology"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8084", "adres nasłuchu")
	configPath := flag.String("config", "topology-vis/examples/default.yaml", "plik konfiguracji YAML")
	staticPath := flag.String("static", "topology-vis/web/static", "katalog zasobów przeglądarki")
	flag.Parse()

	initial, err := os.ReadFile(*configPath)
	if err != nil {
		log.Fatalf("odczyt konfiguracji %s: %v", *configPath, err)
	}
	api, err := dctopology.NewAPIHandler(initial)
	if err != nil {
		log.Fatalf("niepoprawna konfiguracja %s: %v", *configPath, err)
	}

	mux := http.NewServeMux()
	mux.Handle("/api/", api)
	mux.Handle("GET /static/vendor/fonts/", http.StripPrefix("/static/vendor/fonts/", http.FileServer(http.Dir("web/static/vendor/fonts"))))
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.Dir(filepath.Clean(*staticPath)))))
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(filepath.Clean(*staticPath), "dc-topology", "dev.html"))
	})
	server := dctopology.NewHTTPServer(*addr, mux)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("zamykanie serwera: %v", err)
		}
	}()

	log.Printf("wizualizator DC działa pod http://%s/", *addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("serwer wizualizatora: %v", err)
	}
}
