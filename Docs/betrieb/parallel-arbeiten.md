# Parallel arbeiten ohne Kollisionen (US-DEV-08)

Hintergrund: Zwei Sitzungen im selben Ordner haben doppelte Dateinummern erzeugt. Darum gilt: eine Aufgabe, ein Branch, ein Arbeitsverzeichnis.

## Neue Aufgabe starten

```bash
make worktree BRANCH=feat/<aufgabe>
```

Das ruft `scripts/worktree-new.sh` auf: holt `origin/dev`, legt Branch und Worktree unter `.worktrees/<branch>/` an (Schrägstriche werden zu Bindestrichen) und schreibt `.env.worktree`. Danach in das Verzeichnis wechseln und dort `make setup` ausführen. Zwei Sitzungen schreiben nie im selben Verzeichnis; `.worktrees/` und `.env.worktree` sind per `.gitignore` ausgeschlossen.

## Eigene Ports und Datenbank je Worktree

`app/scripts/worktree-env.mjs` leitet aus dem Branch-Namen deterministisch ab:

| Variable | Bedeutung |
|---|---|
| `PFLANZENDEX_TEST_DB_PORT` | Port der Test-Datenbank (Startwert-Bereich 54400 bis 54899) |
| `PFLANZENDEX_TEST_DB_NAME` | Datenbankname `pflanzendex_<branch>_<hash>` |
| `PFLANZENDEX_DEV_API_PORT` / `PFLANZENDEX_DEV_WEB_PORT` | Dev-Server (Bereiche 54900 bis 55899) |

Der Bereich ist eine Annahme (Startwert); Kollisionen sind bei 500 Plätzen je Dienst selten, aber nicht ausgeschlossen (Hash). Der feste Port 54329 bleibt dem Hauptverzeichnis vorbehalten. Wer die Variablen nutzt, lädt sie mit `set -a; . ./.env.worktree; set +a`.

## Besitzer und Nummernvergabe

- `.github/CODEOWNERS` benennt je Ordner einen Besitzer; Änderungen daran sind review-pflichtig.
- `make gates` enthält `check-specs`: doppelte Dateinummern in `Docs/PRODUKT-SPECS/` und doppelt definierte IDs (`US-/FR-/DM-/E-`) brechen ab. Neue Nummern vergibt, wer die höchste freie Nummer auf dem aktuellen `origin/dev` prüft; bei Konflikt rebased der spätere PR und nummeriert neu (IDs bestehender Einträge werden nie umnummeriert).

## Regeln für Agenten

- Nicht ungefragt committen, keine fremden Dateien ohne Auftrag ändern.
- Gemeinsame Dateien (Makefile, `package.json`) nur minimal anfassen; eigene Logik in eigene Skripte.
- Vor dem Schreiben melden, wenn sich eine Datei seit dem Lesen geändert hat.

## Offen

Test-Sperrmechanismus für geteilte Ressourcen (Muster `with-test-lock.cjs`): erst sinnvoll, wenn die Test-Datenbank (TE-02, PR #186) existiert. Bis dahin verhindern eindeutige Ports/Datenbanknamen je Worktree die Kollision (Alternative laut Kriterium). Die Variablen müssen von TE-02 und TE-03 (statt fester Ports) gelesen werden.
