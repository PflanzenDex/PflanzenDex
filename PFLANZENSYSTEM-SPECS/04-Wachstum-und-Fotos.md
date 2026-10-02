# 04 – Epic WAC: Wachstum, Vergeilung und Foto-Bewertung

Ziel: Erfolg wird an der **eigenen** Historie jeder Pflanze gemessen, nicht an erfundenen Artdurchschnitten, und Längenzuwachs durch Lichtmangel wird nicht als Erfolg gewertet.

Quellen: Dashboard-Block „📈 Wachstum", `scripts/pflanzen/foto_import.py`, `CLAUDE.md` („Wachstum/Erfolg messen"), `System-Design-Prinzipien.md` (Prinzip 5).

## Userstories

### US-WAC-01 · Messung per Eingabefeld erfassen · ✅
Als **Pflanzenhalter** will ich eine Messzahl pro Exemplar in der Dashboard-Tabelle speichern, damit der Verlauf ohne YAML-Editing wächst.

Akzeptanzkriterien:
- Der Block „📈 Wachstum" hat eine Zeile je Exemplar mit: Pflanze, „Was messen?" (`Wachstumsmaß` der Art, sonst „— (kein Wachstumsmaß definiert)"), letzte Messung, Rate, Trend, letzte Bewertung, Eingabe.
- Eingabe: Zahlenfeld (Schritt 0,5, cm), Qualitäts-Auswahl, optionale Notiz, „Speichern".
- Ungültige (nicht numerische) Eingabe wird ignoriert, es wird nichts geschrieben.
- Speichern hängt `{Datum, Hoehe_cm, Qualität, Notiz?}` an `Wachstumslog` an (`Notiz` nur, wenn nicht leer), deaktiviert den Button und zeigt „gespeichert — aktualisiert sich gleich".
- Gemessen wird immer dieselbe Dimension an derselben Stelle (Art-Feld `Wachstumsmaß`).

### US-WAC-02 · Vergeilung beim Messen beurteilen · ✅
Als **Pflanzenhalter** will ich bei jeder Messung „gesund" oder „vergeilt/dünn" wählen und die artspezifischen Anzeichen nachlesen können, damit ich nicht aus dem Gedächtnis urteile.

Akzeptanzkriterien:
- Auswahl `Gesund` / `Vergeilt/dünn` (Voreinstellung `Gesund`).
- Hat die Art `Vergeilung_Anzeichen`, steht dort „❓ woran erkennen?", das den Text ein- und ausklappt; der Text steht zusätzlich als Tooltip am Auswahlfeld.
- Fehlt `Qualität` in einem Altbestand-Eintrag, gilt `Gesund`.

### US-WAC-03 · Wachstumsrate und Trend gegen den eigenen Schnitt · ✅
Als **Pflanzenhalter** will ich sehen, ob die Pflanze schneller oder langsamer wächst als sonst, damit ich Pflegeprobleme früh bemerke.

Akzeptanzkriterien:
- Null Einträge: „noch keine Messung". Ein Eintrag: „1 Messung — noch keine Rate".
- Ab zwei Einträgen: Gesamtrate in cm/Jahr = (Δ Höhe / Δ Tage) × 365 zwischen erstem und letztem Eintrag.
- Ab drei Einträgen: Trend = letzte Intervallrate gegenüber dem Mittel aller vorherigen Intervallraten. Relative Abweichung > +10 % → 📈 schneller als sonst; < −10 % → 📉 langsamer als sonst; sonst ➡️ stabil. Das Mittel 0 wird als „stabil" behandelt.
- Bei zwei Einträgen steht „ab der 3. Messung siehst du hier einen Trend".
- Zwei Einträge am selben Tag oder in falscher Reihenfolge (Δ Tage ≤ 0) liefern keine Rate.
- Es gibt **keinen** Vergleich mit einem Artdurchschnitt (Prinzip 5).

### US-WAC-04 · Vergeilung übersteuert den Trend · ✅
Als **Pflanzenhalter** will ich, dass ein Längenzuwachs bei vergeilter Pflanze nicht als Erfolg erscheint.

Akzeptanzkriterien:
- Ist `Qualität` des letzten Eintrags `Vergeilt/dünn`, zeigt die Trendspalte „⚠️ Wachstum vergeilt/dünn — trotz Rate KEIN Erfolgssignal, siehe 🏆 Erfolgskriterien", unabhängig von der Rate.
- Ein steigender Trend zählt nur zusammen mit `Gesund` als Erfolgssignal.

### US-WAC-05 · Letzte Bewertung und Foto sehen · ✅
Als **Pflanzenhalter** will ich die letzte Bewertung samt Foto sehen, damit ich Entwicklung und Urteil nachvollziehe.

Akzeptanzkriterien:
- Die Spalte „Letzte Bewertung" zeigt `Datum: Notiz` des letzten Eintrags oder „—".
- Die Exemplar-Karte (BES-06) zeigt das Foto des jüngsten Eintrags, der ein `Foto` trägt.

### US-WAC-06 · Foto qualitativ von Claude bewerten lassen und ablegen · ✅
Als **Pflanzenhalter** will ich Fotos von Claude bewerten lassen und verkleinert im Vault ablegen, damit Messzahl, Urteil und Bild zusammengehören.

Akzeptanzkriterien (Bewertung):
- Der Halter misst selbst und liefert die Zahl. Claude bewertet das Foto rein qualitativ gegen `Erfolgskriterien_Kurz` und `Vergeilung_Anzeichen` und schreibt `Qualität` und eine kurze `Notiz` in **denselben** Log-Eintrag, sobald die Messzahl vorliegt.
- Claude bewertet nur, was sichtbar ist; keine Schätzung von Höhe, Substratfeuchte oder Wurzeln. Fehlt die Grundlage, bleibt `Notiz` weg.

Akzeptanzkriterien (Import, `foto_import.py EXEMPLAR DATUM QUELLDATEI`, auch mehrere Tripel):
- Der Log-Eintrag mit diesem Datum existiert vorher; sonst Abbruch mit Meldung.
- Ergebnis: `02-Areas/Pflanzen/Fotos/<Exemplar>/<Datum>.jpg`, lange Seite höchstens 1600 px, JPEG-Qualität 82, EXIF-Drehung angewendet, **EXIF/GPS entfernt**.
- Der Eintrag bekommt `Foto: "<Vault-Pfad>"`. Trägt er schon eines, bleibt er unverändert (idempotent, Datei wird nicht neu geschrieben).
- Ungültiges Datum, fehlende Notiz oder fehlende Quelldatei brechen mit klarer Meldung ab; `--dry-run` zeigt nur den Zielpfad.

### US-WAC-07 · Messdatum entspricht dem Tag der Messung · 🟡
Als **Pflanzenhalter** will ich, dass eine Messung unter dem Datum gespeichert wird, an dem ich sie eintrage, damit Raten stimmen.

Akzeptanzkriterien (Soll): Das Datum ist das lokale Kalenderdatum.

Ist: Der Wachstumsblock nutzt `new Date().toISOString().slice(0, 10)`, also das **UTC**-Datum. Im Sommer (CEST, UTC+2) wird eine Messung zwischen 00:00 und 02:00 mit dem Vortag gespeichert, im Winter zwischen 00:00 und 01:00. Das Anlegen-Formular rechnet dagegen korrekt lokal. → Backlog B-01.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-WAC-01 | `Wachstumslog` ist ein Array von `{Datum: "YYYY-MM-DD", Hoehe_cm: Zahl, Qualität: "Gesund"\|"Vergeilt/dünn", Notiz?: Text, Foto?: Vault-Pfad}`. Schlüssel `Qualität` mit Umlaut ist Teil des Formats. | ✅ |
| FR-WAC-02 | Die Rate ist ein Vergleich gegen den **eigenen** Verlauf; Zahlen ohne belegbare Quelle werden nicht angezeigt. | ✅ |
| FR-WAC-03 | Die Trendschwelle beträgt ±10 % (im Code fest verdrahtet). | ✅ |
| FR-WAC-04 | Einträge werden vor der Auswertung nach `Datum` sortiert; die Eingabereihenfolge ist egal. | ✅ |
| FR-WAC-05 | Der Wachstumsblock zeigt alle Exemplare, **auch Stecklinge**. | ✅ (offen, ob gewollt) |
| FR-WAC-06 | `foto_import.py` verwendet das Wachstumslog-Format per Textsuche (`  - Datum: "<Datum>"`, 2-Leerzeichen-Einrückung). Ein abweichend formatiertes Frontmatter (z. B. von Obsidian umgeschrieben, ohne Anführungszeichen) wird nicht gefunden. | 🟡 (B-06) |
| FR-WAC-07 | Mehr als eine Messung am selben Tag ist möglich, liefert aber keine Rate (Δ Tage = 0). | ✅ |
| FR-WAC-08 | Messen ist Handarbeit; es gibt keine Erinnerung, wenn die letzte Messung zu alt ist. | ⬜ (MON-04) |
