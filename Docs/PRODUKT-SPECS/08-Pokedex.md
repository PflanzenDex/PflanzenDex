# 08 – Epic POK: Pflanzen-Pokédex

Ziel: Sammeln macht Spaß und lenkt den Blick auf neue Arten. Sammel-Einheit ist die **Art** (Ordnung → Familie → Gattung → Art). Die Karte zeigt immer Name und Text (zum gezielten Ausschauhalten, kein Maskieren); gefangen ist farbig mit dem eigenen Foto.

Prototyp-Bezug: Epic POK (`../PFLANZENSYSTEM-SPECS/07-Pokedex.md`), im Prototyp am weitesten ausgereift (66 + 73 Tests). Die Logik (Karten, Meilensteine, Rang, Suche) und das Aufbau-Skript für den Taxonomie-Baum sind Kandidaten zur Wiederverwendung (E-01).

Hinweis: Im Prototyp waren die Stories POK-04 (Hook) und POK-05 (Robustheit) Teil des Aufbaus. Sie sind hier in US-POK-03 aufgegangen.

## Userstories

### US-POK-01 · Sammelkarten für Arten sehen · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Karte: Nummer `#NNN` (fortlaufend in Baumreihenfolge), Artname, deutscher Kurzname (Zusatz in Klammern abgeschnitten, voller Name als Tooltip), Kurztext, „Gattung: N Arten", Schwierigkeit (★☆☆ … ★★★), Lichtzone.
- **Gefangen:** farbig; Foto = jüngstes Messfoto eines aktiven Exemplars, sonst Wikipedia-Bild; Chip „gefangen TT.MM.JJJJ" (bzw. „≈ …" oder „Datum unbekannt"); „N Exemplare" nur bei N > 1.
- **Fehlend:** Name, deutscher Name und Kurztext **sichtbar**; Foto = Wikipedia-Bild; Chip „noch nicht gefangen".
- Ohne Bild: Icon passend zur Familie (Kaktus, Aronstab, Rankenblatt, Orchidee, Rosette, Zwiebelblüte, Schwertblätter, Palme, Farn, Bromelie; sonst neutraler Sprössling).
- Fehlt der Kurztext: „Keine Beschreibung verfügbar."
- Artenarm (Gattung ≤ 10 Arten laut GBIF): Badge „Artenarm"; gefangene artenarme Arten mit Seltenheits-Rahmen.
- Quelllink an jeder Karte mit Bildquelle (CC BY-SA).

### US-POK-02 · Katalog pflegen · ⬜ (Prototyp ✅)

Als **Betreiber** will ich den Artenkatalog über eine Stelle pflegen; als **Pflanzenhalter** Arten vorschlagen.

Akzeptanzkriterien:

- Ein Katalogeintrag hat `Name` (Gattung + Epitheton), `Deutsch`, `Schwierigkeit` (1–3), `Lichtzone` (2–4), optional `Notiz`. Pflichtfelder sind validiert.
- Namen werden normiert (`ficus BENJAMINA` → `Ficus benjamina`), Duplikate entfallen, ungültige Ratings lösen eine Warnung aus, Hybridzeichen und Sorten-Zusätze gehören nicht in den Katalog (US-POK-06).
- Der Katalog wächst in Batches (Zielumfang 600+ Arten; Sammelgattungen mit 10–20 Arten, sonst 1–3 je Gattung); jeder Batch wird gegengelesen und ist ohne „fertigen" Katalog nutzbar (Prototyp 🟡: 215 Arten).
- Nutzervorschläge (US-BES-01) landen in der Prüfliste des Betreibers (US-BES-10) und zählen erst nach der Freigabe.

### US-POK-03 · Taxonomie und Anreicherung automatisch bauen · ⬜ (Prototyp ✅)

Als **System** will ich aus dem Katalog den Baum samt Wikipedia-Daten und Gattungs-Artenzahl erzeugen.

Akzeptanzkriterien:

