# 0002 · Release aus Tags, ohne Rückschreib-Commit

- **Status:** angenommen (2026-10-03)
- **Präzisiert:** US-DEV-06 („Ergebnis eines Releases", „Version sichtbar"), FR-QG-14, FR-DEV-05
- **Hängt ab von:** ADR 0001 (Rulesets auf `main`)

## Kontext

US-DEV-06 nennt als Ergebnis eines Releases Git-Tag, `CHANGELOG.md` und Release-Notizen und verlangt eine einzige Quelle der Version „ohne Schreiben in versionierte Dateien". Ein `CHANGELOG.md` im Repo bräuchte einen Commit des Release-Workflows auf `main`. Das Ruleset `main-schutz` verbietet Direkt-Pushes ohne Ausnahme, und ein Bypass für `github-actions` ist in Rulesets nicht möglich. Außerdem fordert `0.x` bis zur Parität (R1) eine Regel, die semantic-release von Haus aus nicht kennt (es beginnt bei 1.0.0).

## Entscheidung

- **Werkzeug:** semantic-release (`app/release.config.js`), ein Paket, ein Release-Strang, nur Branch `main`.
- **Auslöser:** `.github/workflows/release.yml` per `workflow_run` auf „CI", nur bei `success` und Ereignis `push` auf `main`. Ist `main` inzwischen weiter, bricht semantic-release ohne Release ab.
- **Ergebnis:** Tag `vX.Y.Z` (unveränderlich durch das Ruleset `release-tags`) und GitHub-Release mit deutschen Abschnitten (Neu, Behoben, Schneller). **Kein** `CHANGELOG.md` und kein Versionsfeld in `package.json`. Die GitHub-Releases sind das Änderungsprotokoll, die Version kommt zur Build-Zeit aus `git describe`.
- **0.x:** Startpunkt ist das Tag `v0.0.0` auf dem ersten Commit von `main`. Breaking Changes heben die Minor-Version (`VOR_1_0` in der Konfiguration). 1.0.0 entsteht bewusst, indem ein PR diese Regel entfernt (erste Freigabe für Fremde, Stufe 2).
- **Kein Release:** `docs`, `chore` (auch `chore(deps)` für Entwicklungswerkzeuge), `ci`, `test`, `refactor`, `build`, `style`. Laufzeit-Abhängigkeiten (`fix(deps)`) erzeugen einen Patch.
- **Vorschau:** `make release-dry-run` (Branch muss auf `origin` existieren).

## Folgen

- Der nutzerseitige Changelog in der App (QG-U3, FR-DEV-06) entsteht nicht aus `CHANGELOG.md`, sondern aus eigenen Übersetzungsdateien. Das kommt in einem eigenen PR.
- Rück-Merge `main` → `dev` bleibt nach jedem Release nötig (E-13), weil `main` die Merge-Commits der Release-PRs enthält. Konflikte durch Versions-Commits entstehen nicht.
- Ein manuell gesetzter `v*`-Tag ist möglich (Anlegen ist erlaubt), aber unveränderlich und im Audit-Log sichtbar. Eine automatische Prüfung (FR-DEV-05) steht noch aus.
