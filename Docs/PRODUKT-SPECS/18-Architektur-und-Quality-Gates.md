# 18 – Architektur und Quality Gates

Stand: 2026-10-02 · **Entwurf.** Erweitert den Technik-Entwurf aus `16-Releases-und-Entscheidungen.md` um verbindliche **Qualitätsschranken** (Quality Gates). Vorbild ist das Regelwerk des Projekts AdventskalenderTombola (`~/root/Code-Root/AdventskalenderTombola/`): Git-Hooks, CI-Pipeline, Strukturprüfer, Architekturgrenzen, Coverage-Schwellen, Prinzipienregister und Definition-of-Done-Listen.

Grundsatz: **Eine Regel, die nur in einem Dokument steht, ist ein Wunsch. Eine Regel, die ein Skript prüft und die den Merge blockiert, ist ein Gate.** Gates entstehen schrittweise (US-QG-06), nicht alle vor dem ersten Code. **Wie** Gates ausgelöst und betrieben werden (Task-Runner, Hooks, Routinen, Skills, Prozess, Release), steht in `19-Entwicklungsprozess-und-Automatisierung.md`.

## Was übernommen wird, was nicht

Quelle: Tombola-Repo (Flask/React, Jira, Mehr-Team). PflanzenDex ist (Annahme) TypeScript durchgehend, Kleinteam, Greenfield (E-01).

| Aus Tombola | Übernahme | Anpassung |
|---|---|---|
| Conventional Commits mit commitlint (`commit-msg`-Hook) | ja | Typen und Scopes aus den Epics (z. B. `feat(soz)`) |
| Pre-push: Lint + Typecheck + Strukturcheck | ja | nur schnelle Prüfungen, Tests laufen in CI |
| CI: Secret-Scan, Lint, Typecheck, Tests mit Coverage, Security-Audit, Integration, E2E, Lighthouse | ja | Werkzeuge auf TypeScript; Python-Prüfer nur, solange Python-Skripte bleiben (E-01) |
| Strukturregeln FE-1…6 / BE-1…3 (Co-location, Barrels, Test-Namen) | ja, in eigener Fassung | Paketstruktur der Fachlogik statt `features/api/domain` |
| Architekturgrenzen AB-1/AB-2 mit `KNOWN_EXCEPTIONS` | ja | Grenzen aus P-02 und NFR-ARC-01 (siehe QG-A) |
| Dateilänge ≤ 200 Zeilen, Ausnahme per Marker in den ersten 5 Zeilen | ja (Wert ist Annahme) | Marker verlangt Begründung |
| `error_code` statt Backend-Message, Übersetzungsparität | ja | Sprache zunächst nur Deutsch, Parität sobald zweite Sprache existiert |
| Prinzipienregister mit Reifegrad `observed → measurable → checked → gated` | ja | gleiches Format, eigener Ordner |
| DoD-Listen (global, frontend, backend, security, PR/Release) | ja, gekürzt | um Spec-Rückverfolgbarkeit (P-06) und Datenschutz ergänzt |
| Stop-Hook mit blindem Review und Fehleranalyse | optional | später, wenn Review-Last es rechtfertigt |
| semantic-release nach grüner CI auf `main` | ja | ein Paket, ein Release-Strang |
| Jira-Statusregeln, Projektpraktikum-Grenze, ClamAV, Codecov | nein | projektspezifisch bzw. nicht gebraucht (Foto-Virenscan siehe offene Fragen) |

## Gate-Matrix

Wo läuft welches Gate? **B** = blockiert, **R** = nur Bericht (Ratchet-Phase).