- Auflösung je Art über OpenTree-TNRS (Land plants, Rang Art; Synonym-Treffer gefiltert) zu Ordnung, Familie, Gattung.
- Anreicherung: Wikidata (Rang Art) → Wikipedia-Summary (de; Fallback en, Text und Bild dann englisch). Kurztext höchstens 2 Sätze und 240 Zeichen an der Satzgrenze. GBIF-Artenzahl je Gattung einmalig (0 = unbekannt).
- Jede nicht auflösbare Art steht in einer Fehlerliste mit Grund, nie still verworfen. Umbenannte Gattungen (_Sansevieria_ → _Dracaena_) werden unter dem aktuellen Namen geführt.
- Wird der Katalog geändert, läuft der Aufbau automatisch im Hintergrund; ohne Änderung läuft nichts.
- Robust: bei Netzausfall bleibt der bisherige gute Baum erhalten (atomares Ersetzen); einzelne Fehler werden gemeldet, nicht gecacht; „kein Artikel/GBIF-Treffer" wird als Ergebnis gecacht; Anfragen werden gedrosselt und bei 429/5xx wiederholt (höchstens 5×, Backoff ≤ 60 s).
- Idempotent: gleiche Eingaben und Caches ergeben identische Ausgabe.
- Betreiber sieht eine Warnung, wenn Katalog und Baum in den Namen abweichen.

