---
id: PRIN-028
title: Unit, integration and database tests pass in every package and in the check scripts
maturity: gated
spec: [QG-T1, QG-T2, FR-QG-10]
---

## Why it is better

Tests are the only proof that a rule holds at run time. A failing test that does not block the merge is a known bug shipped with a green status.

## How it is measured

Number of failing tests in the test run of each package (api, core, db, web) and of the check scripts (`app/tools/**/*.test.mjs`, `.claude/hooks/*.test.mjs`, `tools/lighthouse/*.test.mjs`, `tools/repo/*.test.mjs`). Target: 0.

## Checked by

`app/package.json` (scripts `test`, `ci:tests:base` and `ci:tests:web`, and the suite scripts `ci:tests:api`, `ci:tests:core`, `ci:tests:db` and `ci:tests:tools` that CI runs through `make ci-tests-base`), `app/packages/api/vitest.config.ts` and the other per-package Vitest configurations.

## Gate

`make ci-tests-base` (CI job `app-tests`: the api suite first, then the db, core and tool suites at once; every suite runs even when another one failed, issue 1698) and `make ci-tests-web` (CI job `app-tests-web`, two shard jobs with `SHARD=i/2`; the job `results` merges their blob reports with `make ci-tests-web-merge`, issue 1682). `ci-status` requires `app-tests` for every app change and `app-tests-web` for a change with UI (the `ui` output of `changes`, issue 1608): a change without UI leaves the web package as it was. Locally `make ci-tests` runs both and the coverage check.

## Evidence

The database tests need PostgreSQL: CI starts a service container, locally `make db-up` starts one. The gate counts failures, not the number of tests: a test that is skipped or that asserts nothing still passes. Coverage thresholds are PRIN-029.
