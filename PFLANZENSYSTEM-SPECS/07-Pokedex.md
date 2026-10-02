# 07 – Epic POK: Pflanzen-Pokédex

Ziel: Sammeln macht Spaß und lenkt den Blick auf neue Arten. Sammel-Einheit ist die **Art** (Ordnung → Familie → Gattung → Art). Die Karte zeigt immer Name und Text (zum gezielten Ausschauhalten, kein Pokémon-Maskieren), gefangen ist farbig mit dem eigenen Foto.

Quellen: `03-Resources/Pflanzen-Pokedex/Pflanzen-Pokedex.md`, `scripts/pflanzen/{build_pokedex.py,pokedex-core.js,pokedex.css}`, Hook, Tests, Specs v1/v2/v3 (`docs/superpowers/specs/`), `CLAUDE.md`. Bei Widersprüchen zwischen Specs und Code gilt der Code; siehe B-03.

## Userstories

### US-POK-01 · Sammelkarten für Arten sehen · ✅
Als **Pflanzenhalter** will ich jede Art als Sammelkarte sehen, damit ich Bestand und Lücken auf einen Blick erfasse.

Akzeptanzkriterien:
- Jede Karte zeigt Nummer `#NNN` (fortlaufend in Baumreihenfolge), Artname, deutschen Kurznamen (Zusatz in Klammern abgeschnitten, voller Name als Tooltip), Kurztext, `🧬 Gattung: N Arten`, Schwierigkeit (★☆☆ … ★★★) und `☀ L<Lampe>`.
- **Gefangen:** farbig; Foto = `Foto` des jüngsten Wachstumslog-Eintrags eines Exemplars, sonst das Wikipedia-Bild; Chip „gefangen TT.MM.JJJJ" (bzw. „≈ …" oder „Datum unbekannt"); „N Exemplare" nur bei N > 1; Zeile „Gattung: <Gattung>".
- **Fehlend:** Name, deutscher Name und Kurztext **sichtbar**; Foto = Wikipedia-Bild (nicht das eigene); Chip „noch nicht gefangen"; oben rechts „???" als Platzhalter.
- Hat die Art weder eigenes noch Wikipedia-Bild, zeigt die Karte ein Icon passend zur Familie (Kaktus, Aronstab, Rankenblatt, Orchidee, Rosette, Zwiebelblüte, Schwertblätter, Palme, Farn, Bromelie; alle übrigen den neutralen Sprössling).
- Fehlt der Kurztext: „Keine Wikipedia-Beschreibung verfügbar."
- Ist die Gattung artenarm (≤ 10 Arten laut GBIF): Badge „✨ Artenarm"; gefangene artenarme Arten zusätzlich mit Seltenheits-Rahmen.
- Quelllink „Wikipedia" (CC BY-SA-Attribution) an jeder Karte mit Bildquelle.

### US-POK-02 · Katalog kuratieren · ✅
Als **Pflanzenhalter** und **Claude** wollen wir den Katalog über eine einzige Datei pflegen.

