---
name: release-checklist
description: Use when preparing, cutting or hotfixing a release (merge of dev into main). Walks through green CI, migration review, fresh backup, feature flags, merge-commit PR, back-merge and rollback plan (US-DEV-06, E-13).
---

# Release checklist

A release is the pull request `dev` -> `main` (E-13). Releases are small, traceable and reversible (D-06). Versions are never set by hand; they derive from Conventional Commits.

1. Scope: list what `dev` contains since the last release (`git log origin/main..origin/dev --oneline`) and compare it with the cut R0 to R6 in `docs/specs/product/16-releases-and-decisions.md`. Stories in the release are ✅ in the specs and in the counters of `docs/specs/product/readme.md`.
   1b. Statistics: on the release branch run `make repo-stats` and commit `README.md` as `docs(dev): update repository statistics` (US-DEV-10). Per-feature PRs do not touch the block, so this is the only place it changes.
2. CI: the latest `dev` commit has a green `ci-status` (workflow in `.github/workflows/ci.yml`). Run `make ci` locally on an up-to-date `dev` as a second view. A red gate stops the release; never merge around it.
3. Migrations: read every new file in `app/packages/db/migrations/` since the last release. Each must be expand-only so the previous app version still works (skill `db-migration`); check that no row rule was removed.
4. Backup: run `make backup` on the host right before the release and confirm the dump is readable; `make restore-test` proves a restore works. Runbook: `docs/guides/operations/staging-deploy-and-backup.md`.
4b. Catalog filled (release blocker, #991): on a fresh installation or a new host the species search must return hits. Check `select count(*) from species s join review_case v on v.object_kind = 'species' and v.object_id = s.id where v.status in ('curated', 'reviewed')` (approved species; expected 137 or more after `npm run catalog:load`) and search one common name in the app. An empty catalog stops the release. Recipe, switches `CATALOG_FILL`, `ATTRIBUTE_FILL`, `TAXONOMY_BUILD`, `FEATURES` and rollback: `docs/guides/operations/release-and-rollback.md`, "Filling the catalog".
   4c. Data state (US-DEV-06, FR-DEV-07): read the catalog and the taxonomy tree on the production database with the query in `docs/guides/operations/release-and-rollback.md`, "Data state of a release", save the reading as the record that section names and merge that into `dev` through a pull request before step 8, as step 7b. The release notes then name the approved species and the tree (its build time, resolved species, errors). Without it the notes say "unknown" for both, which is honest but incomplete; the PR answer for this step says which it is.
5. Feature flags: US-DEV-06 requires switches for social features (R2, R3), AI (R4) and recommendations (R5). They exist (global `FEATURES`, per account `account_feature`, see `docs/guides/operations/release-and-rollback.md`): check the values for the target environment; in production nothing set means all off. New routes and jobs of these groups must go through `featureGate` / `featureAccess` (api `kernel`).
6. Changelog and privacy gates: every user-facing `feat:`/`fix:` PR merged into `dev` has its own fragment file in `app/packages/web/src/news/unreleased/` (QG-U3, checked per PR). Review the German wording of the fragments and of the unreleased lines in `news.de.json` before step 7b. The privacy gates (QG-D1, QG-D2) are green where the release touches social data. Gates that do not exist yet are named in the PR as open, not skipped silently.
7. Preview: run `make release-dry-run BRANCH=dev` and paste version and notes into the PR; it needs a GitHub token (`gh auth login`). Also run `make secrets` for the secret scan over the full history.
   7b. News release (US-DEV-06, `make news-release`): with the version that step 7 printed, run on a branch from `dev`: `make news-release VERSION=<x.y.z>`. The tool moves the unreleased lines (the fragments, newest issue first, then the lines of `news.de.json` that predate them) into a new version entry with its date and deletes the fragments. It refuses a version that exists already and writes nothing then. Commit both changes as one commit, `docs(dev): release news <x.y.z> (US-DEV-06)`, and open a PR into `dev` that names the story US-DEV-06. It must be in `dev` before step 8, so the release PR carries it. The commit is `docs:`, so it does not change the version that step 7 printed; run step 7 again if in doubt. The release workflow never runs this tool (`release.yml` is unchanged).
8. Open the PR `dev` -> `main` and merge it as a merge commit (not squash, not rebase), so `main` keeps the history of `dev`. The release workflow runs on `main` only for commits with green CI.
9. Deploy deliberately (E-14), then smoke-test `/health` and one core flow. If it fails, roll back to the previous commit (`app/config/deploy/scripts/deploy.sh <previous commit>`); data problems follow the restore runbook.
10. Back-merge: after the release merge `main` into `dev` by pull request, so version and changelog commits do not make the branches diverge.
11. Hotfix (E-13): branch from `main`, fix with a test, full `make ci`, PR into `main` as merge commit, small scope, no bypass of gates; then back-merge into `dev` as in step 10.

## Check

```bash
make ci
make release-dry-run
make secrets
```

Expected: every gate green on the exact commit that is released; steps 3 to 7b and 4c answered in the PR description.