| ID | Gate | Stufe | Werkzeug (Vorschlag) | Schwelle / Regel | Wirkung |
|---|---|---|---|---|---|
| QG-C1 | Commit-Nachricht | `commit-msg` | commitlint | Conventional Commits, Typ aus fester Liste, Kopfzeile ≤ 100 Zeichen, kein Punkt, Typ klein | B |
| QG-C2 | Lint | pre-push + CI | ESLint (+ Prettier) | keine Fehler; `max-lines` 200 (Tests ausgenommen) | B |
| QG-C3 | Typen | pre-push + CI | `tsc --noEmit`, strict | keine Fehler; kein `any` ohne Marker | B |
| QG-C4 | Struktur | pre-push + CI | eigenes Skript (wie `check-component-structure`) | Regeln aus FR-QG-04 | B |
| QG-C5 | Architekturgrenzen | pre-push + CI | Import-Grenzen-Prüfer | Regeln aus FR-QG-05 | B |
| QG-C6 | Tote Dinge und Duplikate | PR | Fallow oder gleichwertig (ungenutzte Exporte, Duplikate, Komplexität) | auf geänderten Dateien blockierend, Gesamtbericht informativ | B auf Diff, R gesamt |
| QG-C7 | Abhängigkeiten | CI | deptry-Äquivalent (`knip`/`depcheck`) | keine ungenutzten oder undeklarierten Pakete | B |
| QG-K1 | Zyklomatische Komplexität je Funktion | pre-push + CI | ESLint `complexity` (Tombola: Ruff-mccabe 15) | Allgemein ≤ 15, Fachlogik `core` ≤ 10 (Annahme) | B |
| QG-K2 | Kognitive Komplexität, Länge, Tiefe | CI | ESLint (`sonarjs`) oder Fallow `health` | kognitiv ≤ 30 allgemein, ≤ 15 in `core` (Annahme); Funktion ≤ 60 Zeilen, Verschachtelung ≤ 4, Parameter ≤ 4 (Annahme) | B auf Diff, R gesamt |
| QG-K3 | Risiko = Komplexität × fehlende Tests (CRAP) | PR | Fallow `health` oder gleichwertig | CRAP ≤ 450 je Funktion (Tombola-Wert); komplexe Funktion ohne Test fällt durch | B auf Diff |
| QG-K4 | Duplikate | PR | Fallow `duplicates` | ab 3 gleichen Fragmenten (Tombola: `minOccurrences 3`) | B auf Diff |
| QG-T1 | Unit-Tests Fachlogik | CI | Vitest | Coverage der Fachlogik ≥ 90 % Zeilen (Annahme), Gesamt ≥ 80 % (Annahme), nur anheben | B |
| QG-T2 | Integrationstests | CI | Vitest + echte Test-DB | Kernabläufe aus FR-QG-08 grün | B |
| QG-T3 | End-to-End | PR auf `main` | Playwright mobil + Desktop | Kernabläufe R1 aus `16-…` grün | B |
| QG-T4 | Spec-Rückverfolgbarkeit | CI | Skript (FR-QG-06) | jede ✅-Story hat Test mit Story-ID | B |
| QG-S1 | Secret-Scan | CI | grep-Regeln + Gitleaks | keine Schlüssel, Tokens, Partner-IDs im Repo | B |
| QG-S2 | Abhängigkeits-Audit | CI | `npm audit` / OSV-Scanner | keine bekannten hohen Schwachstellen ohne dokumentierte Ausnahme | B |
| QG-S3 | Statische Sicherheitsanalyse | CI | ESLint-Security-Regeln / Semgrep | keine Treffer mittel+ | B |
| QG-D1 | Mandantentrennung | CI | Integrationstest (FR-QG-07) | Nutzer A liest/ändert nie Daten von B | B |
| QG-D2 | Freigabe-Whitelist | CI | Vertragstest (FR-QG-07) | soziale Ausgaben enthalten nur freigegebene Felder | B |
| QG-D3 | Foto-Bereinigung | CI | Test mit Bild mit EXIF/GPS | gespeichertes Bild hat keine EXIF/GPS-Daten | B |
| QG-U1 | Performance und Barrierefreiheit | PR auf `main` | Lighthouse CI, axe in Playwright | Mobil-Werte ≥ Schwelle aus FR-QG-09 | R, dann B |
| QG-U2 | Doku-Prüfung | CI | markdownlint, Link-Prüfer, Spec-Konsistenz (FR-QG-03) | keine toten Links, IDs eindeutig, Zähler stimmen | B |
| QG-U3 | Changelog | PR | Skript | `feat:`/`fix:` braucht Eintrag oder `[skip-changelog]` | B |
| QG-R1 | Release | `main` | semantic-release | nur nach grüner CI, nie manuell | B |

## Userstories

### US-QG-01 · Fehler früh und lokal finden · ⬜
Als **Entwickler** will ich, dass die schnellen Prüfungen vor dem Push laufen, damit CI selten die Überraschung ist.

