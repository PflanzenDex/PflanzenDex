# Testprotokoll: US-BES-01 Art aus dem Katalog wählen oder neu anlegen (Issue #57)

**Branch:** `feat/bes-01-art` (von `origin/dev`, vor dem Push erneut mit `origin/dev` zusammengeführt)
**Umgebung:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in eigenem Container (Port 54683 aus `worktree-env.mjs`), API Port 55183, Web (Vite) Port 55683, Keycloak 26.8 mit dem Realm-Import aus dem Repo (eigener Wegwerf-Container auf Port 18581, weil der gemeinsame Anmeldedienst auf 18081 während des Tests von einer anderen Sitzung neu gestartet wurde; die Weiterleitungs-Adresse des Web-Clients wurde zur Laufzeit per Admin-API um Port 55683 ergänzt, nicht im Repo), Mailpit (gemeinsam, nur gelesen); Chromium über Playwright; Datum 2026-10-03.
**Methode:** Tests zuerst (rote Läufe in `bes-01/rot-*.txt`), dann Umsetzung, `make ci`, danach Bedienung von Hand (Playwright-Skript) gegen den echten Keycloak. Testkonten wurden im UI registriert (`mara…@example.test`, `ben…@example.test`). Screenshots Desktop 1440×900 und Mobil 375×812 in `bes-01/`.

Legende: ✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ Fehler · ⏭️ nicht geprüft

---

## 0. Rote Läufe vor der Implementierung und Gates

**Erwartet:** Die Tests aus den Kriterien scheitern, solange es die Funktion nicht gibt; danach ist `make ci` grün.

**Beobachtet:**

- ✅ Rot vor der Umsetzung: `rot-1-core.txt` (Module fehlen, 2 Dateien), `rot-4-api.txt` (alle 9 API-Tests rot), `rot-5-web.txt` (Modul fehlt).
- ⚠️ `rot-2-db.txt`: Der Datenbanktest lief ebenfalls rot, aber nur, weil die Tabelle `art` fehlte (13 Tests übersprungen, der Aufräumschritt scheiterte), nicht mit einzelnen roten Prüfungen.
- ✅ `rot-3-mandanttest.txt`: Mit der Migration, aber ohne Eintrag in `OHNE_KONTO_KENNUNG`, scheitert der generische Mandantentest an `art` und `art_name` (3 Tests rot); ein weiterer roter Test war ein Fehler in meinem Test (falscher Suchbegriff).
- ✅ `make ci` Exit-Code 0 mit allen Gates (Lint, Typen, Grenzen, Baseline, Knip, Format, Spec- und Rückverfolgbarkeitsprüfung, Tests mit Abdeckungsschwellen, Build). Tests: api 39, core 114, db 61, web 41.
- ✅ Der generische Mandantentest behandelt `art` und `art_name` als begründete Ausnahme und verlangt weiter erzwungene Zeilenregeln (`KATALOG_TABELLEN`); ein Test beweist, dass er anschlägt, wenn eine davon fehlt.
- ⚠️ Die Datenbanktests wurden zusätzlich gegen eine Datenbank mit einem Eigentümer ohne Superuser-Rechte gefahren (Regel `katalog_freigegeben` nötig): Die 14 Katalogtests bestehen. Mehrere ältere Tests anderer Stories scheitern in diesem Aufbau, weil sie die Tabellen mit dem Eigentümer statt mit der Anwendungsrolle abfragen; das ist nicht Teil dieser Story.

## 1. Kriterium: Suche nach lateinischem oder deutschem Namen, Profil sehen und wählen

**Erwartet:** Die Suche findet eine Art im Katalog über den Namen; ich sehe ihr Profil (Felder aus DM-BES-01) und wähle sie.

**Beobachtet:**

- ✅ Suche nach „bogenhanf“ (deutsch) und „dracaena“ (lateinisch) findet „Dracaena trifasciata“ (`12-nach-freigabe-ben-*.png`, `13-…`); Teilwörter, Groß-/Kleinschreibung und Akzente sind egal (DB- und Kerntests).
- ✅ Profil mit allen Feldern aus DM-BES-01 außer Bild und Merkmalen; Fehlendes steht als „unbekannt“ (P-08) (`06-profil-vorschlag-*.png`).
- ✅ „Diese Art wählen“ zeigt „Gewählt: Dracaena trifasciata …“ (`07-art-gewaehlt-*.png`).
- ⚠️ **Grenze:** „Wählen“ merkt sich die Art nur in der Oberfläche. Das Exemplar dazu entsteht mit US-BES-02; die Seite sagt das offen.
- ⚠️ **Grenze:** Der Katalog ist leer (`01-katalog-leer-*.png`), bis POK-03 oder Betreiber-Batches ihn füllen. Die Suche über freigegebene Arten ist mit einer per Prüfvorgang freigegebenen Art belegt, nicht mit einem echten Katalog.

## 2. Kriterium: Art nicht im Katalog, „Art vorschlagen“ mit allen Pflichtfeldern

**Erwartet:** Formular mit Pflichtfeldern; Status `Vorschlag`, nur für mich sichtbar, Prüfliste; ich kann die Art wählen.

**Beobachtet:**

