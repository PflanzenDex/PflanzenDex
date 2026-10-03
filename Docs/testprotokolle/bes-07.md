# Testprotokoll: US-BES-07 Eingegangene oder abgegebene Pflanze archivieren (Issue #63)

**Branch:** `feat/bes-07-eingegangene-oder-abgegebene` (von `origin/dev`, Stand nach US-WAC-01 und US-LIC-01)
**Umgebung:** WSL2/Linux, Node 25, Docker; PostgreSQL 16 im eigenen Container (Port 54604 aus `worktree-env.mjs`), API Port 55104, Web (Vite) Port 55604, Keycloak 26.8 mit dem Realm-Import aus dem Repo in einem eigenen Wegwerf-Container auf Port 18791 (der gemeinsame Anmeldedienst auf 18081 gehört einer anderen Sitzung und wurde nicht angefasst). Der Realm ist eine Kopie mit angepasster Weiterleitungs-Adresse (`http://localhost:55604`) und zwei vorab bestätigten Testkonten (`mara-bes7`, `ben-bes7`); sie liegt außerhalb des Repos. Chromium über Playwright (Zeitzone Europe/Berlin, Locale de-DE); Datum 2026-10-03.
**Methode:** Tests zuerst (rote Läufe in `bes-07/rot-*.txt`), dann Umsetzung, `make ci`, danach Bedienung von Hand (Playwright-Skript, nicht eingecheckt) gegen den echten Keycloak. Die Arten und Exemplare wurden mit dem Token des Kontos über die API angelegt, alles Weitere über die Oberfläche. Screenshots Desktop 1440×900 und Mobil 375×812 in `bes-07/`, rohe Messwerte (Texte, Antworten, axe, Zielgrößen) in `bes-07/beobachtung.json`. Container und Server wurden danach entfernt.

Legende: ✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ Fehler · ⏭️ nicht geprüft

---

## 0. Rote Läufe und Gates

- ✅ `rot-core.txt`: 21 von 55 Tests rot (die Operationen waren Skelette ohne Verhalten, die Listen filterten nicht). Die übrigen Tests im Lauf waren schon grün (Eingabeprüfung steht im Skelett).
- ✅ `rot-db.txt`: 6 von 15 rot (Spalten und Methoden fehlten).
- ✅ `rot-api.txt`: 10 von 13 rot (Routen fehlten: 404).
- ✅ `rot-web.txt`: 10 von 10 rot (Skelett des Clients, keine Oberfläche).
- ✅ `make ci` Exit-Code 0 (Lint, Typen, Grenzen AB-7 bis AB-14, Baseline, Knip, Spec-, Prinzipien- und Skill-Prüfung, Duplikate, Format, Docs, Tests mit Abdeckungsschwellen, CRAP, Build).
- ⚠️ Ein Wiederholungslauf der Abdeckung meldet nur Hinweise „Schwelle könnte steigen“; die Schwellen wurden nicht angefasst.

## 1. Kriterium: „Archivieren“ mit Grund setzt Status, Datum und Grund

**Erwartet:** Archivieren mit `eingegangen`, `abgegeben`, `getauscht`, `verschenkt`, `verkauft` oder frei setzt `Status: Archiviert`, `Archiviert_Am`, `Archiviert_Grund`.

**Beobachtet:**

- ✅ Jede Karte hat „Archivieren“. Das Formular (`02-archivieren-formular-*.png`) bietet genau diese fünf Gründe und „anderer Grund …“ an (`beobachtung.json`: `gruende`).
- ✅ Mit „verkauft“: Meldung „… ist archiviert. Du findest es im Archiv und kannst es dort wiederherstellen.“ (P-09); im Archiv steht „Archiviert am 03.10.2026“ und „Grund: verkauft“ (`04-archiviert-mit-archiv-*.png`).
- ✅ Freier Grund „  Katze war schneller “ wird getrimmt gespeichert (`05-zwei-archiviert-freier-grund-*.png`).
- ✅ Ein leerer freier Grund wird nicht gesendet, es erscheint „Bitte nenne einen Grund …“ (`03-freier-grund-leer-*.png`); „Abbrechen“ lässt alle drei Karten stehen.
- ✅ Datum als lokales Kalenderdatum: Kerntest mit 23:30 UTC (Berlin 3. Oktober, New York 2. Oktober), DB-Test mit Zeitzone des Servers Pacific/Kiritimati, API-Test. Von Hand wurde nur Berlin geprüft.
- ✅ Ein zweites Archivieren per API: 409 `exemplar.bereits_archiviert`, Datum und Grund der ersten bleiben (`doppeltArchivieren`).
- ⚠️ **Annahme:** Grund bis 250 Zeichen (Startwert, DB und Kern gleich).

