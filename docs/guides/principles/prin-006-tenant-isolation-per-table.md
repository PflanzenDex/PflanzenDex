---
id: PRIN-006
title: Every table is isolated per account (tenant)
maturity: gated
spec: [P-04, P-05, QG-D1, US-QG-05]
---

## Why it is better

Multi-tenancy from day one: account A must never read or change data of account B. A forgotten tenant column or row rule is a data leak.

## How it is measured

The suite checks every table in the schema: without an account column or without an enforced row rule the test fails, and the generic test fails for a protected table without a fixture. Target: 0 unprotected tables.

## Checked by

`app/packages/db/src/kernel/tenant.test.ts`, fixtures in `app/packages/db/src/fixtures.ts` (aggregates `FIXTURES_<MODULE>` from `db/src/<module>/fixtures.ts`; add the entry in the module that owns the table).

## Gate

`make ci` (test step, needs the PostgreSQL test database), run by the CI job `app` in `.github/workflows/ci.yml`.

## Evidence

The suite includes negative cases: a new table without account column, a table without row rule and a defective rule are all detected. Not covered yet: friendship and sharing paths (US-SOZ) and per-operation isolation tests (FR-QG-07).
