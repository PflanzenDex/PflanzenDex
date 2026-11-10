---
id: PRIN-026
title: Every foreign key and every tenant column is covered by an index
maturity: gated
spec: [QG-D5, P-04]
---

## Why it is better

Without an index on a foreign key every delete in the parent table scans the child table, and without one on the tenant column every query of one account scans the whole table (P-04).

## How it is measured

Foreign keys and `account_id` columns of the replayed migrations that have no covering index, primary key or unique constraint (a partial index does not count), minus the known findings. Target: 0 uncovered. The known findings in `findings-baseline.json` hold one entry today (`species`: `fk(object_kind, id)`), and the list only shrinks.

## Checked by

`app/tools/check/code/db-indexes/check-db-indexes.mjs`, `app/tools/check/code/db-indexes/findings-baseline.json` (helpers `db-indexes-schema.mjs`, `db-indexes-sql.mjs`, `db-indexes-baseline.mjs` in the same folder).

## Gate

`make gates` (step `npm run db-indexes`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it. Locally: `make db-indexes`.

## Evidence

Tests in `app/tools/check/code/db-indexes/check-db-indexes.test.mjs`. The check replays the migrations into a schema model; it does not inspect the live database.
