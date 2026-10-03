# 19 – Epic DEV: Entwicklungsprozess und Automatisierung

Stand: 2026-10-02 · **Entwurf.** Ergänzt `18-Architektur-und-Quality-Gates.md`. Dort steht, **was** geprüft wird. Hier steht, **wie** es ausgelöst, betrieben und in einen Arbeitsablauf gebracht wird: Task-Runner, Hooks, Routinen, Skills, Prozess, Release, Migrationen, paralleles Arbeiten, Betrieb.

Vorbild ist das Regelwerk des Projekts AdventskalenderTombola (`~/root/Code-Root/AdventskalenderTombola/`: `Makefile`, `.husky/`, `.github/workflows/`, `.agents/`, `.claude/`, `Docs/dods/`, `Docs/documentation/strategy/process/`). Abschnitt „Beobachtungen aus Tombola" nennt, was **nicht** übernommen wird.

## Prinzipien

| ID | Prinzip |
|---|---|
| D-01 | **Ein Einstieg:** Alles läuft über benannte Ziele (`make <ziel>`). CI ruft dieselben Ziele auf wie ein Entwickler. |
| D-02 | **Server ist die Wahrheit:** Lokale Hooks sind Komfort und lassen sich umgehen. Die CI wiederholt jede Prüfung und ist das einzige verbindliche Gate. |
| D-03 | **Urteil per Skill, Prüfung per Gate:** Ein Skill ist Prosa für Dinge, die Urteil brauchen. Was sich prüfen lässt, wird ein Gate und der Skill dazu entfällt (Reifeleiter in `US-QG-06`). |
| D-04 | **Automatisierung mit Besitzer:** Jede Routine hat Auslöser, Besitzer, Ausgabe und eine Regel für ihr Scheitern. |
| D-05 | **Ehrlich berichten:** Ein Lauf meldet Pass oder Fail, nicht „sollte laufen". Ein Ziel, das Fehler verschluckt, ist ein Defekt. |
| D-06 | **Klein und rückholbar:** Releases sind klein, Migrationen vorwärtskompatibel, Rückfall ist vor dem Deploy geplant. |

## Userstories

### US-DEV-01 · Ein Einstiegspunkt für alle Aufgaben (Task-Runner) · ⬜
Als **Entwickler** will ich jede wiederkehrende Aufgabe mit einem Befehl starten und lokal dasselbe ausführen wie die CI.

Akzeptanzkriterien:
- Ein `Makefile` im Wurzelverzeichnis ist der **dokumentierte Einstieg**; `make help` listet alle Ziele mit einem Satz.
- Mindestens diese Ziele (Namen sind Vorschlag):

  | Ziel | Zweck |
  |---|---|
  | `setup` | Erstinstallation (Abhängigkeiten, Beispiel-Umgebung, Hooks, Test-Datenbank) |
  | `dev` | Datenbank, API und Web gemeinsam lokal starten |
  | `lint`, `format`, `typecheck` | Prüfungen aus QG-C und QG-K |
  | `test`, `test-e2e` | Tests (Unit/Integration, End-to-End mit Auto-Start) |
  | `spec-check` | Spec-Konsistenz und Rückverfolgbarkeit (QG-T4, QG-U2) |
  | `gates` | alle schnellen Gates (QG-C, QG-K, QG-S1), identisch zu Pre-push |
  | `ci` | **alle** Gates in der Reihenfolge der CI, bricht beim ersten Fehler ab |
  | `db-migrate`, `db-reset`, `db-seed` | Datenbank (siehe US-DEV-07) |
  | `pokedex-build` | Taxonomie-Aufbau (US-POK-03) |
  | `release-dry-run` | zeigt die nächste Version und die Notizen, ohne etwas zu veröffentlichen |
  | `clean`, `clean-ports` | Aufräumen |

- `make ci` **bricht beim ersten Fehler ab** und hat denselben Umfang wie die CI-Jobs. Ein Fehler wird nie durch `|| true`, `tail` oder eine Pipe verdeckt (D-05).
- Die CI-Workflows rufen die `make`-Ziele auf. Gibt es eine Abweichung (z. B. Dienste in der CI), steht sie als eigene Umgebungsabfrage im Ziel (`ifndef CI`), nicht als zweite Implementierung.
- Die Ziele laufen auf Linux, macOS und unter WSL; Pfadunterschiede (Python- oder Node-Aufruf, Virtualenv-Verzeichnisse) werden **an einer Stelle** aufgelöst, nicht dreifach (Befund aus Tombola).
- Das Makefile enthält keine Fachlogik, nur Aufrufe. Alles Nichttriviale liegt in Skripten (`scripts/`) mit Tests.

