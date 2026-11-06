---
id: PRIN-053
title: Statements per request do not grow with the data, and no request repeats a statement
maturity: gated
spec: [QG-D6, US-QG-05, NFR-12]
---

## Why it is better

A route that sends one query per row works on a demo and fails on a real collection (the N+1 problem). Counting statements in a seeded scenario finds it before the data grows.

## How it is measured

Per GET route of the API: (a) every route is measured or listed with a reason in the exclusion list; (b) the statement count with the larger seeded data (50 specimens) does not exceed the count with the smaller (5 specimens); (c) no request sends the same statement text twice. Known findings: the growth list `app/packages/api/src/query-count-baseline.json` is empty (`{}`); the repeated-statement list `app/packages/api/src/query-repeat-baseline.json` names 8 routes. Both lists only shrink. Target: 0 new findings.

## Checked by

`app/packages/api/src/query-count.test.ts`, `app/packages/api/src/query-count-endpoints.ts`, `app/packages/api/src/query-count-statements.ts`, `app/packages/api/src/query-count-baseline.json`, `app/packages/api/src/query-repeat-baseline.json`.

## Gate

`make ci-tests-base` in the CI job `app-tests` of `.github/workflows/ci.yml`; `ci-status` requires the job. The test is part of `make test` and the API test run.

## Evidence

The test names carry US-QG-07 and NFR-12. Limits: it counts statements in the seeded scenario, not in production traffic; the nightly load budgets are in PRIN-062.
