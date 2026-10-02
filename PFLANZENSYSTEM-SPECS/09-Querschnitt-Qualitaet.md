# 09 – Epic QS: Querschnitt und Qualität

Nicht-funktionale Anforderungen, die für alle Epics gelten. Maßstab ist `03-Resources/Processes/System-Design-Prinzipien.md` (Checkliste „Neue Systeme" und „Interaktions-Systeme") sowie `CLAUDE.md` („Designing New Systems/Automations").

## Userstories

### US-QS-01 · Nichts hängt am Erinnern · 🟡
Als **Pflanzenhalter** will ich, dass das System Handlungsbedarf selbst auslöst.

Akzeptanzkriterien:
- Pokédex: ✅ Der `post-commit`-Hook baut den Baum bei Änderung von `Arten.md`.
- Pflege (Phasen, Behandlungen, Messungen, Wunschlisten-Puffer): berechnet das Dashboard **beim Öffnen**. Es gibt keinen Push. → Epic MON.

### US-QS-02 · Logik ist testbar · 🟡
Als **Entwickler (Claude/Halter)** will ich Änderungen an Berechnungen absichern.

Akzeptanzkriterien:
- Pokédex-Logik: ✅ `pokedex-core.js` (66 Tests) und `build_pokedex.py` (73 Tests, ohne Netz mit Fake-Clients).
- Pflege-Dashboard: ❌ Logik (Phase, Trend, Zählung, Priorisierung, Namensregel) liegt inline in `dataviewjs`-Blöcken, mit kopierten Hilfsfunktionen (`artOf`, `artPfad`, `v`) in mehreren Blöcken und ohne Tests. Vorbild wäre `finanz-core.js`. → Backlog B-02.

### US-QS-03 · Wiederholbar ohne Angst · ✅
Als **Pflanzenhalter** will ich Skripte beliebig oft laufen lassen können.

Akzeptanzkriterien:
- `build_pokedex.py`: gleiche Eingaben ergeben ein byte-identisches Ergebnis; Fehler überschreiben den guten Baum nicht (atomar, Exit 2).
- `foto_import.py`: bereits verlinkte Einträge und vorhandene Dateien bleiben unverändert.
- Dashboard-Buttons sind nach dem Klick deaktiviert („gespeichert — aktualisiert sich gleich"), um Doppelklicks zu verhindern.

### US-QS-04 · Abweichungen werden sichtbar · ✅
Als **Pflanzenhalter** will ich merken, wenn Daten und Realität auseinanderlaufen.

Akzeptanzkriterien:
- Phasen: ⚠️ bei falschem Standort. Behandlungen: ⚠️ überfällig. Wunschliste: ⚠️ Puffer. Pokédex: ⚠️ siehe FR-POK-04.
- Trend: ⚠️ bei vergeilter Letztmessung.
- Lücken: Der Pokédex nennt Anzahl Arten ohne Wikipedia-Artikel/GBIF-Zahl.
- Nicht abgedeckt: Exemplare ohne `Art`/`Standort_Aktuell` (B-04).

### US-QS-05 · Zentral dokumentiert · ✅
Als **Claude** will ich beim Start den Systemvertrag lesen können.

Akzeptanzkriterien:
- `CLAUDE.md` enthält „Workflow: Pflanzenpflege" und „Workflow: Pflanzen-Pokédex" (Felder, Namensregel, Arten-/Exemplar-Trennung, Aufruf, Tests, Specs).
- Neue Systeme prüfen vorher `System-Design-Prinzipien.md`; keine neue `.github/agents/*`-Datei ohne Trigger und Datenformat.
- Nicht in `CLAUDE.md`: Monitoring-Spec (noch nicht umgesetzt; beim Umsetzen ergänzen, FR-MON-08).

### US-QS-06 · Datenschutz und Quellen · ✅
Als **Pflanzenhalter** will ich keine Standortdaten verlieren und Lizenzen einhalten.

Akzeptanzkriterien:
- Fotos werden mit entferntem EXIF (inkl. GPS) und auf lange Seite 1600 px verkleinert abgelegt.
- Wikipedia-Texte/-Bilder (CC BY-SA) werden mit Quelllink angezeigt; Wunschlisten-Bilder tragen `Bildquelle`.
- Rohsensorwerte kommen nicht in den Git-Vault (NFR-MON-01).
- `.pokedex-state.json` ist gitignored.

## Nicht-funktionale Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| NFR-01 | **Datenformat:** Frontmatter-Schemata aus DM-01…DM-06 sind fest und parsbar. Freitext trägt nur Inhalt, keine Logik. Schlüsselnamen (`Qualität`, `Hoehe_cm`, `Standort_Aktuell`, …) sind Teil des Formats und werden nicht umbenannt. | ✅ |
| NFR-02 | **Eingabe ohne YAML:** Alles, was nur der Mensch liefert, geht über Button/Formular (`processFrontMatter`): Standort, Messung, Behandlung, Gekauft, Exemplar anlegen. | ✅ |
| NFR-03 | **Single Source:** Artwissen steht einmal je Art; Exemplare tragen nur Abweichungen. | ✅ |
| NFR-04 | **Live-Ableitung:** Besitz, Verteilung, Phasen, Trends werden bei jedem Rendern berechnet; es gibt keine zweite Kopie, die nachgepflegt werden müsste. | ✅ |
| NFR-05 | **Keine erfundenen Zahlen:** Vergleiche gegen eigene Historie oder zitierbare Quellen (GBIF, Wikipedia); unbekannt wird als „unbekannt" gezeigt (Prinzip 5). | ✅ |
| NFR-06 | **Kein stilles Verschwinden:** Auswertungen dürfen Datensätze nicht ohne Hinweis ausblenden. | ❌ siehe B-04 |
| NFR-07 | **Kein Interaktions-System ohne Handlungsanweisung:** Jeder Block nennt, was zu tun ist (⚠️/🔔/„noch N: …"), statt nur Daten zu zeigen. | ✅ |
| NFR-08 | **Motivations-Mechaniken brauchen echte Quelle:** Der Pokédex zieht seine Kraft aus tatsächlichem Besitz und echten Katalog-Lücken, nicht aus erfundenen Vergleichswerten oder sozialem Vergleich, den es im Single-Player-Vault nicht gibt (Prinzip 4). | ✅ |
| NFR-09 | **Obsidian-Kompatibilität:** Aufklappende UI inline statt `position: fixed`; Handler direkt zuweisen statt Event-Delegation über `closest()`; externe JS/CSS-Dateien werden bei Änderung durch Neuladen der Notiz aktiv. | ✅ |
| NFR-10 | **Performance:** Dashboard und Pokédex rendern lokal ohne Netzzugriff (Daten kommen aus `Pokedex-Baum.json` und dem Vault). Netzzugriff gibt es nur im Skript. | ✅ |
| NFR-11 | **Lokalisierung:** UI und Daten sind deutsch; Datum `TT.MM.JJJJ` in der Anzeige, `YYYY-MM-DD` in Daten; Schlüsselwörter der Daten sind teils englisch/ohne Umlaut (`Hoehe_cm`) und teils mit Umlaut (`Qualität`, `Gießen_Messer`). | ✅ (Inkonsistenz hingenommen) |

## Prinzipien-Check (Checkliste aus `System-Design-Prinzipien.md`)

| Frage | Pokédex | Pflege-Dashboard | Monitoring (geplant) |
|---|---|---|---|
| Trigger ohne Erinnern? | ✅ Hook | 🟡 nur beim Öffnen | ✅ Bot-Scheduler |
| Festes, parsbares Format? | ✅ | ✅ | ✅ |
| Check gegen Abweichung? | ✅ | ✅ (ohne Datensatz-Lücken) | ✅ `stand`/`zuletzt` |
| Idempotent? | ✅ | ✅ | ✅ |
| Zentral dokumentiert? | ✅ | ✅ | ⬜ |
| Nur Prosa, die Ergebnisse ändert? | ✅ | ✅ | ✅ |
| Mensch liefert nur Menschliches? | ✅ | ✅ | ✅ (Sensor ersetzt Button) |
| Verdichtung statt Rohdaten? | ✅ Meilensteine, Rang | ✅ Trend | ✅ Aggregate |
| Sagt, was zu tun ist? | ✅ „noch N: …" | ✅ ⚠️/🔔 | ✅ Push |
| Fordert/wächst mit? | ✅ Rang, Ziele | 🟡 Trend gegen eigenen Schnitt | – |
