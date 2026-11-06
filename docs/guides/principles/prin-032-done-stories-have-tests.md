---
id: PRIN-032
title: Every done story has a test whose name carries the story ID
maturity: gated
spec: [US-QG-04, FR-QG-06, P-06]
---

## Why it is better

A story marked done without a test is a claim nobody can check. A test name with the ID connects the spec to the code in both directions (P-06).

## How it is measured

Number of stories marked ✅ in `docs/specs/product/` without a test whose name contains the story ID (an error). Tests that name unknown or open stories are reported as hints. Target: 0 errors.

## Checked by

`app/tools/check/docs/specs/check-traceability.mjs`.

## Gate

`make gates` (step `npm run specs`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`); a pull request that changes only documentation runs it in the job `docs-gates` (`make ci-docs`) instead, and `ci-status` requires both. Locally: `make spec-check`.

## Evidence

Tests in `app/tools/check/docs/specs/check-traceability.test.mjs`. The check sees that a name carries the ID, not that the test covers the acceptance criteria; that is a review question.
