---
id: PR-002
title: API and web import the core only through its package root
maturity: gated
spec: [AB-2, P-02, FR-QG-05]
---

## Why it is better
Deep imports into core internals freeze the internal file layout and bypass the validating operations (P-03).

## How it is measured
Number of `AB-2` violations; the target is 0.

## Checked by
`app/scripts/check-boundaries.mjs`, tests in `app/scripts/check-boundaries.test.mjs`.

## Gate
`make gates` (step `npm run boundaries`), repeated in `make ci`, which the CI job `app` in `.github/workflows/ci.yml` runs and `ci-status` requires.

## Evidence
Violations fail with rule `AB-2` and path (see the AB-2 cases in `app/scripts/check-boundaries.test.mjs`).
