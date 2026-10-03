# Mitarbeiten

Kurzfassung für Menschen und Agenten. Die Regeln selbst stehen in den Specs, hier nur der Weg.

1. **Spec zuerst.** Jede Änderung gehört zu einer Story oder Anforderung in `Docs/PRODUKT-SPECS/` (Einstieg `README.md`). Fehlt sie, zuerst die Spec ergänzen.
2. **Ein Task, ein Branch, ein Worktree** (E-13, US-DEV-08): `make worktree BRANCH=feat/pha-02-phase`. Branches starten von `dev`.
3. **Tests aus den Akzeptanzkriterien**, Story-ID im Testnamen (P-06).
4. **`make ci`** lokal grün, bevor der PR geöffnet wird. `make help` listet alle Ziele.
5. **PR nach `dev`** mit Titel nach Conventional Commits (`feat(pha): …`, `fix(bes): …`, `docs: …`); er wird beim Squash zur Commit-Nachricht. Vorlage ausfüllen, Spec-Status im selben PR anpassen.
6. **Merge** nur mit grünem `ci-status` und einer Freigabe durch einen anderen Menschen (Rulesets, ADR 0001). Kein Direkt-Push auf `dev` oder `main`.
7. **Release:** PR `dev` → `main` als Merge-Commit; Version und Notizen entstehen automatisch (US-DEV-06).

Gates, Schwellen und Ausnahmelisten werden nicht gelockert, um einen roten Lauf grün zu bekommen. Ist eine Regel falsch, wird sie in einem eigenen PR mit Begründung geändert (US-QG-07).

Sicherheitslücken bitte privat melden: `SECURITY.md`.
