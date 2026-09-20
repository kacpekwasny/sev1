package content

import (
	"archive/zip"
	"bytes"
	"fmt"
	"strings"
	"time"
)

// Vault packs the notes and tasks into a zip that can be unpacked straight
// into an Obsidian vault - the [[wikilinks]] keep working there.
func (l *Library) Vault() ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	add := func(name, body string) error {
		w, err := zw.Create(name)
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(body))
		return err
	}

	if err := add("README.md", l.vaultIndex()); err != nil {
		return nil, err
	}
	for _, note := range l.Notes {
		if err := add("notatki/"+note.Slug+".md", note.Raw); err != nil {
			return nil, err
		}
	}
	for _, task := range l.Tasks {
		if err := add("zadania/"+task.Slug+".md", task.Raw); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (l *Library) vaultIndex() string {
	var b strings.Builder
	b.WriteString("# Jak rozpętałem drugą Sev1 - notatki\n\n")
	fmt.Fprintf(&b, "Wygenerowano: %s\n\n", time.Now().Format("2006-01-02 15:04"))
	b.WriteString("Rozpakuj katalog jako vault w Obsidianie - linki `[[tak]]` zadziałają od razu.\n\n## Notatki\n\n")
	for _, note := range l.Notes {
		fmt.Fprintf(&b, "- [[notatki/%s|%s]]\n", note.Slug, note.Title)
	}
	b.WriteString("\n## Zadania\n\n")
	for _, task := range l.Tasks {
		fmt.Fprintf(&b, "- [[zadania/%s|%s]]\n", task.Slug, task.Title)
	}
	return b.String()
}