## 2. Kriterium: Archivierte fehlen in Auswertungen, bleiben aber einsehbar und wiederherstellbar

**Beobachtet:**

- ✅ Die Karten im Reiter Bestand zeigen nur noch die nicht archivierten (`kartenNachArchiv`, nach dem Neuladen `nachReload.karten`). Die Ports für Messungen und Behandlungen erfahren die Kennungen archivierter Exemplare nicht (Kern- und API-Test).
- ✅ Wachstum: Messen eines archivierten Exemplars wird mit 409 `exemplar.archiviert` abgelehnt, nichts wird geschrieben (`messenArchiviert`, Kern- und API-Test).
- ✅ Pflegephasen: nur `pflanze` wird gelistet (Kerntest aus PHA-01 mit einem archivierten Exemplar). Von Hand war die Liste leer (die Beispielarten haben keine Ruhephase), das ist **kein** Nachweis.
- ✅ Historie: `GET /exemplare/:id` liefert das archivierte Exemplar mit Datum, Grund und Fangdatum (`historie`); der Abschnitt „Archiv“ zeigt Art, Datum und Grund.
- ✅ Wiederherstellen (`07-wiederhergestellt-*.png`): Meldung „… ist wiederhergestellt und steht wieder im Bestand.“, Karte wieder da, Archiv ohne den Eintrag, `archiviertAm` und `archiviertGrund` wieder `null`, Status `pflanze` (`wiederhergestellt`). Ein Steckling bleibt Steckling (Kern- und DB-Test).
- ⏭️ Behandlungen, Pokédex-Besitz, Verteilung und Heute-Liste gibt es noch nicht; sie sind nicht umgesetzt und nicht geprüft. Künftige Auswertungen müssen mit `istAktiv` filtern (README).
- ⚠️ Die Messreihe eines archivierten Exemplars ist über `GET /exemplare/:id/messungen` lesbar, hat in der Oberfläche aber keinen Zugang.

## 3. Kriterium: Tausch archiviert automatisch (US-SOZ-11)

- ⏭️ Nicht umgesetzt: gehört zu SOZ. Die Operation `exemplar.archivieren` nimmt jeden Grund frei entgegen, SOZ kann sie mit „Getauscht mit <Anzeigename>“ aufrufen. Deshalb bleibt die Story 🟨.

## 4. Mandantentrennung (P-04)

- ✅ Kern-, DB- und API-Tests mit zwei Konten: fremdes Exemplar archivieren oder wiederherstellen ergibt `exemplar.nicht_gefunden` (404) und sieht aus wie ein unbekanntes; nichts ändert sich. Das Archiv enthält nur eigene Exemplare. Die Spalten gehören zur Tabelle `exemplar`, deren generischer Mandantentest weiter grün ist.
- ✅ Von Hand: Ben sieht ein leeres Archiv (`benArchivApi`), seine Versuche, Maras Exemplare zu archivieren oder wiederherzustellen, enden mit 404 (`benArchiviertMaras`, `benWiederherstellenMaras`); sein Bestand ist leer (`06-fremdes-konto-leer-*.png`).

## 5. Layout und Barrierefreiheit (grob)

- ✅ Mobil 375 px: kein waagerechtes Scrollen (`scrollBreite` = 375 in allen Ansichten), alle Knöpfe, Auswahlfelder und Eingaben mindestens 44 px hoch (`kleineZiele: []`).
- ✅ axe (WCAG 2.1 AA) auf Bestand, Formular, Bestand mit Archiv und dunklem Schema: keine Verstöße in den neuen Teilen.
- ⚠️ axe meldet im **hellen** Schema weiterhin den Kontrast der Fußzeile „Version …“ (schon in BES-06 gefunden, gehört nicht zu diesem Ticket, nicht geändert). Im dunklen Schema keine Verstöße (`08-dunkel-*.png`).
- ⚠️ Nach dem Archivieren steht die Meldung schon, während die Liste neu lädt; das Archiv erscheint einen Moment später (im Skript abgewartet, nicht gemessen).
- ⏭️ Bildschirmleser nicht geprüft.

## Offene Punkte

- Automatische Archivierung beim Tausch (SOZ-11) und die Auswertungen, die es noch nicht gibt (Verteilung, Behandlungen, Pokédex-Besitz, Heute-Liste).
- Der Name eines archivierten Exemplars bleibt belegt (Annahme, damit das Wiederherstellen nie kollidiert): ein neues Exemplar derselben Art braucht ein Kennzeichen. Falls das stört, ist eine eigene Entscheidung nötig (Eindeutigkeit nur unter aktiven Exemplaren, dann Umbenennung beim Wiederherstellen).
- Kein Zugang zur Messreihe eines archivierten Exemplars in der Oberfläche.
- Fußzeilen-Kontrast der App (separater Fund).
