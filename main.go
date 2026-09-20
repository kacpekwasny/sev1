// Command wykladywiet serves the companion site for the "Jak rozpętałem
// drugą Sev1" lecture series at AGH WIET.
package main

import (
	"context"
	"embed"
	"errors"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"wykladywiet/internal/web"
)

//go:embed all:web
var embedded embed.FS

func main() {
	addr := flag.String("addr", ":8081", "adres nasłuchu")
	contentDir := flag.String("content", "content", "katalog z materiałami w markdown")
	dev := flag.Bool("dev", false, "przeładowuj treść i szablony przy każdym żądaniu")
	flag.Parse()

	token := os.Getenv("PANEL_TOKEN")
	if token == "" {
		token = "sev1"
		log.Printf("PANEL_TOKEN nie ustawiony, panel prowadzącego działa na token %q", token)
	}

	files, err := webFiles(*dev)
	if err != nil {
		log.Fatalf("pliki www: %v", err)
	}

	srv, err := web.New(web.Options{
		ContentDir: *contentDir,
		Files:      files,
		PanelToken: token,
		Dev:        *dev,
	})
	if err != nil {
		log.Fatalf("start: %v", err)
	}

	httpSrv := &http.Server{
		Addr:        *addr,
		Handler:     logRequests(srv),
		ReadTimeout: 10 * time.Second,
		// No WriteTimeout: the live page holds an open SSE stream.
		IdleTimeout: 2 * time.Minute,
	}

	go func() {
		log.Printf("słucham na http://localhost%s (panel: /panel?token=%s)", *addr, token)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("serwer: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(ctx)
	log.Print("do zobaczenia")
}

// webFiles serves templates and static assets from disk in -dev mode and
// from the binary otherwise, so deployment is a single file.
func webFiles(dev bool) (fs.FS, error) {
	if dev {
		return os.DirFS("web"), nil
	}
	return fs.Sub(embedded, "web")
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}
