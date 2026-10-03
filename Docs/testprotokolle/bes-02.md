# Testprotokoll: US-BES-02 Exemplar anlegen (Issue #58)

**Branch:** `feat/bes-02-exemplar` (von `origin/feat/bes-01-art`, enthält bis zu deren Merge die Commits von #225, #229, #230, #224)
**Umgebung:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 im eigenen Container (Port 54874 aus `worktree-env.mjs`), API Port 55374, Web (Vite) Port 55874, Keycloak 26.8 mit dem Realm-Import aus dem Repo in einem eigenen Wegwerf-Container auf Port 18681 (der gemeinsame Anmeldedienst auf 18081 gehört einer anderen Sitzung und wurde nicht angefasst). Für den Test wurde eine Kopie des Realms mit angepasster Weiterleitungs-Adresse (Port 55874) und zwei vorab bestätigten Testkonten (`mara-bes2@…`, `ben-bes2@…`) benutzt; sie liegt außerhalb des Repos. Chromium über Playwright (Zeitzone des Browsers Europe/Berlin); Datum 2026-10-03.
**Methode:** Tests zuerst (rote Läufe in `bes-02/rot-*.txt`), dann Umsetzung, `make ci`, danach Bedienung von Hand (Playwright-Skript) gegen den echten Keycloak. Screenshots Desktop 1440×900 und Mobil 375×812 in `bes-02/`, die rohen Beobachtungen in `bes-02/beobachtung.json`. Container und Server wurden danach entfernt.

Legende: ✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ Fehler · ⏭️ nicht geprüft

---

## 0. Rote Läufe vor der Implementierung und Gates

**Erwartet:** Die Tests aus den Kriterien scheitern, solange es die Funktion nicht gibt; danach ist `make ci` grün.

**Beobachtet:**

- ✅ `rot-core.txt`: 28 von 30 Tests rot (Skelett ohne Verhalten; 2 Tests liefen zufällig grün, weil das Skelett ohnehin ablehnt).
- ✅ `rot-db.txt`: 5 von 6 Tests rot, weil die Tabelle `exemplar` fehlt.
- ✅ `rot-mandanttest.txt`: Mit den Migrationen, aber ohne Fixture, scheitert der generische Mandantentest an `exemplar: keine Fixture in fixtures.ts` (2 Tests rot). Der Modul- und AB-10-Test blieb grün: der zusammengesetzte Fremdschlüssel auf `standort` ist erlaubt.
- ✅ `rot-api.txt`: alle 14 API-Tests rot (Route fehlt).
- ⚠️ `rot-web.txt`: rot nur, weil die Module fehlten (Import nicht auflösbar), nicht mit einzelnen roten Prüfungen.
- ✅ `make ci` Exit-Code 0 mit allen Gates (Lint, Typen, Grenzen, Baseline, Knip, Format, Spec- und Rückverfolgbarkeitsprüfung, Docs, Tests mit Abdeckungsschwellen, Build).

## 1. Kriterium: Pflicht ist die Art; Vorbelegung

**Erwartet:** Mit der Art entsteht ein Exemplar; Name nach Namensregel, Standort nach der Phase, `Gefangen_Am` = heutiges lokales Datum, leere Messreihe und Behandlungsliste.

**Beobachtet:**

- ✅ Aus dem Katalog „Diese Art wählen“ öffnet das Formular „Exemplar anlegen“ mit Art, Namensvorschau „Name: Bogenhanf“ und ohne Pflichtfeld außer der Art (`03-formular-*.png`, 0 `required`-Felder im Formular).
- ✅ Anlegen nur mit der Art: Exemplar „Bogenhanf“, „Gefangen am 03.10.2026“ (erwartet nach Berliner Datum: 03.10.2026), „noch keine Messung · keine Behandlung“ (`04-angelegt-*.png`). Messreihe und Behandlungsliste sind abgeleitet und leer (Kerntest, kein Eintrag in der Datenbank).
- ✅ Die Liste bleibt nach Neuladen bestehen (2 Exemplare).
- ⚠️ **Grenze (Soll-Standort):** Der Standort ist „unbekannt“, solange der Halter keinen wählt, und die Seite sagt das offen. Den Soll-Standort der Phase liefert der Port `SollStandortQuelle`, den erst `pflege` (PHA) und das Pflegeprofil (BES-09) umsetzen. Die Kerntests prüfen den Port mit einem Stub (Art und lokales Datum kommen an, Antwort wird übernommen, `null` bleibt `null`); mit echter Phasenlogik ist es nicht geprüft (⏭️).
- ⚠️ Annahme: Der Exemplarname nutzt den deutschen Namen der Art, sonst den lateinischen.

## 2. Kriterium: Gefangen_Am im lokalen Datum

**Erwartet:** Das Datum folgt der Zeitzone des Nutzers, nicht UTC (FR-BES-04, NFR-08).

**Beobachtet:**

- ✅ Tests (`datum.test.ts`, `anlegen.test.ts`): derselbe Zeitpunkt 23:30 UTC ergibt in Berlin den 3., in New York den 2. Oktober; Zeitumstellung am 2026-03-29 verschiebt nichts; die Datenbank liefert das Datum als Text, auch bei abweichender `TZ` des Servers.
- ✅ Von Hand (API mit echtem Token): `Pacific/Kiritimati` ergibt `2026-10-04`, UTC war noch der 3.; eine unbekannte Zeitzone wird mit `eingabe.ungueltig` abgelehnt.
- ⚠️ Die Zeitzone schickt vorerst das Gerät mit jedem Anlegen mit; das Profil kennt noch keine (US-ACC-02).

## 3. Kriterium: Name steht vor dem Speichern fest; Dublette

**Erwartet:** Existiert der Name, wird nichts verändert und die Namensregel wird angewendet.

**Beobachtet:**

- ✅ Zweites Exemplar ohne Kennzeichen: Fehlerkasten „Ein Exemplar mit diesem Namen gibt es schon …“, „Schon vorhanden: Bogenhanf“, Hinweis auf das Kennzeichen; die Anzahl der Exemplare bleibt 1 (`05-name-vergeben-*.png`).
- ✅ Mit Kennzeichen „rot“ zeigt die Vorschau „Name: Bogenhanf – rot“, nach dem Speichern steht es mit dem gewählten Standort „Regal Süd“ in der Liste (`06-…`, `07-…`). Das erste Exemplar behält seinen Namen.
- ✅ Tests: Kennzeichen sind je Art nicht doppelt (Schreibweise egal), ohne Änderung; zwei Konten dürfen denselben Namen führen.
- ⚠️ **Grenze:** Die Regeln ab dem dritten Exemplar (fehlende Kennzeichen nachfragen, Umbenennen) gehören zu US-BES-03 und fehlen.

## 4. Mandantentrennung und Wiederholungsschutz

**Beobachtet:**

- ✅ Der generische Mandantentest deckt `exemplar` ab (Fixture `FIXTURES_BESTAND`); Standort eines fremden Kontos wird vom zusammengesetzten Fremdschlüssel abgelehnt.
- ✅ Von Hand: Konto Ben sieht keine Exemplare (`08-fremdes-konto-leer-*.png`); sein Abruf des Exemplars von Mara ergibt 404 `exemplar.nicht_gefunden`, die private Art von Mara wählen 404 `art.nicht_gefunden`.
- ✅ Gleicher `Idempotency-Key` legt nicht doppelt an (Kern- und API-Test).
- ⏭️ Doppelklick im Browser nicht von Hand geprüft; das Schaltfeld ist während des Sendens deaktiviert.

## 5. Mobil und Barrierefreiheit

- ✅ Mobil 375×812: kein waagerechtes Scrollen, alle Knöpfe, Felder und Auswahllisten mindestens 48 px hoch (Messung im Skript).
- ❌→✅ Gefunden und behoben: Mit dem vierten Reiter „Bestand“ lief die Hauptnavigation mobil über (Breite 448 statt 375 px). Die Reiter brechen jetzt um (`stil.css`).
- ⏭️ Bildschirmleser und Tastaturbedienung nicht geprüft; Felder haben Beschriftungen, Fehler sind `role="alert"`.

## Offene Punkte

- Soll-Standort der Phase (PHA-01, FR-PHA-05) und Pflegeprofil (BES-09): Port steht, Umsetzung fehlt.
- Kennzeichen ab dem dritten Exemplar, Umbenennen (BES-03); Archivieren (BES-07); Hinweise für Exemplare ohne Standort (BES-08).
- Art-Verweis ohne Datenbank-Fremdschlüssel (AB-10 erlaubt nur `(konto_id, id)`, der Katalog hat keine Konto-Kennung): Entscheidung des Besitzers, ob eine Ausnahme für Katalogtabellen gewünscht ist.
- Zonen-Löschprüfung (`ZonenNutzung`): Exemplare verweisen noch auf keine Zone, nur über den Standort; die Standort-Quelle meldet das schon. Eine eigene Quelle von `bestand` kommt mit dem Zonen-Override (BES-04).
- Der Standort-Test im Browser legte den Standort über die API an (Licht-Seite ist LIC-05 und dort geprüft).