### US-POK-06 · Besitz automatisch aus meinen Pflanzen ableiten · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Art = erste zwei „Wörter" des lateinischen Namens (Hybridzeichen übersprungen, Epitheton klein): `Citrus x limon` → `Citrus limon`.
- Zusätze (`var.`, `subsp.`, `f.`, `'Cultivar'`) fließen nicht in die Zuordnung ein, erscheinen aber als Chip auf der Karte (`Opuntia microdasys var. albispina` → Art `Opuntia microdasys`, Chip `var. albispina`).
- Gefangen = mindestens ein **aktives** Exemplar des Halters verweist auf die Art. Archiviertes zählt nicht.
- Fehlt das Epitheton (z. B. `Hippeastrum`, `Parodia sp.`), zählt das Exemplar nicht als gefangen; die App weist darauf hin („Art bestimmen, dann zählt sie").

### US-POK-07 · Fangdatum und Foto ehrlich · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Fangdatum je Art = frühestes über alle aktiven und archivierten Exemplare des Halters. Quelle je Exemplar in dieser Reihenfolge: `Gefangen_Am` → Anlagedatum des Exemplars (Anzeige „≈") → „unbekannt". **Nie geraten.**
- Foto = jüngste Messung mit Foto über alle Exemplare, sonst Wikipedia-Bild.

### US-POK-08 · Suchen, filtern, sortieren · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Suche (Groß-/Kleinschreibung egal) über Artname, deutschen Namen, Gattung, Familie, Ordnung.
- Filter: Alle · Gefangen · Fehlend · Artenarm.
- Sortierung: Nach Familie (gruppiert, einklappbar mit `n / m`), Alphabetisch, Fangdatum (gefangen zuerst, neueste zuerst, ohne Datum danach, Fehlende zuletzt), Artenzahl (aufsteigend, unbekannt zuletzt). Außer „Familie" flaches Raster.
- Keine Treffer: „Keine Art gefunden."

### US-POK-09 · Details zu einer Art ansehen · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Tipp öffnet die Karte oder eine Detailansicht: größeres Bild, voller deutscher Name, voller Kurztext, Gattung, Fangstatus, Exemplarzahl, Sortenchips, Quelllink, und der Link zum Artprofil.
- Höchstens eine Detailansicht offen; Schließen ist eindeutig.
- Bei Fehlend: Aktionen „auf die Wunschliste" (US-WUN, `Quelle: Pokédex`; zählt als Ja für Entdecken, US-ENT-05) und, falls ein Freund sie hat, „Freund hat sie" (US-SOZ-07).

### US-POK-10 · Sammler-Rang und Fortschritt · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Rang nach Zahl gefangener Arten: Keimling 0–4, Setzling ab 5, Jungpflanze ab 15, Blüher ab 30, Baumkrone ab 60, Botaniker ab 100.
- Anzeige: Rang, „N / M Arten gefangen (P %)", Fortschrittsbalken, „Noch N bis „<nächster Rang>"", „k von K Ordnungen entdeckt" (K aus dem Baum, nicht hartkodiert), Stand des Baums.

### US-POK-11 · Meilensteine mit Handlungsanweisung · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Familie: _entdeckt_ (≥ 1 Art), _Kenner_ (Familie hat ≥ 3 Arten; Ziel = aufgerundete Hälfte), _komplett_ (Familie hat ≥ 2 Arten; Ziel = alle).
- Gattung: _entdeckt_, _komplett_ (≥ 2 kuratierte Arten); kein „Kenner".
- _Entdecker_: Ordnungen mit ≥ 1 gefangener Art; `fehlend` = Ordnungen mit den wenigsten Arten zuerst.
- Gruppen „Ohne Familie/Gattung/Ordnung" haben keine Meilensteine.
- Jeder Meilenstein hat `aktuell`, `ziel`, `rest` und bis zu 3 `fehlend` (deutsch + lateinisch).
- Anzeige: bis zu 4 offene Meilensteine mit kleinstem Rest > 0 (Gleichstand: höhere Quote zuerst, dann Titel), „noch N: …" mit Balken; eingeklappt „N Meilensteine erreicht" mit Datum (Fangdatum der n-ten Art), falls bekannt.

### US-POK-12 · „Neu gefangen" beim nächsten Besuch · ⬜ (Prototyp ✅)

Akzeptanzkriterien:

- Der Zustand „gesehen" liegt je Konto serverseitig (nicht im Browser). `neu` = gefangene Arten − `gesehen`.
- Beim ersten Besuch (oder bei fehlendem Zustand): stilles Anlegen mit dem aktuellen Stand, **kein** Banner.
- Banner „Neu gefangen: …" bleibt bis „Okay", das `gesehen` schreibt.
- Lesefehler brechen die Seite nicht; es erscheint dann kein Banner.

## Anforderungen

| ID        | Anforderung                                                                                                                                                                                                                            | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-POK-01 | Reine Logik (Karten, Meilensteine, Suche, Besitz, Rang) ohne I/O und mit Tests; die Prototyp-Tests (`pokedex-core.js`, 66) sind Ausgangsbasis.                                                                                         | ⬜     |
| FR-POK-03 | Der Taxonomie-Baum wird nur vom Aufbau-Job geschrieben, nie von Hand.                                                                                                                                                                  | ⬜     |
| FR-POK-04 | Hinweise für Betreiber und Halter: eigene Art nicht im Katalog; nicht auflösbare Arten; Namensabweichung Katalog ↔ Baum; Rating fehlt/ungültig; Exemplar ohne Epitheton; „N Arten ohne Wikipedia-Artikel" und „N ohne GBIF-Artenzahl". | ⬜     |
| FR-POK-05 | Die Artenarm-Schwelle (10) bezieht sich auf die **Gattung**; Artenarm ist Badge, kein Meilenstein.                                                                                                                                     | ⬜     |
| FR-POK-06 | Karten-Nummern sind fortlaufend in aktueller Baumreihenfolge. Neue Arten verschieben die Nummern; „stabil" gilt nur bei unveränderter Liste.                                                                                           | ⬜     |
| FR-POK-07 | Wikipedia-Text steht unter CC BY-SA; jede Karte verlinkt die Quelle.                                                                                                                                                                   | ⬜     |
| FR-POK-08 | Keine erfundenen Zahlen: Artenzahl aus GBIF, Fangdatum aus eigenen Daten, „unbekannt" statt Raten.                                                                                                                                     | ⬜     |
| FR-POK-09 | Sorten/Cultivars erhalten keinen eigenen Katalog-Slot (keine Taxonomie/Anreicherung möglich).                                                                                                                                          | ⬜     |
| FR-POK-10 | Familien-Icon-Zuordnung ist Konfiguration, kein Code in der Oberfläche.                                                                                                                                                                | ⬜     |
| FR-POK-11 | **Sozial:** Der Pokédex des Halters ist die Basis für Freundesvergleich („du hast sie / fehlt dir", US-SOZ-07). Rang- und Bestenlistenvergleich zwischen Freunden bleiben ausgeschlossen.                                              | ⬜     |
| FR-POK-12 | Wunschliste und Pokédex sind verknüpft (FR-WUN-05); im Prototyp bewusst nicht.                                                                                                                                                         | ⬜     |