- ✅ Ohne Treffer bietet die Seite „Art vorschlagen“ an (`02-keine-treffer-*.png`); das Formular übernimmt den Suchtext und erklärt Sichtbarkeit und Prüfliste vorher (`03-formular-leer-*.png`).
- ✅ Pflichtfelder (lateinischer Name, Schwierigkeit, Standard-Stufe, Lux, Wachstumsmaß, Vergeilung-Anzeichen, Erfolgskriterien) sind `required`; der leere Absendeversuch meldet im Browser 6 ungültige Felder (der Name war vorbelegt).
- ✅ Server-Prüfung (Browser-Prüfung abgeschaltet): „Aloe vera var. chinensis“ und Lux 0 ergeben „Bitte prüfe: Lateinischer Name, Lichtbedarf.“ (`04-server-fehler-*.png`); nichts wurde geschrieben (Test).
- ✅ Gültiger Vorschlag: Profil mit Marke „Vorschlag“ und dem Hinweis „nur für dich sichtbar … Art prüfen lassen, dann zählt sie.“ (`06-…`).
- ✅ Ein zweites Konto sieht den Vorschlag weder in der Liste noch per Kennung (`11-fremdes-konto-sieht-nichts-*.png`; API-Test: 404); ein Betreiber sieht private Arten ebenfalls nicht (Skript: 0 Zeilen).
- ✅ Der Vorschlag liegt als Prüfvorgang `vorschlag` in der Prüfliste des Erstellers (DB-Test).
- ✅ Nach Freigabe durch einen Betreiber (über die Datenbankschicht, die Prüfer-Oberfläche kommt mit BES-10) sehen beide Konten die Art als „Geprüft“ ohne Vorschlags-Hinweis (`12-…`, `13-…`).
- ⏭️ Der Weg über den Auftrag an den KI-Client (US-KI-08) existiert noch nicht (R4).
- ⏭️ „Ich kann trotzdem ein Exemplar anlegen“ und „zählt im Pokédex nach der Freigabe“: abhängig von BES-02 und POK-06, nicht prüfbar.

## 3. Kriterium: Art ohne Epitheton

**Erwartet:** Als Eintrag erlaubt, zählt nicht als Pokédex-Fang.

**Beobachtet:**

- ✅ „Haworthia“ lässt sich vorschlagen; das Profil sagt „Nur die Gattung ist angegeben. Ein solcher Eintrag zählt nicht als Pokédex-Fang.“ (`10-nur-gattung-*.png`).
- ⏭️ Der Pokédex selbst existiert nicht; geprüft ist nur der Hinweis.

## 4. Kriterium: Dubletten und Synonyme

**Erwartet:** Gleicher normierter Name oder Synonym wird erkannt und auf die vorhandene Art verwiesen; die Suche findet Synonyme (Sansevieria → Dracaena).

**Beobachtet:**

- ✅ Suche „sansevieria“ zeigt „Dracaena trifasciata – Gefunden über Synonym: Sansevieria trifasciata“ (`08-suche-synonym-*.png`).
- ✅ Vorschlag „Sansevieria trifasciata“ wird abgelehnt: „Diese Art gibt es schon …“ mit Knopf „Vorhandene Art ansehen: Dracaena trifasciata“, der das Profil öffnet (`09-dublette-*.png`). Gleiche Schreibweisen mit anderer Groß-/Kleinschreibung oder Leerzeichen zählen als gleich (Tests).
- ⚠️ Private Vorschläge verschiedener Konten gelten absichtlich nicht als Dubletten, sonst verriete der Fehler fremde Daten; BES-10 führt sie zusammen.
- ⚠️ Beim ersten Skriptlauf zeigte die Liste nach „bogenhanf“ noch das Ergebnis der vorigen Suche, weil das Skript vor der Entprellung (250 ms) las; im zweiten Lauf stimmt die Liste. Die Entprellung ist kein Fehler, aber ein sichtbares Zwischenbild.

## 5. Mandantentrennung, Wiederholungsschutz, P-08

- ✅ Zeilenregeln auf `art` und `art_name`: Fremde Vorschläge sind unsichtbar, Einfügen nur mit eigenem Prüfvorgang, `erstellt_von` ≠ `nutzer` nur für Prüfer, kein Ändern und Löschen für die Anwendung (DB-Tests).
- ✅ Gleicher `Idempotency-Key` legt keine zweite Art an; ohne Schlüssel 400 (Tests).
- ✅ Unbekannte Werte bleiben `null` und erscheinen als „unbekannt“; keine Zahl wird ergänzt. Grenzen (Name 120, Texte 200/1.000 Zeichen, Lux 1–200.000) sind **Annahmen**.

## 6. Mobil (375 px) und Bedienung

- ✅ Alle Zustände mobil als Screenshot; Dokumentbreite 375 px bei 375 px Fenster (kein horizontales Scrollen) in allen Schritten.
- ⚠️ Im Desktop-Formular sitzen Auswahlfelder und Eingabefelder in der Zweispaltenansicht leicht versetzt (`09-dublette-desktop.png`), weil Hilfetexte die Zeilenhöhe verschieden machen. Kosmetik, nicht behoben.
- ⚠️ Das Profil ist mobil lang (18 Felder untereinander); Verdichten wäre Folgearbeit.
- ⚠️ Browser-Konsole: ein `pageerror` („Cannot read properties of null (reading 'addEventListener')“, vermutlich auf der Keycloak-Seite, nicht zugeordnet) sowie die erwarteten 400 und 409 der absichtlichen Fehlversuche.
- ⏭️ Keine Kontrastmessung, kein Test mit Bildschirmleser, kein Dunkelmodus-Screenshot.

## Offene Punkte

- Katalog-Job (POK-03) und Betreiber-Batches fehlen: ohne sie bleibt der Katalog leer und nur eigene Vorschläge sind sichtbar.
- Bearbeiten eines eigenen Vorschlags, Versionen (FR-BES-12) und Bild/Merkmale fehlen.
- TE-08 lässt jeden Nutzer Prüfvorgänge mit Status `ki_ungeprueft` anlegen; die Spec nennt diesen Status für Betreiber-Batches (für alle sichtbar). Hier bleibt er privat; die Rechte müssen mit dem KI-Zugang (R4/R5) geklärt werden.
