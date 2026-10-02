# 05 – Epic WAC: Wachstum, Vergeilung und Fotos

Ziel: Erfolg wird an der **eigenen** Historie jeder Pflanze gemessen, nicht an erfundenen Artdurchschnitten, und Längenzuwachs durch Lichtmangel zählt nicht als Erfolg.

Prototyp-Bezug: Epic WAC. Unterschiede: Messung am Handy mit Kamera, Foto-Verarbeitung serverseitig, KI-Bewertung als Vorschlag (Epic KI), Datum in der Zeitzone des Nutzers (NFR-08, löst B-01).

## Userstories

### US-WAC-01 · Messung erfassen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich eine Messzahl je Exemplar speichern, damit der Verlauf wächst.

Akzeptanzkriterien:
- Je Exemplar zeigt die Ansicht: „Was messen?" (Wachstumsmaß der Art), letzte Messung, Rate, Trend, letzte Bewertung und das Eingabeformular.
- Eingabe: Zahl (Schritt 0,5 cm), Qualität, optionale Notiz, optionales Foto. Nicht numerische oder negative Eingabe wird abgelehnt, ohne zu schreiben.
- Das Datum ist standardmäßig heute in der Zeitzone des Nutzers und änderbar (Nachtragen).
- Gemessen wird immer dieselbe Dimension an derselben Stelle.
- Das Speichern ist idempotent (US-QS-03).

### US-WAC-02 · Vergeilung beim Messen beurteilen · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Auswahl `Gesund` / `Vergeilt/dünn` (Voreinstellung `Gesund`).
- Hat die Art Vergeilung-Anzeichen, sind sie am Auswahlfeld einblendbar („woran erkennen?").
- Eine Messung ohne Qualität (importierter Altbestand) gilt als `Gesund`.

### US-WAC-03 · Wachstumsrate und Trend gegen den eigenen Schnitt · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Null Messungen: „noch keine Messung". Eine: „1 Messung — noch keine Rate".
- Ab zwei Messungen: Gesamtrate in cm/Jahr = (Δ Wert / Δ Tage) × 365 zwischen erster und letzter Messung.
- Ab drei: Trend = letzte Intervallrate gegen das Mittel aller vorherigen Intervallraten. Relative Abweichung > +10 % → schneller, < −10 % → langsamer, sonst stabil. Mittel 0 gilt als stabil.
- Bei zwei Messungen: „ab der 3. Messung siehst du hier einen Trend".
- Zwei Messungen am selben Tag oder in falscher Reihenfolge (Δ Tage ≤ 0) liefern keine Rate; vor der Auswertung wird nach Datum sortiert.
- **Kein** Vergleich mit einem Artdurchschnitt (P-08). Sobald genug eigene Daten aller Nutzer vorliegen, kann ein Vergleich eingeführt werden, nur mit Stichprobengröße und Mindestanzahl (siehe Nicht-Ziele in `16-Releases-und-Entscheidungen.md`).

### US-WAC-04 · Vergeilung übersteuert den Trend · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Ist die Qualität der letzten Messung `Vergeilt/dünn`, zeigt die Ansicht „Wachstum vergeilt/dünn — trotz Rate kein Erfolgssignal, siehe Erfolgskriterien", unabhängig von der Rate.
- Ein steigender Trend zählt nur zusammen mit `Gesund` als Erfolgssignal.

### US-WAC-05 · Verlauf und Fotos ansehen · ⬜ (Prototyp ✅)
Akzeptanzkriterien:
- Verlaufsdiagramm je Exemplar (Wert über Zeit) mit Markierung vergeilter Messungen.
- Fotostrecke in Zeitfolge; die Exemplarkarte (US-BES-06) zeigt das jüngste Foto.
- „Letzte Bewertung" zeigt Datum und Notiz der letzten Messung.

### US-WAC-06 · Foto bewerten lassen und ablegen · ⬜ (Prototyp ✅)
Als **Pflanzenhalter** will ich ein Foto bewerten lassen, damit Messzahl, Urteil und Bild zusammengehören.

Akzeptanzkriterien (Bewertung):
- Der Halter misst selbst und liefert die Zahl. Die KI bewertet das Foto **rein qualitativ** gegen Erfolgskriterien und Vergeilung-Anzeichen der Art und schlägt `Qualität` und eine kurze Notiz vor (US-KI-04). Der Halter übernimmt, ändert oder verwirft den Vorschlag.
- Die KI bewertet nur, was sichtbar ist; keine Schätzung von Höhe, Substratfeuchte oder Wurzeln. Fehlt die Grundlage, bleibt die Notiz leer.

Akzeptanzkriterien (Verarbeitung):
- Beim Hochladen wird das Bild gedreht (EXIF-Orientierung), die lange Seite auf höchstens 1600 px verkleinert, JPEG-Qualität 82, **EXIF/GPS entfernt**.
- Das Foto gehört zur Messung desselben Tages; ein zweites Foto zur selben Messung ersetzt nur nach Bestätigung.
- Ungültige Datei, zu große Datei oder fehlende Messung brechen mit klarer Meldung ab.

## Datenmodell

### DM-WAC-01 Messung

`Exemplar`, `Datum` (lokal), `Wert` (Zahl, cm oder Einheit des Wachstumsmaßes), `Qualität` (`Gesund` | `Vergeilt/dünn`), `Notiz?`, `Foto?`, `Bewertung_durch` (`Halter` | `KI-Vorschlag übernommen`).

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-WAC-02 | Die Rate ist ein Vergleich gegen den **eigenen** Verlauf; Zahlen ohne belegbare Quelle werden nicht angezeigt (P-08). | ⬜ |
| FR-WAC-03 | Trendschwelle ±10 % ist eine Voreinstellung, in der Logik zentral konfigurierbar. | ⬜ |
| FR-WAC-05 | Die Wachstumsansicht zeigt auch Stecklinge, mit Kennzeichnung „Steckling". (Offene Frage aus dem Prototyp, hier festgelegt: sichtbar, weil Stecklinge gemessen werden sollen.) | ⬜ |
| FR-WAC-07 | Mehr als eine Messung am selben Tag ist möglich, liefert aber keine Rate (Δ Tage = 0). | ⬜ |
| FR-WAC-08 | Eine zu alte letzte Messung (Voreinstellung 30 Tage, anpassbar) erzeugt eine Erinnerung (US-MON-04). Stecklinge sind ausgenommen oder haben einen kürzeren Rhythmus (Entscheidung offen). | ⬜ |
| FR-WAC-09 | Fotos sind Eigentum des Nutzers. Nach der Verarbeitung existiert nur noch die bereinigte Fassung (kein Original mit GPS). | ⬜ |
