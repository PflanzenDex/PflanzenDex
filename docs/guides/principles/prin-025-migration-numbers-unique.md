---
id: PRIN-025
title: Migration numbers are unique and new migrations come after the highest number on dev
maturity: gated
spec: [US-DEV-07, AB-14]
---

## Why it is better

Two migrations with one number, or a new one below an applied number, break the order of the schema. Parallel branches make this likely, so the number is checked against the base branch.

## How it is measured

Number of duplicate migration numbers, and number of new migrations whose number is not above the highest number on the base branch (the `origin/dev` ref, or the value of `MIGRATION_BASE`). Target: 0 for both.

## Checked by

`app/tools/workflow/claim/migration/check-migration-numbers.mjs`, `app/tools/workflow/claim/migration/migration-lib.mjs`, `app/tools/workflow/claim/migration/git-view.mjs`; `make migration` assigns the next free number.

## Gate

`make gates` (step `npm run migration-numbers`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it. The job fetches the full history, so the base ref exists.

## Evidence

Tests in `app/tools/workflow/claim/migration/migration-lib.test.mjs` and `app/tools/workflow/claim/migration/git-view.test.mjs`. The check reads the migration files, not the live database; the content of a migration is checked by the tests of PRIN-006 and PRIN-026.