### US-DEV-02 · Hooks fangen früh, ohne zu nerven · ⬜
Als **Entwickler** will ich Prüfungen genau dann, wenn sie am billigsten sind.

Akzeptanzkriterien (Git-Hooks, verwaltet über ein Werkzeug wie Husky, installiert durch `make setup`):
- **`commit-msg`:** commitlint (QG-C1).
- **`pre-commit`:** nur auf **geänderten Dateien** und unter 10 Sekunden (Annahme): Formatierung (Prettier) und Basis-Lint. Fachliche Gates gehören nicht hierher (Tombola hat hier bewusst nichts; wir ergänzen nur das Schnelle).
- **`pre-push`:** `make gates` (QG-C2 bis QG-C5, QG-K1, QG-S1) mit klarer Fehlermeldung und Wiederholbefehl (US-QG-01).
- **`post-merge` / `post-checkout`:** weisen auf geänderte Abhängigkeiten oder Migrationen hin (`make setup` / `make db-migrate`), führen aber nichts selbst aus.
- Jede Umgehung (`--no-verify`) ist zulässig, aber wirkungslos für den Merge: Die CI wiederholt alles (D-02).

Akzeptanzkriterien (Agent-Hooks, Claude Code `settings.json` im Repo):
- **`Stop`-Hook (nur Meldung, blockiert nie):** Wenn in der Sitzung Code geändert wurde und `make ci` oder `make gates` danach nicht lief, erscheint ein Hinweis an den Menschen (Muster: der `review_analysis.py`-Hook in Tombola, der nur eine Systemmeldung zeigt und das Modell nicht umlenkt).
- **`PreToolUse`-Wächter:** Änderungen an Gate-Konfigurationen (`.husky/`, Workflows, Coverage-/Komplexitätsschwellen, Basislisten) verlangen eine ausdrückliche Bestätigung des Menschen. Das setzt `US-QG-07` technisch durch („der Agent senkt keine Schwelle, um einen Fehlschlag zu umgehen").
- **`PostToolUse`-Hook:** formatiert geänderte Dateien (Prettier) und startet bei Änderungen in `Docs/PRODUKT-SPECS/` die Spec-Prüfung (`spec-check`) als Meldung.
- Hooks haben eigene Tests (Beispiel Tombola: `review_analysis_test.py`) und eine Zeitgrenze; ein hängender Hook darf die Sitzung nicht blockieren.
- Die Berechtigungsliste (`permissions.allow`) enthält nur lesende und gate-nahe Befehle (`make ci`, `git status`, …), keine Schreib- oder Deploy-Befehle.

### US-DEV-03 · Routinen: regelmäßig laufende Prüfungen und Pflege · ⬜
Als **Betreiber** will ich, dass Dinge geprüft werden, die sich ohne Code-Änderung verschlechtern.

Akzeptanzkriterien: Jede Routine steht in der Tabelle mit Auslöser, Besitzer, Ausgabe und Scheitern. Neue Routinen werden dort eingetragen (D-04).

| Routine | Auslöser | Besitzer | Ausgabe | Scheitern |
|---|---|---|---|---|
| Abhängigkeits-Updates (gruppiert: Patch, Minor, Dev) | wöchentlich (Dependabot oder gleichwertig) | Maintainer | PR mit voller Suite | Auto-Merge nur bei grünem Status, nicht bei Hauptversionssprüngen (FR-QG-15) |
| Volle Suite auf `dev` inkl. End-to-End | nächtlich | CI | Statusmeldung | Meldung an Maintainer, Ticket |
| Sicherheits-Audit (neue Schwachstellen ohne Code-Änderung) | wöchentlich | CI | Bericht (QG-S2) | hohe Funde blockieren den nächsten Release |
| Drift-Test externer Quellen (Wikipedia, Wikidata, GBIF, OpenTree) | wöchentlich | CI | Vertragstests gegen die APIs, Meldung bei Formatänderung (NFR-17) | Pokédex-Aufbau bleibt auf dem letzten guten Stand (US-POK-03) |
| Pokédex-Aufbau | bei Katalogänderung, zusätzlich wöchentlich | System | neuer Baum oder unveränderter Stand | Fehlerliste, nie Teilergebnis |
| Erinnerungs-Job (Epic MON) | täglich, Uhrzeit je Konto | System | Meldungen | Wiederholung, danach Markierung in „Hinweise" (FR-MON-08), Alarm (NFR-18) |
| Backup und **Wiederherstellungstest** | täglich bzw. monatlich | Betreiber | Sicherung, Testprotokoll | ein nicht wiederherstellbares Backup ist ein Vorfall (NFR-15) |
| Kostenbericht (Hosting, Speicher, KI je Konto) | monatlich | Betreiber | Bericht (NFR-16) | Überschreitung eines Limits löst Prüfung aus |
| Gate-Gesundheit: Basisliste, Ausnahmemarker, Gates ohne Fund seit 3 Monaten | quartalsweise | Maintainer | Kurzbericht (US-QG-06) | Gate wird gestrafft, entfernt oder gehärtet |
| Katalog-Prüfliste (KI-erstellte Profile, Nutzervorschläge) | wöchentlich | Betreiber | abgearbeitete Liste (US-POK-02, FR-BES-06) | Rückstand wird sichtbar gemacht |
| Löschanfragen (DSGVO) | fortlaufend, Frist festlegen | Betreiber | Löschprotokoll (US-ACC-04) | Frist überschritten = Vorfall |

- Wiederkehrende Agentenaufgaben (z. B. wöchentlicher Gate-Gesundheitsbericht) dürfen als **geplanter Agent** laufen; sie schreiben nur Berichte und öffnen Vorschläge, sie ändern keine Gates.

### US-DEV-04 · Skills und Playbooks für wiederkehrende Aufgaben · ⬜
Als **Entwickler (und KI)** will ich für wiederkehrende Aufgaben eine bewährte Anleitung, statt jedes Mal zu improvisieren.

Akzeptanzkriterien:
- Skills liegen **einmal** im Repo (`.agents/skills/<name>/SKILL.md`), Werkzeuge verlinken dorthin (`.claude/skills/<name>` als Verweis). Keine zweite Kopie, kein Drift (Muster Tombola).
- Jeder Skill hat: Name, Beschreibung mit **Auslöser** („Verwenden, wenn …"), nummerierte Schritte, **Prüfbefehl** (z. B. `make test`), erwartete Ausgabe. Ein Skill ohne konkreten Prüfbefehl ist unfertig (Befund aus Tombola: `pre-commit-quality_check` beschreibt nur „Linter laufen lassen", ohne Befehl. Bei uns ruft er `make ci` auf).
- Ein Prüfskript (`make skills-check`) stellt sicher: Frontmatter vollständig, referenzierte Pfade und Befehle existieren, Verweise nicht gebrochen, keine verwaisten Skills.
- Anfangssatz (aus den Epics abgeleitet, nicht aus Tombola kopiert):

  | Skill | Zweck |
  |---|---|
  | `spec-to-tests` | aus Akzeptanzkriterien einer Story Tests mit Story-ID erzeugen (P-06) |
  | `add-core-operation` | neue validierende Operation in `core` samt Test, Fehlercode, KI-Freigabe (KI-R1) |
  | `add-epic-feature` | Story → Test → Code → Gates → Spec-Status aktualisieren |
  | `tenant-isolation-test` | Mandantentest für neue Operation (QG-D1) |
  | `privacy-whitelist` | Feld-Whitelist und Vertragstest für soziale/Partner-Ausgaben (QG-D2) |
  | `db-migration` | vorwärtskompatible Migration mit Test und Rückfallplan (US-DEV-07) |
  | `error-code` | neuen Fehlercode samt Übersetzung (FR-QG-11) |
  | `date-and-timezone` | lokales Datum und Zeitzone (NFR-08, Ursache von B-01) |
  | `photo-pipeline` | Foto-Verarbeitung und EXIF-Test (US-WAC-06) |
  | `catalog-batch` | Katalog-Batch (20–40 Arten) anlegen, Aufbau laufen lassen, Warnungen prüfen (US-POK-02) |
  | `ki-tool-contract` | Operation für die KI-Schnittstelle freigeben oder ändern: Beschreibung, Schema, Fehlercodes, Vertragstest, Whitelist (FR-KI-03, FR-KI-10) |
  | `release-checklist` | Release vorbereiten und prüfen (US-DEV-06) |
  | `story-test-protocol` | manuelles Testprotokoll für Abläufe, die Tests nicht abdecken (Muster `ticket-test-protocol` aus Tombola) |
  | `recap-and-learnings` | nach einer Aufgabe Lehren extrahieren und ins Prinzipienregister oder Skills überführen |
  | `discovery-review`, `compliance-review`, `review-failure-analysis` | Review-Zyklus (US-DEV-05) |

- Promotion: Wird ein Skill-Schritt zu einem Gate (z. B. „prüfe, dass Feld X nicht ausgegeben wird"), wird der Schritt im Skill durch den Verweis auf das Gate ersetzt (D-03).

### US-DEV-05 · Story-Lebenszyklus und Review-Prozess · ⬜
Als **Team** will ich einen festen Weg von der Idee bis zum Merge, der zur Spec passt.

Akzeptanzkriterien:
- **Lebenszyklus einer Story:** ⬜ geplant → 🟨 in Arbeit (Branch existiert) → ✅ umgesetzt (in `dev` gemergt, Test mit Story-ID vorhanden und grün). Der Spec-Status und die Zähler in `README.md` werden **im selben PR** geändert (FR-QG-03, QG-U2 prüft das).
- **Ablauf:** Story lesen → Tests aus den Kriterien ableiten (Skill `spec-to-tests`) → implementieren → `make ci` grün → PR mit Beschreibung (Story-IDs, Abweichungen von der Spec) → Review → Merge.
- **Definition of Ready:** Eine Story darf begonnen werden, wenn Kriterien prüfbar formuliert sind (Gegeben/Wenn/Dann), Abhängigkeiten in `16-…` geklärt sind und offene Entscheidungen (E-nn) entschieden sind.
- **Definition of Done:** FR-QG-10.
- **Review (zweistufig, optional ab R1):** erst **blind** durch einen Agenten, der das Prinzipienregister nicht kennt, danach Fehleranalyse (`review-failure-analysis`), die für jeden Fund „warum besser, woran messbar, wie prüfbar" festhält und dem Maintainer **zur Bestätigung** vorlegt. Compliance-Review gegen bekannte Prinzipien nur auf Wunsch oder vor Releases (Muster Tombola, E-18).
- **Entscheidungen als ADR:** Wird ein E-nn entschieden, entsteht ein Eintrag unter `Docs/entscheidungen/NNNN-titel.md` (Kontext, Entscheidung, Folgen); die Zeile in `16-…` verweist darauf.
- **Stolperfallen-Register:** Wiederkehrende Fehler (Zeitzonen, Fehlertexte, Testsynchronisation) stehen als kurze Einträge unter `Docs/stolperfallen/` und werden bei einem Fund ergänzt (Muster `common-pitfalls`). Aus Einträgen, die sich prüfen lassen, werden Gates.
- **Dokumentationsprozess:** Code-Änderung ohne passende Spec- oder Doku-Änderung fällt im Review auf; Doku-Commits tragen `docs:`; Doku wird mit Markdown-Lint und Link-Prüfung gegated (QG-U2).

### US-DEV-06 · Release-Prozess · 🟨
Als **Betreiber** will ich Releases, die klein, nachvollziehbar und rückholbar sind.

Akzeptanzkriterien:
- **Versionierung:** SemVer, automatisch aus Conventional Commits (semantic-release oder gleichwertig, E-13). `0.x` bis zur Parität (R1), `1.0.0` mit der ersten Freigabe für Fremde (Stufe 2). Kein manuelles Setzen von Versionsnummern.
- **Auslöser und Kette:** Ein Release ist der Merge von `dev` nach `main` per Pull-Request mit voller Suite. Der Release-Workflow läuft auf `main` **nur für Commits mit grünem `ci-status`** (Muster: `workflow_run` auf „CI Pipeline" mit Statusprüfung), danach erst der Deploy. Eine rote CI bricht beides ab, ohne Version zu erzeugen. Nach dem Release wird `main` in `dev` zurückgemergt, damit Changelog- und Versions-Commits die Branches nicht auseinanderlaufen lassen.
- **Ergebnis eines Releases:** Git-Tag, Release-Notizen aus den Commits als GitHub-Release (statt `CHANGELOG.md` im Repo, ADR [0002](../decisions/0002-release-from-tags.md)), Container-Abbild, Datenbank-Migrationen (US-DEV-07), Katalog-/Baum-Stand (versioniert, getrennt vom Code, US-POK-03).
- **Version sichtbar:** Die Version steht in der App (Fußzeile/Über-Seite), in Fehlerberichten und im Gesundheits-Endpunkt. Eine Quelle (Tag), keine zweite Pflege (Muster `sync_version.py`, aber ohne Schreiben in versionierte Dateien).
- **Nutzerseitiger Changelog:** Für `feat:` und `fix:` verlangt QG-U3 einen kurzen deutschen Eintrag („Neu in dieser Version"), den die App anzeigt. Für interne Änderungen genügt `[skip-changelog]`.
- **Zuschnitt:** Release-Inhalte folgen R0 bis R6 (`16-…`). Ein Release ist erst freigegeben, wenn die Kernabläufe seines Zuschnitts grün sind (FR-QG-08) und, bei sozialen Releases, QG-D1/QG-D2 stehen.
- **Funktionsschalter (Feature-Flags):** Soziale Funktionen (R2, R3), KI (R4) und Empfehlungen (R5) lassen sich pro Konto oder global abschalten. Das erlaubt, Code früh auszuliefern und die Funktion erst für die drei Start-Nutzer zu öffnen.
- **Deploy:** bewusste Freigabe (E-14), danach automatischer **Smoke-Test** gegen den Gesundheits-Endpunkt und einen Kernablauf (Anmelden, Heute-Liste); schlägt er fehl, **automatischer Rückfall** auf die vorige Version.
- **Rückfall und Hotfix:** Der vorige Container bleibt verfügbar; ein Hotfix ist ein Branch von `main`, per PR mit voller Suite nach `main`, nur kleiner Zuschnitt, nicht an den Gates vorbei; danach Rück-Merge nach `dev`.
- **Release-Checkliste** (Skill `release-checklist`): CI grün, Migrationen geprüft und Backup frisch, Changelog vollständig, Feature-Flags gesetzt, Datenschutz-Gates grün, Rückfallplan bekannt, Betreiber informiert.
- `make release-dry-run` zeigt Version und Notizen, ohne zu veröffentlichen.

### US-DEV-07 · Datenbank-Migrationen sind sicher · ⬜
Als **Betreiber** will ich Schema-Änderungen ohne Datenverlust und ohne Ausfall.

Akzeptanzkriterien:
- Migrationen sind versioniert, im Repo, und laufen automatisch beim Deploy vor dem Start der neuen Version.
- **Vorwärtskompatibel (Expand/Contract):** Eine Migration ändert nie so, dass die **vorige** App-Version bricht; Spalten werden erst ergänzt, dann genutzt, dann in einem späteren Release entfernt. Dadurch funktioniert der Rückfall (US-DEV-06).
- Jede Migration hat einen Test auf einer Datenbank mit realistischen Daten (Testdatensatz in der Größenordnung der Prototyp-Daten, 13 Arten, 17 Exemplare, Messreihen (als Fixture, kein Import); Muster: Testdaten-Skript in Tombola).
- Vor jeder Migration in Produktion existiert eine frische, **wiederherstellbare** Sicherung (NFR-15).
- Zeilenebene-Regeln der Mandantentrennung (NFR-09) werden mit migriert und durch QG-D1 geprüft; eine Migration, die eine Regel entfernt, schlägt QG-D1 fehl.

### US-DEV-08 · Paralleles Arbeiten ohne Kollisionen · ⬜
Als **Team (Menschen und Agenten)** will ich gleichzeitig arbeiten, ohne Dateien gegenseitig zu überschreiben.

Hintergrund: Beim Verfassen dieser Specs haben zwei Sitzungen gleichzeitig im selben Ordner geschrieben; die Folge waren doppelt vergebene Dateinummern (zwei Dateien trugen die Nummer 12) und Änderungen, die eine Sitzung erst nachträglich bemerkte. Der Prozess soll das verhindern.

Akzeptanzkriterien:
- **Eine Aufgabe, ein Branch, ein Arbeitsverzeichnis:** Parallele Arbeit läuft in getrennten Git-Worktrees (Muster `.worktrees/` in Tombola). Zwei Sitzungen schreiben nie im selben Verzeichnis.
- **Besitzer je Bereich:** Eine `CODEOWNERS`-Datei benennt je Epic bzw. Ordner einen Besitzer. Änderungen daran sind Review-pflichtig; eine Änderung ohne Absprache im Fremdbereich fällt auf.
- **Nummernvergabe geschützt:** Spec-Dateien und IDs (`US-/FR-/DM-/E-`) werden zentral vergeben; die Spec-Prüfung (QG-U2) lehnt doppelte Dateinummern und doppelte IDs ab.
- **Tests nicht parallel auf geteilten Ressourcen:** Ein Test-Sperrmechanismus verhindert, dass zwei Läufe dieselbe Datenbank oder denselben Port benutzen (Muster `with-test-lock.cjs` in Tombola); eindeutige Ports/Datenbanknamen je Worktree sind Alternative.
- **Agenten:** committen nicht ungefragt, ändern keine fremden Dateien ohne Auftrag und melden vor dem Schreiben, wenn sich eine Datei seit dem Lesen geändert hat (das Werkzeug meldet das bereits).

### US-DEV-09 · Betrieb: Gesundheit, Alarme, Runbooks · ⬜
Als **Betreiber** will ich wissen, wenn etwas nicht stimmt, bevor Nutzer es melden.

Akzeptanzkriterien:
- Gesundheits-Endpunkt (API, Datenbank, Job-Warteschlange, Objektspeicher) mit Version; wird vom Deploy und vom Monitoring abgefragt.
- Fehler und fehlgeschlagene Jobs erzeugen eine **Betreibermeldung** (NFR-18) ohne Nutzerdaten im Klartext.
- Runbooks unter `Docs/betrieb/` für: Backup einspielen, Rückfall, Migration schlägt fehl, Foto-Speicher voll, KI-Schnittstelle gestört oder missbraucht (Verbindung sperren), Erinnerungen laufen nicht, DSGVO-Löschung, Sicherheitsvorfall.
- Ein Ausfall einer externen Quelle oder der KI beeinträchtigt keine Kernfunktion (NFR-17, FR-KI-05).
- Betriebskennzahlen: Verfügbarkeit, Fehlerrate, Laufzeit der Jobs, Kosten je Konto (NFR-16).

## Anforderungen

| ID | Anforderung | Status |
|---|---|---|
| FR-DEV-01 | `make ci` ≙ CI-Jobs. Ein Test oder Skript vergleicht die Ziele im Makefile mit den Workflow-Jobs und schlägt bei Abweichung an (verhindert Drift, vgl. FR-QG-01). | ⬜ |
| FR-DEV-02 | Hooks, Skills, Routinen und Prozess sind **Teil des Repos** und per Pull-Request änderbar; keine Einstellungen nur auf einzelnen Rechnern. | ⬜ |
| FR-DEV-03 | Jede Routine in US-DEV-03 ist als Workflow oder geplanter Job im Repo definiert und hat einen Besitzer. | ⬜ |
| FR-DEV-04 | Das Prinzipienregister (US-QG-06) wird von einem Skript validiert und von Review und Fehleranalyse gepflegt. | ⬜ |
| FR-DEV-05 | Versionen entstehen nur aus Commits (SemVer); ein manuell gesetzter Tag oder eine manuell geänderte Version fällt in CI auf. | ⬜ |
| FR-DEV-06 | Release-Notizen und nutzerseitiger Changelog sind zweisprachig vorbereitet (Deutsch zuerst); Texte liegen in Übersetzungsdateien, nicht im Code (NFR-14). | ⬜ |
| FR-DEV-07 | Jeder Release erhält ein **Datenstand-Etikett** für Katalog und Taxonomie-Baum (Datum, Anzahl Arten, Fehlerzahl). | ⬜ |
| FR-DEV-08 | Geplante Agenten und Routinen laufen mit minimalen Rechten (nur Lesen, Bericht schreiben); Deploy- und Geheimnisrechte hat nur der Release-Workflow. | ⬜ |
| FR-DEV-09 | **Ein Repo für Spec, Code und Doku (E-05):** Code liegt unter `/app`, alle Dokumentation unter `/Docs` (Specs in `Docs/PRODUKT-SPECS/`, Prozess-Dokumentation daneben). Das `Makefile` im Wurzelverzeichnis ruft in `app/` hinein. CI-Jobs und Release laufen mit Pfadfiltern; reine `docs:`-Commits erzeugen keinen Release (FR-QG-14). `CODEOWNERS` trennt die Bereiche (US-DEV-08). | ⬜ |

## Beobachtungen aus Tombola (nicht übernommen oder zu beachten)

Aus dem Lesen des Tombola-Repos. Sie zeigen, was schon ein gutes Regelwerk umgeht.

| Beobachtung | Folge für PflanzenDex |
|---|---|
| Das `make ci`-Ziel ist eine handgebaute Näherung der CI (Pipes mit `tail`, `\|\| true`) und kann Fehler verdecken; die Workflows rufen es nicht auf. | FR-DEV-01, D-01, D-05: ein Ziel, von der CI aufgerufen, bricht beim ersten Fehler ab. |
| Die Erkennung des Python-Virtualenv ist an drei Stellen gespiegelt (Root-Makefile, Backend-Makefile, Lint-Skript), ausdrücklich per Kommentar. | Ein Task-Runner, eine Auflösung (US-DEV-01). |
| Die DoD nennt Coverage ≥ 70 %, die CI erzwingt 75 %. | FR-QG-18: Zahlen genau einmal, Doku verweist. |
| Der Skill `pre-commit-quality_check` enthält nur vage Schritte, keine Befehle. | US-DEV-04: Skill ohne Prüfbefehl ist unfertig. |
| Mehrere Dateien wurden nur geteilt, um die 200-Zeilen-Grenze zu halten (Kommentare in `pyproject.toml`, Routen-Dateien). | US-QG-08: Komplexität und Länge sind getrennte Befunde. |
| Der Release-Strang hat zwei Werkzeuge (npm und Python) für zwei Pakete. | Bei uns ein Paket, ein Werkzeug (E-13). |
| Feature→`dev`-PRs bekommen keine volle CI (bewusst, Kosten), nur Abhängigkeits-PRs. | E-13: PRs nach `dev` bekommen schnelle Gates und Unit/Integration, PRs von `dev` nach `main` die volle Suite; Pre-push lokal. |
| Jira-Statuspflege (TEST STATE, Done) ist eigener Prozess. | Entfällt: Der Spec-Status ersetzt das Ticket (US-DEV-05). Falls später Tickets, dort dieselbe Regel. |

## Reihenfolge der Einführung

| Zeitpunkt | Was vor dem ersten Code steht |
|---|---|
| Vor R0 | Makefile mit `help`, `setup`, `lint`, `test`, `gates`, `ci`; Hooks (`commit-msg`, `pre-push`); CI mit Sammelstatus; `spec-check`; `CODEOWNERS`; Worktree-Regel; Skills `spec-to-tests`, `add-core-operation`; ADR-Ordner |
| Vor R1 | Komplexitäts-Gates (QG-K) mit Basisliste; `pre-commit`; `post-merge`-Hinweise; Release-Kette (semantic-release, Smoke-Test, Rückfall); Migrations-Test mit Prototyp-Testdaten; Betriebs-Basis (Gesundheits-Endpunkt, Backup + Wiederherstellungstest) |
| Vor R2 | Skills `tenant-isolation-test`, `privacy-whitelist`; Routinen: nächtliche Suite, Sicherheits-Audit; Feature-Flags für Soziales |
| Vor R3 | Erinnerungs-Job-Monitoring; Routine Kostenbericht |
| Vor R4 | Skill `ki-tool-contract`; Routine Auswertung der Verbindungs-Last |
| Danach | Review-Zyklus (blind + Fehleranalyse), geplante Agenten, Gate-Gesundheitsbericht |
