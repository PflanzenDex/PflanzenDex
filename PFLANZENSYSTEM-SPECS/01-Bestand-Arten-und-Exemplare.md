# 01 – Epic BES: Bestand (Arten & Exemplare)

Ziel: Artwissen einmal pflegen, jeden Topf als eigenes Exemplar führen, und beides so anlegen, dass die Dashboards ohne Nacharbeit funktionieren.

Quellen: `🌿 Mein Pflanzen-Dashboard.md` (Blöcke „Neues Exemplar anlegen", „Arten: Pflege", „Meine Exemplare", Vorlagen), `CLAUDE.md` (Workflow Pflanzenpflege).

## Userstories

### US-BES-01 · Neue Art per Prompt-Vorlage anlegen · ✅
Als **Pflanzenhalter** will ich für eine neue Pflanzenart eine vollständige Art-Notiz bekommen, damit Pflege, Licht und Erfolgskriterien dokumentiert sind, bevor ich das erste Exemplar anlege.

Akzeptanzkriterien:
- Gegeben eine unbekannte Art, wenn ich die Art-Vorlage im Dashboard (Block „Neue Pflanze anlegen") mit dem Pflanzennamen an Claude gebe, dann liefert Claude **eine** Markdown-Notiz mit allen Frontmatter-Feldern aus DM-01 und den fünf Body-Abschnitten, ohne Text davor oder danach.
- Dann steht die Notiz unter `02-Areas/Pflanzen/Arten/<Art>.md`.
- Gehört die Gattung nicht zu bereits geführten Arten im Pokédex, wird die Art zusätzlich in `Arten.md` ergänzt (siehe US-POK-02).

### US-BES-02 · Exemplar per Formular anlegen · ✅
Als **Pflanzenhalter** will ich ein Exemplar über ein Formular anlegen, damit Dateiname, Kennzeichen, Soll-Standort und Fangdatum automatisch stimmen.

Akzeptanzkriterien:
- Gegeben mindestens eine Art-Notiz, wenn ich im Block „➕ Neues Exemplar anlegen" eine Art wähle, dann zeigt das Formular vorab den Dateinamen, der entstehen wird.
- Gegeben keine Art-Notiz, dann steht dort der Hinweis, zuerst eine Art anzulegen.
- Wenn ich „Exemplar anlegen" klicke, dann entsteht eine Notiz mit `Art` (Vollpfad-Link), `Standort_Aktuell`, `Gefangen_Am` (heutiges **lokales** Datum), `Wachstumslog: []`, `Behandlungen: []`.
- `Standort_Aktuell` ist `Standort_Wachstumsphase` der Art, außer heute liegt in der Ruhephase und `Standort_Ruhephase` existiert; dann dieser Wert.
- Existiert der Ziel-Dateiname schon, wird nichts verändert und eine Warnung angezeigt.

### US-BES-03 · Mehrere Exemplare einer Art unterscheiden · ✅
Als **Pflanzenhalter** will ich mehrere Töpfe derselben Art über die Wäscheklammer-Farbe unterscheiden, damit jedes Exemplar eine eigene Messhistorie hat.

Akzeptanzkriterien (Namensregel DM-03):
- 1. Exemplar: Datei `Art`, kein Kennzeichen.
- 2. Exemplar: Datei `Art` bleibt bestehen, neues heißt `Art – Klammer` mit `Kennzeichen: "Klammer"`. Existiert nur `Art – Klammer`, bekommt das neue den Namen `Art` ohne Kennzeichen.
- 3. Exemplar (oder sobald eines schon eine Farbe trägt): Das Formular fragt die Farbe des neuen **und** jedes bestehenden Exemplars ab, benennt die bestehenden Dateien in `Art – <Farbe>` um (Obsidian zieht Links nach) und setzt `Kennzeichen: "Klammer <Farbe>"`.
- Farben sind je Art eindeutig (Groß-/Kleinschreibung egal); doppelte Farbe oder leere Farbe bricht ab, ohne etwas zu ändern.
- Namenskonflikte werden vor der ersten Änderung geprüft.

### US-BES-04 · Steckling anlegen und eintopfen · ✅
Als **Pflanzenhalter** will ich einen Steckling getrennt von ausgewachsenen Pflanzen führen, damit er unter der Stecklingslampe steht und nicht im Pflegephasen-Tracker oder der Lampenverteilung auftaucht.

Akzeptanzkriterien:
- Wenn ich im Formular „Steckling" ankreuze, dann trägt das Exemplar `Status: "Steckling"` und `Licht_Hardware` = Lampe 1; `Standort_Aktuell` ist `Standort_Wachstumsphase`, auch in der Ruhephase.
- Der Pflegephasen-Block (PHA) filtert `Status: "Steckling"` aus.
- Die Lampenverteilung zählt Lampe 1 nicht mit.
- Nach dem Eintopfen entfernt der Halter `Status` und `Licht_Hardware` im Exemplar; ab dann gilt die Lampe der Art (manueller Schritt).
- Die Art-Notiz behält das Zielprofil (Ziel-Lampe, `Licht_Lux_Bedarf`).

### US-BES-05 · Arten nach Schwierigkeit vergleichen · ✅
Als **Pflanzenhalter** will ich eine Tabelle mit einer Zeile je Art, damit ich Pflegeregeln nachschlagen kann, ohne jede Notiz zu öffnen.

Akzeptanzkriterien:
- Block „🌿 Arten: Pflege (nach Schwierigkeit)" zeigt Spalten Art (Link), Botanisch, Licht/Lampe, Gieß-Regel (Messer), Substrat, Rückschnitt, Erfolgskriterien, Level.
- Nur Arten mit mindestens einem Exemplar in `Meine Pflanzen/` erscheinen.
- Sortierung aufsteigend nach `Schwierigkeit` (Text; die Reihenfolge `Einfach` < `Medium` < `Schwer` ergibt sich zufällig alphabetisch).

### US-BES-06 · Exemplare als Karten sehen · ✅
Als **Pflanzenhalter** will ich jedes Exemplar als Karte sehen, damit ich Zustand und Handlungsbedarf auf einen Blick erfasse.

Akzeptanzkriterien:
- Block „🪴 Meine Exemplare": Raster aus Karten (`minmax(230px, 1fr)`), sortiert nach Dateiname.
- Jede Karte zeigt: Foto des jüngsten Log-Eintrags mit Foto (sonst 🌿-Platzhalter), Exemplarname (Link), Artname (Link, klein), Chips (Lampenstufe ohne Klammer-Zusatz, ggf. `Status`), `📍 Standort_Aktuell`, `📏 letzte Messung · Qualität (Datum)` oder „noch keine Messung".
- Hat das Exemplar offene Behandlungen: `💊 Grund · Datum (überfällig seit N Tg. / heute / in N Tg.)`, bei mehreren „+N weitere".
- Hat die letzte Messung eine `Notiz`: einklappbar „Letzte Bewertung".
- Klick auf das Foto öffnet die Bilddatei in einem neuen Tab.

### US-BES-07 · Eingegangene oder abgegebene Pflanze archivieren · ✅
Als **Pflanzenhalter** will ich ein Exemplar aus den Auswertungen nehmen, ohne seine Historie zu verlieren.

Akzeptanzkriterien:
- Die **Exemplar**-Notiz (nicht die Art-Notiz) wird nach `04-Archive/Pflanzen/` verschoben; `Archiviert_Am` und `Archiviert_Grund` kommen ins Frontmatter.
- Alle Dashboard-Queries sind auf `02-Areas/Pflanzen/Meine Pflanzen` begrenzt, daher verschwindet das Exemplar automatisch aus Verteilung, Phasen, Wachstum, Behandlungen und Pokédex-Besitz, ohne weitere Filterlogik.
- Archivierte Exemplare zählen im Pokédex nicht als gefangen.

Hinweis: Das Verschieben ist manuell; es gibt keinen Button. Zwei archivierte Notizen liegen vor (`Basilikum`, `Efeutute`), beide noch im alten Format (Art und Exemplar in einer Datei).

### US-BES-08 · Unvollständige Notizen erkennen · 🟡
Als **Pflanzenhalter** will ich merken, wenn eine Notiz so unvollständig ist, dass sie aus Auswertungen herausfällt, damit ich keine stillen Lücken habe.

Akzeptanzkriterien (Soll):
- Eine Exemplar-Notiz ohne `Art`-Feld, ohne `Standort_Aktuell` oder mit einer nicht auflösbaren Art-Referenz wird im Dashboard als Warnung angezeigt.

Ist: Alle Blöcke filtern auf `p.Art` und blenden Notizen ohne dieses Feld **stillschweigend** aus. Ein fehlendes `Standort_Aktuell` führt im Phasen-Block zu „⚠️ steht noch: undefined". Nur der Pokédex warnt (Art ohne Artepitheton, Art nicht in `Arten.md`). → Backlog B-04.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-BES-01 | Art- und Exemplar-Notizen sind getrennte Dateien; Exemplare tragen nur individuelle Felder, Artfelder kommen per Lookup (`Exemplar-Feld ?? Art-Feld`). | ✅ |
| FR-BES-02 | Das Feld `Art` ist ein Vollpfad-Wikilink mit Alias; die Auflösung erfolgt über `metadataCache.getFirstLinkpathDest`. | ✅ |
| FR-BES-03 | Das Anlegen-Formular wendet die Namensregel an, prüft Namenskonflikte vor dem ersten Schreibzugriff und benennt bei Anzahlwechsel um. | ✅ |
| FR-BES-04 | `Gefangen_Am` wird beim Anlegen mit dem lokalen Datum belegt (nicht UTC). | ✅ |
| FR-BES-05 | Die Art-Vorlage fordert vollständige Frontmatter (DM-01) einschließlich `Wachstumsmaß`, `Vergeilung_Anzeichen`, `Erfolgskriterien_Kurz`. Die Lampenzuordnung folgt dem Sättigungspunkt, nicht dem Überleben. | ✅ |
| FR-BES-06 | Eine Art-Notiz entsteht vor dem ersten Exemplar der Art. Das Formular ist nur für bekannte Arten nutzbar. | ✅ |
| FR-BES-07 | Eine Wachstumsmaß-Dimension je Art ist fix; sie erscheint als Spalte im Wachstumsblock. | ✅ |
| FR-BES-08 | Der Handfallback (Exemplar-Vorlage im Dashboard) erzeugt dasselbe Schema wie das Formular. | ✅ |
| FR-BES-09 | Der Block „Arten: Pflege" und die Lichtübersicht sind **Art-Sicht** (eine Zeile je Art mit ≥1 Exemplar); Phasen, Wachstum, Behandlungen und Karten sind **Exemplar-Sicht**. | ✅ |
| FR-BES-10 | Unvollständige Exemplar-Notizen erzeugen eine sichtbare Warnung statt stillem Ausblenden. | ⬜ (siehe US-BES-08) |
