---
name: release-checklist
description: Use when preparing, cutting or hotfixing a release (merge of dev into main). Walks through green CI, migration review, fresh backup, feature flags, merge-commit PR, back-merge and rollback plan (US-DEV-06, E-13).
---

# Release checklist

A release is the pull request `dev` -> `main` (E-13). Releases are small, traceable and reversible (D-06). Versions are never set by hand; they derive from Conventional Commits.

1. Scope: list what `dev` contains since the last release (`git log origin/main..origin/dev --oneline`) and compare it with the cut R0 to R6 in `Docs/PRODUKT-SPECS/16-Releases-und-Entscheidungen.md`. Stories in the release are ✅ in the specs and in the counters of `Docs/PRODUKT-SPECS/README.md`.
2. CI: the latest `dev` commit has a green `ci-status` (workflow in `.github/workflows/ci.yml`). Run `make ci` locally on an up-to-date `dev` as a second view. A red gate stops the release; never merge around it.
3. Migrations: read every new file in `app/packages/db/migrations/` since the last release. Each must be expand-only so the previous app version still works (skill `db-migration`); check that no row rule was removed.
4. Backup: run `make backup` on the host right before the release and confirm the dump is readable; `make restore-test` proves a restore works. Runbook: `Docs/betrieb/staging-deploy-und-backup.md`.
5. Feature flags: US-DEV-06 requires switches for social features (R2, R3), AI (R4) and recommendations (R5). They are not implemented yet; until then, such code must not be reachable in a release, and the PR description states what is unreachable.
6. Changelog and privacy gates: user-facing `feat:`/`fix:` entries are present (QG-U3) and the privacy gates (QG-D1, QG-D2) are green where the release touches social data. Gates that do not exist yet are named in the PR as open, not skipped silently.
7. Preview: run `make release-dry-run BRANCH=dev` and paste version and notes into the PR; it needs a GitHub token (`gh auth login`). Also run `make secrets` for the secret scan over the full history.
8. Open the PR `dev` -> `main` and merge it as a merge commit (not squash, not rebase), so `main` keeps the history of `dev`. The release workflow runs on `main` only for commits with green CI.
9. Deploy deliberately (E-14), then smoke-test `/health` and one core flow. If it fails, roll back to the previous commit (`app/deploy/scripts/deploy.sh <previous commit>`); data problems follow the restore runbook.
10. Back-merge: after the release merge `main` into `dev` by pull request, so version and changelog commits do not make the branches diverge.
11. Hotfix (E-13): branch from `main`, fix with a test, full `make ci`, PR into `main` as merge commit, small scope, no bypass of gates; then back-merge into `dev` as in step 10.

## Check

```bash
make ci
make release-dry-run
make secrets
```

Expected: every gate green on the exact commit that is released; steps 3 to 7 answered in the PR description.