Akzeptanzkriterien:
- `commit-msg`: Verstoß gegen QG-C1 lehnt den Commit ab und nennt die Regel.
- `pre-push`: QG-C2 bis QG-C5 laufen in dieser Reihenfolge, der erste Fehler bricht ab und nennt den Befehl zum erneuten Ausführen.
- Die Prüfungen laufen unter dem Zeitbudget **60 Sekunden** (Annahme) auf einem normalen Entwicklungsrechner; was länger dauert, gehört in CI.
- Dieselben Befehle gibt es als `make`-/`npm`-Ziele (`lint`, `test`, `ci`), damit lokal und CI dasselbe ausführen (FR-QG-01).

### US-QG-02 · CI entscheidet über den Merge · ⬜
Als **Entwickler** will ich, dass ein Merge in `main` nur mit grüner Pipeline möglich ist.

Akzeptanzkriterien:
- Jobs: Schnell-Checks (Secrets), Lint/Typen/Struktur/Grenzen, Tests mit Coverage, Sicherheitsprüfung, Integration, End-to-End, Lighthouse, Doku (QG-S1 bis QG-U3).
- Ein Sammelstatus „ci-status" ist die einzige Pflichtprüfung des Branch-Schutzes (FR-QG-02); einzelne Jobs können umorganisiert werden, ohne den Schutz zu ändern.
- **Scope-Steuerung** (aus Tombola): Die volle Suite läuft bei PRs nach `main`, bei manuellem Start und bei Abhängigkeits-Updates; Feature-Branches bekommen die schnellen Gates lokal und per Pre-Push. Das spart Laufzeit, ohne `main` zu gefährden.
- Neue Pushes brechen laufende Läufe derselben Ref ab (Concurrency).
- Jeder Job hat ein Zeitlimit; Überschreitung ist ein Fehler, kein stilles Hängen.
- Fehlermeldungen nennen die verletzte Regel und die Datei (nicht nur „failed").

### US-QG-03 · Architekturgrenzen sind maschinell geprüft · ⬜
Als **Entwickler** will ich, dass Schichtverletzungen nicht durch Review, sondern durch ein Skript auffallen.

Akzeptanzkriterien:
- Die Regeln aus FR-QG-04 und FR-QG-05 sind als Prüfskripte umgesetzt und haben **eigene Tests** (wie `check_project_structure_test.py` in Tombola).
- Ein Verstoß bricht QG-C4/QG-C5 mit Regel-ID (z. B. `AB-2`) und Pfad ab.
- Bekannte, bewusst akzeptierte Altlasten stehen in einer expliziten Ausnahmeliste im Skript, **mit Kommentar warum**; neue Einträge sind nicht erlaubt (nur Reviewer mit Begründung). Die Liste darf nur kürzer werden.
- Ausnahme je Datei per Marker in den ersten 5 Zeilen (`STRUCTURE_IGNORE: <Grund>`, `MAX_LINES_IGNORE: <Grund>`); ein Marker ohne Grund ist selbst ein Fehler.

### US-QG-04 · Spec, Code und Test hängen sichtbar zusammen · ⬜
Als **Entwickler (oder KI)** will ich von jeder Story zu ihren Tests und zurück kommen (P-06).

Akzeptanzkriterien:
- Jede Story in `Docs/PRODUKT-SPECS/` mit Status ✅ hat mindestens einen Test, dessen Name die Story-ID trägt (z. B. `US-PHA-01`).
- Ein Test, der eine unbekannte oder ⬜-Story-ID nennt, wird gemeldet (Hinweis, kein Fehler).
- Das Skript prüft zusätzlich die Konsistenz der Spec selbst: IDs eindeutig, Status-Übersicht in `README.md` stimmt mit den Dateien überein, Verweise auf `US-/FR-/DM-/E-`IDs zeigen auf vorhandene Einträge (Verweise auf IDs des Prototyp-Ordners sind als solche markiert und ausgenommen).
- Eine Änderung an Fachlogik ohne grünen Story-Test gilt nicht als fertig (DoD, FR-QG-10).

### US-QG-05 · Datenschutz und Mandantentrennung sind testpflichtig · ⬜
Als **Betreiber** will ich, dass die sensibelsten Regeln nie nur Absicht sind.

Akzeptanzkriterien:
- QG-D1: Eine Testsuite legt zwei Konten an und belegt für **jede** Lese- und Schreiboperation, dass Konto A keine Daten von Konto B erreicht, außer über Freundschaft und Freigabe. Neue Operationen ohne diesen Test fallen auf (FR-QG-07).
- QG-D2: Für jede soziale Ausgabe existiert eine **Feld-Whitelist**; ein Vertragstest schlägt fehl, sobald ein Feld außerhalb der Whitelist erscheint (Standort, Messnotizen, Behandlungsmittel, Preise; US-SOZ-04, FR-EQU-08).
- QG-D3: Ein Testbild mit EXIF-GPS wird hochgeladen; das gespeicherte Bild enthält keine EXIF-Daten und die lange Seite ist ≤ 1600 px (US-WAC-06).
- QG-D4: Ein Test belegt, dass Datum und Phasenberechnung in der Zeitzone des Nutzers laufen (NFR-08); eine Lint-Regel verbietet `toISOString().slice(0, 10)` für Kalenderdaten (Ursache von B-01 im Prototyp).

### US-QG-06 · Gates reifen, statt zu blockieren, was niemand erfüllen kann · ⬜
Als **Team** will ich neue Regeln einführen, ohne die Arbeit zu stoppen.

Akzeptanzkriterien:
- Jede Regel lebt im **Prinzipienregister** (`Docs/prinzipien/`) mit Reifegrad `observed → measurable → checked → gated` (Format wie in Tombola: *Warum besser, Woran messbar, Prüfbar durch, Gate, Belege*). Ein Skript validiert das Register (Pflichtfelder, Reifegrad passt zu Feldern).
- Ein neues Gate startet als **Bericht** (R) mit gemessener Basislinie und wird erst nach einer vereinbarten Frist **blockierend** (B). Vorbild: Lighthouse bei Tombola war erst Bericht, dann Merge-Gate, nachdem die Werte erreichbar waren.
- Coverage-Schwellen werden knapp **unter** den aktuellen Wert gesetzt und nur angehoben (Ratchet), nie gesenkt ohne Begründung im PR.
- Ein Gate, das in drei Monaten keinen Fehler fand, wird auf Nutzen geprüft, nicht blind behalten.

### US-QG-07 · KI-Agenten arbeiten innerhalb derselben Gates · ⬜
Als **Entwickler** will ich, dass auch Claude (oder andere Agenten) an dieselben Regeln gebunden sind.

Akzeptanzkriterien:
- `AGENTS.md` im Repo nennt Architektur, Strukturregeln, Fehlerbehandlung, Teststil und verweist auf die Spec; `CLAUDE.md` bindet sie ein.
- Aufgabenspezifische **Playbooks** (z. B. „neue Operation hinzufügen", „neues Epic implementieren") liegen als Skills im Repo; der Agent prüft vor dem Improvisieren, ob eines passt.
- Der Agent führt vor „fertig" `make ci` (oder das Äquivalent) aus und berichtet Ergebnis ehrlich (Pass/Fail), nicht nur „sollte laufen".
- Der Agent committet nicht ungefragt; er ändert keine Gates oder Schwellen, um einen Fehlschlag zu umgehen (Ausnahmen brauchen Begründung im PR).

### US-QG-08 · Komplexität bleibt beherrschbar · ⬜
Als **Entwickler** will ich, dass Code nicht unbemerkt unlesbar wird, weil Komplexität das teuerste Qualitätsproblem ist: Sie macht Tests schwer, Änderungen riskant und KI-Änderungen unzuverlässig.

Akzeptanzkriterien:
- QG-K1 bis QG-K4 laufen in CI; QG-K1 zusätzlich im Pre-push (schnell, nur ESLint).
- **Fachlogik strenger:** In `core` (Phasen, Trend, Meilensteine, Tauschzustände, Erinnerungen) gelten die engeren Grenzen, weil sie rein und leicht zu zerlegen ist. Eine Funktion, die die Grenze reißt, wird zerlegt, nicht ausgenommen.
- **Diff-Prinzip:** Blockierend ist nur, was der PR **verschlechtert** (neue oder geänderte Funktionen über der Grenze). Bestehende Überschreitungen stehen in einer Basisliste, die nur kürzer werden darf (Ratchet, US-QG-06). So lässt sich das Gate ab Tag 1 scharf schalten.
- **CRAP statt reiner Komplexität:** Eine komplexe Funktion ist erlaubt, wenn sie gut getestet ist; sie ist es nicht, wenn sie komplex **und** ungetestet ist. Das koppelt Komplexitätsgate und Coverage (QG-T1).
- Eine Dateilänge über 200 Zeilen (QG-C2) und eine Funktion über der Komplexitätsgrenze sind **zwei getrennte** Befunde; Dateien wegen der Zeilenzahl nur zu splitten, ohne die Komplexität zu senken, gilt nicht als Behebung (Beobachtung aus Tombola: mehrere Dateien wurden nur „der 200-Zeilen-Grenze wegen" geteilt).
- Ausnahmen per Marker mit Begründung (`COMPLEXITY_IGNORE: <Grund>`), im Review sichtbar und gezählt; die Zahl der Marker ist eine Messgröße im Quartalsbericht (US-DEV-03).
- Der Gesundheitsbericht (Fallow `health` oder gleichwertig) erscheint als Job-Zusammenfassung mit den fünf schlechtesten Funktionen, nicht als Wand aus Zahlen.

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-QG-01 | Lokal und in CI laufen **dieselben** Befehle (`make`/`npm`-Ziele). Es gibt keine CI-only-Logik außer Zusatzdiensten (Datenbank, Browser). | ⬜ |
| FR-QG-02 | Der Branch-Schutz für `main` verlangt einen einzigen Sammelstatus; nur Merges mit grünem Status und ohne direkte Pushes. | ⬜ |
| FR-QG-03 | **Doku und Spec sind Gate-Gegenstand:** Skript validiert `Docs/PRODUKT-SPECS/` (IDs eindeutig, Zähler in `README.md`, Verweise auflösbar) und ein Link-Prüfer die Markdown-Links (QG-U2). | ⬜ |
| FR-QG-04 | **Strukturregeln (Vorschlag, anzupassen an E-01):** (a) Fachlogik als eigenes Paket `core` mit Unterordnern je Epic; (b) Tests liegen neben dem Code als `<name>.test.ts`; (c) jedes Verzeichnis mit Code hat einen `index.ts` als einzige öffentliche Schnittstelle; (d) keine losen Dateien in Code-Gruppen (Komponenten, Hooks, Services); (e) Dateinamen nach Muster (PascalCase Komponenten, `useX` Hooks, `xService`). Prüfbar durch ein Skript mit Tests. | ⬜ |
| FR-QG-05 | **Architekturgrenzen (maschinell):** (AB-1) `core` importiert nichts aus API, Web, Datenbank, Dateisystem oder Netz (NFR-ARC-01 der früheren Skizze); (AB-2) Web importiert nur die öffentliche Schnittstelle (`index.ts`) von `core`, nie interne Dateien; (AB-3) die KI-Schicht ruft nur validierende Operationen der Fachlogik, nie Repositories oder die Datenbank direkt (KI-R1); (AB-4) der Pokédex-Aufbau-Job schreibt nur in seinen Baum-Speicher; (AB-5) soziale Module lesen fremde Konten nur über die Freigabe-Schicht. Altlasten nur über die Ausnahmeliste (US-QG-03). | ⬜ |
| FR-QG-06 | Das Rückverfolgbarkeits-Skript (US-QG-04) hat eigene Tests und läuft in CI; Format des Test-Namens: `US-XXX-nn` im Titel. | ⬜ |
| FR-QG-07 | **Datenschutz-Gates:** (a) Mandantentest für jede Operation; (b) Whitelist-Vertragstests für alle sozialen und Partner-Ausgaben; (c) Foto-Test mit EXIF/GPS; (d) Test, dass Partner-IDs nie in Nutzerexport und Nutzerdaten auftauchen (FR-EQU-04). | ⬜ |
| FR-QG-08 | **Kernabläufe für Integration und E2E** (an Releases gekoppelt): R0: Konto → Standort → Exemplar → Import (Trockenlauf, idempotent); R1: Messen mit Foto → Trend → „Heute"-Liste → Pokédex-Fang; R2: Freigabe → Freund sieht Exemplar → Feed; R3: Angebot → Anfrage → Zusage → Übergabe (atomar, FR-SOZ-05). | ⬜ |
| FR-QG-09 | **Performance/Barrierefreiheit:** Mobil-Läufe (Lighthouse CI und axe) mit Startschwellen als Bericht; vor R1-Abschluss auf blockierend setzen. Zahlenwerte werden aus der ersten Messung abgeleitet und nur angehoben (Annahme, nicht vorab festgelegt). | ⬜ |
| FR-QG-10 | **Definition of Done (global):** (1) Story und Akzeptanzkriterien existieren; (2) Code ist auf ein Kriterium rückführbar; (3) Tests stammen aus den Kriterien (Happy Path, Randfälle, Fehlerfälle, Sicherheitspfade); (4) Fehler sind behandelt, nichts wird still verschluckt; (5) Eingaben validiert, keine Geheimnisse im Code, Zugriff geprüft; (6) Modulgrenzen eingehalten; (7) keine Magic Strings, Konstanten zentral; (8) Datenschutz-Gates grün; (9) alle Gates grün; (10) Spec-Status und Zähler angepasst. | ⬜ |
| FR-QG-11 | **Fehlerbehandlung:** Domänenfehler tragen einen stabilen `error_code` (`<domäne>.<grund>`); Oberfläche und KI übersetzen nach Code, zeigen nie rohe Fehlermeldungen. Ein Gate prüft, dass jeder Code einen Text hat und jede Domänenausnahme einen Code trägt. | ⬜ |
| FR-QG-12 | **Magic Strings und Konstanten:** Lichtzonen, Aufzählungen und Schwellen (Trendschwelle, Puffer, Rangstufen) stehen zentral; ein Lint-Skript meldet harte Wiederholungen derselben Schlüsselwerte (löst B-07 dauerhaft). | ⬜ |
| FR-QG-13 | **Koppelung an Schwellen-Quellen:** Zahlen in der Spec (Puffer 2, Trend ±10 %, Rang-Schwellen, Artenarm 10) und im Code stammen aus einer Quelle; ein Test prüft, dass Code-Konstanten und Spec übereinstimmen oder die Spec auf die Konstante verweist. | ⬜ |
| FR-QG-14 | **Release:** Version und Changelog entstehen automatisch aus Conventional Commits, nur nach grüner CI auf `main`. Ein Deploy ist ein bewusster Schritt (Freigabe), kein Seiteneffekt eines Merges (E-14). | ⬜ |
| FR-QG-15 | **Abhängigkeiten:** Automatische Updates (Dependabot oder gleichwertig) laufen durch die volle Suite; Auto-Merge nur bei grünem Status und nicht bei Hauptversionssprüngen. | ⬜ |
| FR-QG-16 | **Komplexitätsgrenzen** stehen in einer Konfiguration (nicht in der Doku verstreut) und sind pro Bereich überschreibbar (`core` strenger). Werte in diesem Dokument sind Annahmen, die Startwerte kommen aus der ersten Messung (E-15). | ⬜ |
| FR-QG-17 | **Basisliste (Ratchet):** Bekannte Überschreitungen stehen in einer Datei mit Pfad, Funktion, Wert und Datum; ein Gate schlägt fehl, wenn die Liste **wächst** oder ein Eintrag nicht mehr nötig ist (dann muss er gestrichen werden). | ⬜ |
| FR-QG-18 | **Doku und Gate dürfen nicht auseinanderlaufen:** Schwellenwerte (Coverage, Komplexität, Dateilänge) stehen genau einmal in der Gate-Konfiguration; Doku und DoD verweisen darauf, statt Zahlen zu wiederholen (Befund aus Tombola: DoD nennt Coverage ≥ 70 %, CI erzwingt 75 %). Ein Test oder Skript prüft, dass in der DoD keine abweichende Zahl steht. | ⬜ |

## Abgleich mit den Architekturprinzipien

Jedes Produktprinzip aus `00-Produktueberblick.md` bekommt mindestens ein Gate, sonst bleibt es Absicht.

| Prinzip | Gate |
|---|---|
| P-01 KI urteilt, Code rechnet | AB-3, QG-T1 (Fachlogik-Coverage), Vertragstests der KI-Schnittstelle (FR-KI-03) |
| P-02 Ein Kern, viele Oberflächen | AB-1, AB-2, Test „Heute"/Erinnerung/KI nutzen dieselbe `status`-Funktion (R-04 in `16-…`) |
| P-03 Validierende Operationen | AB-3, Test je schreibende Operation: ungültige Eingabe schreibt nichts (FR-KI-02) |
| P-04 Mandantenfähig | QG-D1 |
| P-05 Privat als Standard | QG-D2, Test: neues Exemplar ist `privat` |
| P-06 Specs sind ausführbar | QG-T4, QG-U2 |
| P-07 Mensch liefert nur Menschliches | Review-Frage in der DoD (kein Pflichtfeld, das ableitbar wäre) |
| P-08 Keine erfundenen Zahlen | Tests: unbekannt wird als „unbekannt" geliefert (US-POK-07, FR-SOZ-07) |
| P-09 Handlungsanweisung | Test auf „Heute"-Liste: jeder Punkt hat eine Aktion |
| P-10 Kein stilles Verschwinden | Test: unvollständige Daten erscheinen in „Hinweise" (US-BES-08) |
| P-11 Mobile zuerst | QG-U1 (mobile Läufe, Handy-Viewport in E2E) |

## Offene Entscheidungen (Ergänzung zu `16-…`)

| ID | Frage | Vorschlag / Stand |
|---|---|---|
| E-13 | **CI-Plattform und Branch-Modell:** GitHub Actions mit `dev`→`main` wie in Tombola oder nur `main` mit kurzlebigen Branches? | Kleinteam: nur `main`, PRs mit voller Suite; ein zweiter Branch lohnt erst mit mehr Beteiligten |
| E-14 | **Deploy-Freigabe:** Automatisch nach grünem `main` oder bewusste Freigabe? | bewusst (Release-Tag), bis Betrieb eingespielt ist |
| E-15 | **Schwellenwerte** (Coverage, Dateilänge, Pre-push-Zeitbudget, Lighthouse) | Startwerte aus erster Messung, danach Ratchet; Zahlen in diesem Dokument sind Annahmen |
| E-16 | **Statische Analyse:** Fallow-Äquivalent für TypeScript (ungenutzte Exporte, Duplikate, Komplexität) und Semgrep ja/nein | zunächst `knip` + ESLint-Security; Wiederbewertung nach R1 |
| E-17 | **Foto-Virenscan** für Uploads (Tombola nutzt ClamAV) | prüfen, sobald Fremde hochladen (Stufe 2) |
| E-18 | **Review-Automatik** (blindes Review und Fehleranalyse wie bei Tombola) | später, wenn Review-Last es rechtfertigt |

## Umsetzungsreihenfolge

Gates folgen den Releases aus `16-…` und kommen **vor** dem Code, den sie schützen, nicht danach.

| Release | Gates, die vorher stehen müssen |
|---|---|
| R0 | QG-C1 bis QG-C5, QG-S1, QG-T4 (auch für leere Menge), QG-U2, QG-U3, FR-QG-01/02, Struktur- und Grenz-Skripte mit Tests; Prinzipienregister angelegt |
| R1 | QG-T1 (Fachlogik), QG-T2, QG-T3 (R1-Abläufe), QG-D3, QG-D4, Lighthouse/axe als Bericht, QG-S2, QG-S3 |
| R2 | QG-D1, QG-D2 vor dem ersten sozialen Endpunkt |
| R3 | Atomaritäts-Test der Übergabe (FR-SOZ-05), Zustellungs-Idempotenz (FR-MON-02) |
| R4 | Vertragstests der Schnittstelle (FR-KI-03), Rechte-/Entwurfs-Tests (FR-KI-08), Mandanten- und Whitelist-Test für Verbindungen (FR-KI-04, FR-KI-10), Rate-Limit-Tests (US-KI-06), AB-3 |
| R5 | Test „Provisionstabelle ändert Reihenfolge nicht" (FR-EQU-06), Kennzeichnungs-Test (FR-EQU-05) |

Reihenfolge der Datenschutz-Gates ist bewusst: **QG-D1 und QG-D2 stehen, bevor der erste Freund etwas sieht.**
