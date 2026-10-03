# 0001 · Öffentliches Repo mit Rulesets statt privat ohne Branch-Schutz

- **Status:** angenommen (2026-10-03)
- **Ändert:** E-13 (`Docs/PRODUKT-SPECS/18-Architektur-und-Quality-Gates.md`), FR-QG-02, US-QG-02
- **Betrifft:** Lizenz, Sicherheitsfunktionen, Actions-Minuten

## Kontext

E-13 hatte festgelegt: Das Repo bleibt privat auf dem Free-Plan der Organisation. Dort liefert die GitHub-API für Branch-Schutz und Rulesets `403 Upgrade to GitHub Pro or make this repository public`. Die Regeln aus E-13 („weder `main` noch `dev` bekommen Direkt-Commits", „Merge nur mit grünem `ci-status`") waren damit nur Absicht, keine Schranke (Grundsatz in `18`: „Eine Regel, die nur in einem Dokument steht, ist ein Wunsch"). Für ein KI-first-Repo, in dem Agenten Branches pushen und PRs öffnen, reicht das nicht: Ein Agent darf nie selbst nach `dev` oder `main` mergen können.

Geprüfte Wege: Team-Plan (etwa 4 USD je Nutzer und Monat), Repo öffentlich, Free-Plan mit Wächter-Workflow (meldet nur, verhindert nichts).

## Entscheidung

Das Repo ist **öffentlich**. Rulesets liegen als Code unter `.github/rulesets/` und werden mit `scripts/rulesets-apply.sh` angewendet; `--check` meldet Abweichungen zwischen Datei und GitHub.

| Ruleset | Ziel | Regeln |
|---|---|---|
| `main-schutz` | `main` | nur per PR; 1 Freigabe durch einen Menschen, der nicht der letzte Pusher ist; veraltete Freigaben verfallen bei neuem Push; offene Review-Threads blockieren; Pflichtprüfung `ci-status`; nur Merge-Commit (E-13); kein Force-Push, kein Löschen |
| `dev-schutz` | `dev` | wie `main`, aber Squash (Feature-Branches) und Merge-Commit (nur Rück-Merge `main`→`dev` nach Release oder Hotfix) |
| `release-tags` | Tags `v*` | Tags sind unveränderlich (kein Verschieben, kein Löschen); Anlegen bleibt dem Release-Workflow möglich |

Keine Bypass-Akteure. Ein Notfall-Eingriff heißt: Ruleset bewusst ändern (sichtbar im Audit-Log), nicht umgehen.

Weitere Einstellungen, die mit dem öffentlichen Repo kostenlos sind: Secret-Scanning mit Push-Schutz, Dependabot-Warnungen, private Meldung von Schwachstellen (`SECURITY.md`), CodeQL (als Workflow, sobald Code auf `dev` analysiert werden kann), unbegrenzte Actions-Minuten für Standard-Runner. Branches werden nach dem Merge gelöscht, Rebase-Merge ist aus, Squash- und Merge-Commit übernehmen den PR-Titel (der daher Conventional Commits folgen muss, QG-C1).

**Lizenz:** keine Open-Source-Lizenz. `LICENSE` stellt klar: Quelltext sichtbar, alle Rechte vorbehalten. Das hält die Optionen aus dem Business Case (E-08) offen.

## Folgen

- Specs, Roadmap, Business Case und die Commit-Metadaten (Namen und E-Mail-Adressen der Autoren) sind öffentlich. Vor dem Umschalten lief Gitleaks über die gesamte Historie aller Branches ohne Fund. Neue Commits sollten die `noreply`-Adresse von GitHub verwenden.
- Jeder PR braucht einen zweiten Menschen. Von einem Agenten geöffnete PRs gelten als Werk des Menschen, der den Agenten gestartet hat; freigeben muss ein anderer.
- Renovate-PRs brauchen ebenfalls eine Freigabe, Auto-Merge greift erst danach (FR-QG-15).
- `semantic-release` schreibt keine Commits zurück nach `main` (das Ruleset würde es verhindern); Version und Notizen entstehen aus Tag und GitHub-Release (US-DEV-06).
- Das GitHub-Projekt (Roadmap-Board) bleibt privat; seine Sichtbarkeit ist davon unabhängig.
