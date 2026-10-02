# 02 – Epic BES: Bestand (Artenkatalog und Exemplare)

Ziel: Artwissen einmal im gemeinsamen Katalog, jeden Topf als eigenes Exemplar, und beides so anlegen, dass alle Auswertungen ohne Nacharbeit funktionieren.

Prototyp-Bezug: Epic BES (`../PFLANZENSYSTEM-SPECS/01-Bestand-Arten-und-Exemplare.md`). Der Unterschied: Im Prototyp erzeugt jeder Halter seine Art-Notizen selbst. In der App kommen Arten aus einem **gemeinsamen Katalog** (E-02), den Betreiber, KI und Nutzer-Vorschläge füllen.

## Userstories

### US-BES-01 · Art aus dem Katalog wählen oder neu anlegen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich für ein neues Exemplar die passende Art finden, damit Pflege, Licht und Erfolgskriterien feststehen, bevor ich den Topf anlege.

Akzeptanzkriterien:
- Gegeben die Suche nach lateinischem oder deutschem Namen, wenn die Art im Katalog steht, dann sehe ich ihr Profil (Felder aus DM-BES-01) und wähle sie.
- Gegeben eine Art, die nicht im Katalog steht, wenn ich „Art vorschlagen" wähle, dann kann ich ein Profil im Formular mit allen Pflichtfeldern anlegen (der Weg ohne KI, FR-KI-05) oder die Recherche an meinen KI-Client übergeben (Auftrag, US-KI-08); dessen Ergebnis kommt als Entwurf (US-KI-03, US-KI-09), den ich prüfe und bestätige. Das Profil erscheint im Katalog mit Status `KI-erstellt, ungeprüft` bzw. `ungeprüft`, solange kein Prüfer es bestätigt hat (FR-BES-06).
- Eine Art ohne Epitheton (nur Gattung) wird als Eintrag erlaubt, zählt aber nicht als Pokédex-Fang (siehe US-POK-06).
- Dubletten (gleicher normierter Name) werden erkannt und auf die vorhandene Art verwiesen.

### US-BES-02 · Exemplar anlegen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich ein Exemplar mit wenigen Angaben anlegen.

Akzeptanzkriterien:
- Pflicht: Art. Vorbelegt: Name nach Namensregel (DM-BES-03), Standort nach der heutigen Phase (siehe `US-PHA-01`), `Gefangen_Am` = heutiges **lokales** Datum, leere Messreihe und Behandlungsliste.
- Standort = Soll-Standort der Wachstumsphase, außer heute liegt in der Ruhephase und ein Ruhestandort existiert.
- Der Name steht vor dem Speichern fest. Existiert er schon, wird nichts verändert und die Namensregel wird angewendet (US-BES-03).

### US-BES-03 · Mehrere Exemplare einer Art unterscheiden · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich mehrere Töpfe derselben Art unterscheiden, damit jedes Exemplar eine eigene Historie hat.