Akzeptanzkriterien:
- `Arten.md` hat Frontmatter-Array `Arten` mit `Name`, `Deutsch`, `Schwierigkeit` (1–3), `Lampe` (2–4), optional `Notiz`.
- `Name` braucht Gattung **und** Epitheton; einwortige Einträge werden vom Skript nicht übernommen, sondern als ungültig gemeldet.
- Namen werden normiert („Gattung" kapitalisiert, Epitheton klein): `ficus BENJAMINA` → `Ficus benjamina`; Duplikate entfallen.
- Ungültige Ratings (außerhalb 1–3 / 2–4) gelten als fehlend und lösen eine Warnung aus.
- Ein Hybridzeichen (`×`, `x`) wird übersprungen; Sorten-Zusätze gehören nicht in den Katalog (siehe US-POK-06).

### US-POK-03 · Taxonomie-Baum und Anreicherung automatisch bauen · ✅
Als **System** will ich aus `Arten.md` den Baum samt Wikipedia-Daten und Gattungs-Artenzahl erzeugen.

Akzeptanzkriterien (`python3 scripts/pflanzen/build_pokedex.py [--offline]`):
- Auflösung je Art über OpenTree-TNRS (`context_name: "Land plants"`, Rang Art; Synonym-Treffer werden gefiltert, ein reiner Synonym-Treffer landet in `fehler`, nicht als Doppelblatt) zu Ordnung, Familie, Gattung.
- Anreicherung: Wikidata (SPARQL, Rang-Art `Q7432`) → Wikipedia-REST-Summary (de; Fallback en bei fehlendem deutschen Artikel, Text und Bild dann englisch). `disambiguation` zählt als „kein Artikel". Kurztext gekürzt auf höchstens 2 Sätze und 240 Zeichen an der Satzgrenze.
- Je Gattung einmal (dedupliziert) die GBIF-Artenzahl (`arten_anzahl_gattung`; 0 gilt als unbekannt).
- Ausgabe `Pokedex-Baum.json` mit `hinweis`, `stand`, `ordnungen`, `fehler`. Sortierung stabil; Ordnung/Familie/Gattung ohne Zuordnung landen unter „Ohne Ordnung"/„Ohne Familie".
- Jede nicht auflösbare Art steht in `fehler` mit Grund, nie still verworfen.
- Umbenannte Gattungen (z. B. *Sansevieria* → *Dracaena*, *Saintpaulia* → *Streptocarpus*) werden bewusst unter dem aktuellen Namen geführt.

### US-POK-04 · Baum automatisch neu bauen, wenn der Katalog sich ändert · ✅
Als **Pflanzenhalter** will ich nach dem Ändern von `Arten.md` nichts manuell anstoßen.

Akzeptanzkriterien:
- Der `post-commit`-Hook startet `build_pokedex.py` im Hintergrund (`nohup`), wenn `03-Resources/Pflanzen-Pokedex/Arten.md` im Commit geändert wurde; Ausgabe in `scripts/pflanzen/pokedex_last_run.log`.
- Ohne Änderung an `Arten.md` läuft nichts. Manueller Start jederzeit möglich.
- Das Dashboard zeigt eine Warnung, wenn die Namen in `Arten.md` und im Baum abweichen (Namensvergleich, kein Datei-Datum) und nennt den Befehl.

### US-POK-05 · Robust bei Netzausfall und Rate-Limits · ✅
Als **System** will ich den guten Baum nie mit Teilergebnissen überschreiben.

Akzeptanzkriterien:
- Bei Netzausfall oder fehlendem Cache-Eintrag endet das Skript mit Exit-Code 2 und lässt `Pokedex-Baum.json` unangetastet.
- Schreiben ist atomar (temporäre Datei, `os.replace`).
- Fehler einzelner Arten werden gemeldet und **nicht** gecacht; „kein Artikel" bzw. „kein GBIF-Treffer" werden als `null` gecacht, damit Reruns schnell sind.
- HTTP wird gedrosselt und bei 429/500/502/503/504 bis zu 5 Mal wiederholt (Retry-After oder exponentielles Backoff, höchstens 60 s). Client-Kennung: `vault-pokedex/0.1 (personal)`, Timeout 30 s.
- `--offline` nutzt nur die Caches (`.pokedex_cache.json`, `.pokedex_enrich_cache.json`).
- Gecachte Einträge frischt man auf, indem man den Eintrag im Cache löscht und neu startet.
- Idempotenz: gleiche Eingaben und gleicher Cache ergeben ein byte-identisches `Pokedex-Baum.json` (`stand` ändert sich nur bei Baumänderung).

### US-POK-06 · Besitz automatisch aus meinen Pflanzen ableiten · ✅
Als **Pflanzenhalter** will ich, dass eine Art als gefangen gilt, sobald ich ein Exemplar besitze, ohne ein Besitz-Feld zu pflegen.

Akzeptanzkriterien:
- Artname = erste zwei „Wörter" (Gattung + Epitheton) von `Lateinischer_Name` der verlinkten Art-Notiz (Hybridzeichen übersprungen, Epitheton klein): `Citrus x limon` → `Citrus limon`.
- Zusätze (`var.`, `subsp.`, `f.`, `'Cultivar'`) fließen nicht in die Zuordnung ein, erscheinen aber als Chip auf der eigenen Karte; bei mehreren Exemplaren alle Sorten, dedupliziert (`Opuntia microdasys var. albispina` → Art `Opuntia microdasys`, Chip `var. albispina`).
- Gefangen heißt: mindestens ein Exemplar in `Meine Pflanzen/` verweist auf die Art. Archiviertes zählt nicht.
- Fehlt das Artepitheton (z. B. `Hippeastrum`, `Parodia sp.`), zählt die Pflanze nicht als gefangen; das Dashboard warnt „Eigene Pflanzen ohne Artepitheton … Art-Notiz ergänzen".

### US-POK-07 · Fangdatum und Foto korrekt und ehrlich · ✅
Als **Pflanzenhalter** will ich ein nachprüfbares Fangdatum und mein eigenes Foto auf der Karte.

Akzeptanzkriterien:
- Fangdatum je Art = frühestes über alle Exemplare. Quelle je Exemplar in dieser Reihenfolge: `Gefangen_Am` → `created` des Exemplars → `created` der Art-Notiz (Anzeige „≈", weil Notiz-Anlage statt Anschaffung) → „unbekannt". **Nie geraten.**
- Foto = `Foto` des jüngsten Wachstumslog-Eintrags (nach `Datum`) über alle Exemplare, die eines tragen; sonst Wikipedia-Bild.
- Die Fotodarstellung läuft über `app.vault.adapter.getResourcePath`.

### US-POK-08 · Suchen, filtern, sortieren · ✅
Als **Pflanzenhalter** will ich im Katalog gezielt finden, was ich suche.

Akzeptanzkriterien:
- Suchfeld (Groß-/Kleinschreibung egal) über Artname, deutschen Kurznamen, Gattung, Familie, Ordnung.
- Filter-Chips: Alle · Gefangen · Fehlend · Artenarm.
- Sortierung: **Nach Familie** (gruppiert in einklappbaren Familienblöcken mit `n / m` und Ordnungsname, standardmäßig offen), **Alphabetisch**, **Fangdatum** (gefangen zuerst, neueste zuerst, ohne Datum danach, Fehlende zuletzt), **Artenzahl** (aufsteigend nach Gattungs-Artenzahl, unbekannt zuletzt). Bei jeder Sortierung außer „Familie" entfällt die Gruppierung zugunsten eines flachen Rasters.
- Keine Treffer: „Keine Art gefunden."

### US-POK-09 · Details zu einer Art ansehen · ✅
Als **Pflanzenhalter** will ich per Klick eine Karte aufklappen und alle Werte lesen.

Akzeptanzkriterien:
- Klick klappt die Karte **inline** auf (kein `position: fixed`, weil das in Obsidian-Notizen durch transformierte Scroll-Container unzuverlässig ist): größeres Bild, voller deutscher Name, voller Kurztext, Gattungs-Zeile, Fangstatus, Exemplarzahl, Sortenchip, Wikipedia-Link.
- Es ist höchstens eine Karte offen; „✕" schließt; ein Klick auf den Wikipedia-Link schließt die Karte nicht.

### US-POK-10 · Sammler-Rang und Fortschritt · ✅
Als **Pflanzenhalter** will ich meinen Rang und den Fortschritt sehen, damit es sich wie Fortschritt anfühlt.

Akzeptanzkriterien:
- Rang nach Anzahl gefangener Arten: Keimling 0–4, Setzling ab 5, Jungpflanze ab 15, Blüher ab 30, Baumkrone ab 60, Botaniker ab 100.
- Anzeige: Rang, „N / M Arten gefangen (P %)", Fortschrittsbalken, „Noch N bis „<nächster Rang>"", „k von K Ordnungen entdeckt", Stand des Baums. K zählt die Ordnungen im Baum (ohne „Ohne Ordnung"), nicht hartkodiert.

### US-POK-11 · Meilensteine mit Handlungsanweisung · ✅
Als **Pflanzenhalter** will ich Ziele sehen, die nennen, was konkret noch fehlt.

Akzeptanzkriterien:
- Familie: *entdeckt* (≥ 1 Art), *Kenner* (Familie hat ≥ 3 Arten; Ziel = aufgerundete Hälfte), *komplett* (Familie hat ≥ 2 Arten; Ziel = alle).
- Gattung: *entdeckt* (≥ 1 Art), *komplett* (Gattung hat ≥ 2 kuratierte Arten); kein „Kenner" auf Gattungsebene.
- *Entdecker*: Ordnungen mit ≥ 1 gefangener Art von allen; `fehlend` = Ordnungen mit den wenigsten Arten zuerst.
- Gruppen „Ohne Familie", „Ohne Gattung", „Ohne Ordnung" haben keine eigenen Meilensteine.
- Jeder Meilenstein hat `aktuell`, `ziel`, `rest` und bis zu 3 `fehlend` (deutscher Name und lateinischer Name).
- Anzeige: bis zu 4 offene Meilensteine mit dem kleinsten Rest > 0 (bei Gleichstand höhere Quote zuerst, dann Titel), „noch N: …" mit Fortschrittsbalken; eingeklappt „🏆 N Meilensteine erreicht" mit Datum (Fangdatum der n-ten Art), falls bekannt.

### US-POK-12 · „Neu gefangen" beim nächsten Besuch · ✅
Als **Pflanzenhalter** will ich sehen, was seit meinem letzten Besuch dazugekommen ist.

Akzeptanzkriterien:
- Zustand in `03-Resources/Pflanzen-Pokedex/.pokedex-state.json` (`{gesehen: [...], stand}`, gitignored), gelesen/geschrieben über `app.vault.adapter`.
- `neu` = gefangene Arten − `gesehen`. Fehlt die Datei oder ist sie defekt: stilles Anlegen mit dem aktuellen Stand, **kein** Banner.
- Das Banner „🎉 Neu gefangen: …" bleibt bis zum Klick auf „Okay ✔" (schreibt `gesehen`).
- Lese-/Schreibfehler werden abgefangen; das Dashboard rendert dann ohne Banner statt zu brechen.

### US-POK-13 · Katalog auf 600+ Arten ausbauen · 🟡
Als **Pflanzenhalter** will ich einen großen Katalog mit vielen Arten je Sammelgattung (Hoya, Euphorbia, Echeveria, Crassula, Opuntia, Peperomia, Ficus, Begonia, Philodendron, Aloe, Rhipsalis, Sedum, Haworthia), damit es etwas zu sammeln gibt.

Akzeptanzkriterien:
- Der Katalog wächst in idempotenten Batches (`Arten.md` ergänzen, committen, Hook baut den Baum); ein Batch ist nutzbar, ohne dass der Katalog „fertig" sein muss.
- Zielumfang 600+ Arten; Sammelgattungen mit 10–20 Arten, sonst 1–3 je Gattung.
- Der Nutzer liest jeden Batch gegen.

Ist: 215 Arten (Stand Baum 2026-09-29), 0 Fehler. Die Erweiterung ist reine Kurationsarbeit, kein Code-Thema. → Backlog B-10.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-POK-01 | Reine Logik (Karten, Meilensteine, Suche, Besitz, Rang) steht in `pokedex-core.js` ohne Obsidian-API und ist mit `node --test` getestet (66 Tests). | ✅ |
| FR-POK-02 | Aussehen steht in `pokedex.css`; nach Änderungen an `.js`/`.css` die Notiz neu laden (Dataview beobachtet nur die Notiz selbst). | ✅ |
| FR-POK-03 | `Pokedex-Baum.json` wird nur vom Skript geschrieben, nie manuell. | ✅ |
| FR-POK-04 | Drift-/Lücken-Warnungen im Dashboard: eigene Art nicht in `Arten.md`; nicht auflösbare Arten (`fehler`); Namensabweichung Liste ↔ Baum; Rating fehlt/ungültig; Art ohne Epitheton; Info „N Arten ohne Wikipedia-Artikel" und „N ohne GBIF-Artenzahl". | ✅ |
| FR-POK-05 | Artenarm-Schwelle `ARTENARM_MAX = 10` bezieht sich auf die **Gattung**; Artenarm ist ein Badge, kein Meilenstein. | ✅ |
| FR-POK-06 | Karten-Nummern sind fortlaufend in aktueller Baumreihenfolge. Neue Arten verschieben die Nummern nachfolgender Karten; „stabil" gilt nur bei unveränderter Liste. | ✅ (Einschränkung) |
| FR-POK-07 | Wikipedia-Text steht unter CC BY-SA; jede Karte verlinkt die Quelle. | ✅ |
| FR-POK-08 | Keine erfundenen Zahlen: Artenzahl aus GBIF, Fangdatum aus eigenen Daten, „unbekannt" statt Raten. | ✅ |
| FR-POK-09 | Sorten/Cultivars erhalten keinen eigenen Katalog-Slot (keine botanische Taxonomie/Anreicherung möglich). | ✅ |
| FR-POK-10 | Familien-Icon-Zuordnung steht in `FAMILY_ICON_KEY` (`pokedex-core.js`). | ✅ |
| FR-POK-11 | Out of Scope: SVG-Baum, Verknüpfung mit der Wunschliste, IUCN-Status, Sound/Animationen über CSS hinaus. | ✅ (bewusst) |
| FR-POK-12 | `Arten.md` und `Wunschliste.md` (Kandidaten) teilen keine Daten, auch wenn Arten überlappen (z. B. `Philodendron hederaceum`, `Aglaonema commutatum`). | 🟡 (B-09) |
