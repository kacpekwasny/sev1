// Command dc-topology serves the isolated browser harness for the DC topology
// visualizer. The reusable browser module and its styles live under web/static
// so the site can embed the same assets when the feature is integrated.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	addr := flag.String("addr", ":8082", "adres nasłuchu")
	flag.Parse()

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/static/dc-topology/dev.html")
	})
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(os.DirFS("web/static")))))

	server := &http.Server{
		Addr:              *addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			log.Printf("zamknięcie serwera: %v", err)
		}
	}()

	log.Printf("harness topologii DC nasłuchuje na %s", *addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("serwer: %v", err)
	}
}