Akzeptanzkriterien (Namensregel DM-BES-03):
- 1. Exemplar: Name = Art, kein Kennzeichen.
- 2. Exemplar: das neue erhält ein Kennzeichen (Voreinstellung „Klammer", frei wählbar).
- Ab dem 3.: jedes Exemplar hat ein eigenes Kennzeichen (im Prototyp eine Farbe). Die App fragt nach den fehlenden Kennzeichen, bevor sie speichert.
- Kennzeichen sind je Art eindeutig (Groß-/Kleinschreibung egal); doppelt oder leer ist ein Fehler ohne Änderung.
- Anders als im Prototyp ist der Name keine Datei: Umbenennen ändert keine Verweise.

### US-BES-04 · Steckling anlegen und eintopfen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich einen Steckling getrennt führen, damit er unter Stecklingslicht steht und nicht im Phasen-Tracker oder der Lichtverteilung erscheint.

Akzeptanzkriterien:
- „Steckling" setzt `Status: Steckling` und die Lichtzone Stecklingslicht (Lampe 1 der Voreinstellung); Standort ist der Standort der Wachstumsphase, auch in der Ruhephase.
- Phasen-Tracker und Lichtverteilung (Lampen 2–4) schließen Stecklinge aus.
- „Eingetopft" ist eine Aktion: Sie setzt `Status: Pflanze`, entfernt den Lichtzonen-Override, und ab da gilt die Lichtzone der Art. Ein Ereignis „Eingetopft" geht in den Feed, wenn das Exemplar geteilt ist.
- Die Art behält ihr Zielprofil (Ziel-Lichtzone, `Licht_Lux_Bedarf`).

### US-BES-05 · Arten nach Schwierigkeit vergleichen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich eine Tabelle mit einer Zeile je Art, damit ich Pflegeregeln nachschlage, ohne jede Art zu öffnen.

Akzeptanzkriterien:
- Spalten: Art, botanischer Name, Lichtzone, Gießregel, Substrat, Rückschnitt, Erfolgskriterien, Schwierigkeit.
- Nur Arten mit mindestens einem aktiven Exemplar. Sortiert nach `Schwierigkeit` (Zahl 1–3, Anzeige Einfach/Medium/Schwer).

### US-BES-06 · Exemplare als Karten sehen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich jedes Exemplar als Karte sehen, damit ich Zustand und Handlungsbedarf auf einen Blick erfasse.

Akzeptanzkriterien:
- Karte: Foto der jüngsten Messung mit Foto (sonst Platzhalter), Name, Art, Lichtzone, Status, Standort, letzte Messung mit Qualität und Datum oder „noch keine Messung".
- Offene Behandlung: Grund, Fälligkeit (überfällig seit N Tg. / heute / in N Tg.), bei mehreren „+N weitere".
- Notiz der letzten Messung einklappbar. Klick auf das Foto öffnet es groß.
- Raster passt sich der Bildschirmbreite an (Handy: eine bis zwei Spalten).

### US-BES-07 · Eingegangene oder abgegebene Pflanze archivieren · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich ein Exemplar aus den Auswertungen nehmen, ohne seine Historie zu verlieren.

Akzeptanzkriterien:
- „Archivieren" mit Grund (`eingegangen`, `abgegeben`, `getauscht`, `verschenkt`, `verkauft`, frei) setzt `Status: Archiviert`, `Archiviert_Am` und `Archiviert_Grund`.
- Archivierte Exemplare fehlen in Verteilung, Phasen, Wachstum, Behandlungen, Pokédex-Besitz und Heute-Liste, bleiben aber mit Historie einsehbar und lassen sich wiederherstellen.
- Bei Tausch erfolgt die Archivierung automatisch (US-SOZ-11).

### US-BES-08 · Unvollständige Daten erkennen · ⬜ (Prototyp 🟡)
Als **Pflanzenhalter** will ich merken, wenn ein Exemplar so unvollständig ist, dass es aus Auswertungen fällt (P-10).

Akzeptanzkriterien:
- Ein Exemplar ohne Art, ohne Standort oder mit einem Standort ohne Lichtzone erscheint in „Hinweise" mit der Aktion, die es behebt.
- Keine Auswertung blendet es stillschweigend aus; es wird mit Vermerk gezählt oder getrennt aufgeführt.

## Datenmodell

### DM-BES-01 Art (Katalog)

| Feld | Typ | Bedeutung |
|---|---|---|
| Lateinischer Name | Text | Gattung + Epitheton, optional Sorte; Normalform „Gattung epitheton" |
| Deutscher Name, englischer Name | Text | |
| Familie (deutsch, lateinisch) | Text | |
| Schwierigkeit | Zahl 1–3 | 1 Einfach, 2 Medium, 3 Schwer (löst B-05) |
| Lichtzone (Ziel) | Verweis | genau eine Zielstufe 2–4 (Voreinstellung); Stufe 1 nie für Erwachsene |
| Lichtbedarf (Lux) | Zahl | Bedarf für maximales Wachstum |
| Ruhephase von/bis | Monat-Tag | darf über den Jahreswechsel gehen |
| Standort Wachstum/Ruhe (Hinweis) | Text | Empfehlung (z. B. „Fensterbank kühl"); der Halter ordnet eigene Standorte zu |
| Wachstumsmaß | Aufzählung/Text | genau eine Messdimension (Höhe, Rosettendurchmesser, Trieblänge) |
| Vergeilung-Anzeichen | Text | artspezifische Symptome von Lichtmangel |
| Gießhinweis, Substrat, Rückschnitt, Wuchs-Hacks | Text | je ein Satz |
| Erfolgskriterien | Text | beobachtbare Zeichen optimaler Pflege |
| Botanische Story | Text | Familie, Herkunft, Besonderheiten |
| Prüfstatus | Aufzählung | `kuratiert`, `geprüft`, `KI-erstellt, ungeprüft` |
| Quelle | Text/Link | Herkunft der Angaben |
| Bild, Bildquelle, Lizenz | | Wikipedia/Commons mit Lizenz |
| Merkmale (optional) | | Luftfeuchte, Temperatur min., Wuchsgröße, Giftig für Haustiere, je mit Quelle; für Entdecken (DM-ENT-01) |

### DM-BES-02 Exemplar

| Feld | Pflicht | Bedeutung |
|---|---|---|
| Besitzer | ja | Konto |
| Art | ja | Verweis in den Katalog |
| Name | ja | abgeleitet nach DM-BES-03, nicht von Hand |
| Kennzeichen | bei >1 Exemplar | siehe US-BES-03 |
| Standort | ja | Verweis auf Standort des Halters (US-LIC-05) |
| Lichtzone (Override) | nein | überschreibt die Artzone (Steckling) |
| Status | ja | `Pflanze`, `Steckling`, `Archiviert` |
| Gefangen_Am | nein | Datum; fehlt es, gilt Anlagedatum als „≈" (US-POK-07) |
| Herkunft | nein | `{Von, Tausch, Datum}` (US-SOZ-11) |
| Teilen, Teilen_Fotos | nein | Freigabe (US-SOZ-04) |

Regel: Jedes Exemplarfeld hat Vorrang vor dem gleichnamigen Artfeld.

### DM-BES-03 Namensregel

1 Exemplar: `Art` · 2 Exemplare: `Art` und `Art – Kennzeichen` · ab 3: jedes `Art – Kennzeichen`. Trennzeichen ist ein Gedankenstrich mit Leerzeichen. Der Name ist Anzeigetext; die Identität des Exemplars ist eine technische Kennung.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-BES-01 | Art (Wissen) und Exemplar (Topf) sind getrennte Entitäten; Exemplare tragen nur individuelle Felder. | ⬜ |
| FR-BES-02 | Der Artenkatalog ist gemeinsam; Änderungen daran sind Betreiber- oder Prüf-Aktionen, Nutzer können Vorschläge machen (E-02). | ⬜ |
| FR-BES-03 | Namenskonflikte werden vor jeder Änderung geprüft, es entsteht kein Teilzustand. | ⬜ |
| FR-BES-04 | `Gefangen_Am` wird mit dem lokalen Datum des Nutzers belegt (NFR-08). | ⬜ |
| FR-BES-05 | Ein Artprofil verlangt vollständige Pflichtfelder (DM-BES-01) einschließlich Wachstumsmaß, Vergeilung-Anzeichen und Erfolgskriterien. Die Lichtzone folgt dem Sättigungspunkt, nicht dem Überleben (US-LIC-01). | ⬜ |
| FR-BES-06 | Ein KI-erstelltes Profil ist als solches gekennzeichnet, bis ein Mensch es geprüft hat. Die KI darf kein Profil als `geprüft` markieren (US-KI-03). | ⬜ |
| FR-BES-07 | Eine Wachstumsmaß-Dimension je Art ist fix und erscheint als Eingabe im Messformular. | ⬜ |
| FR-BES-08 | Art-Sicht (Katalog, Lichtübersicht) und Exemplar-Sicht (Phasen, Wachstum, Behandlungen, Karten) bleiben getrennt benannt. | ⬜ |
