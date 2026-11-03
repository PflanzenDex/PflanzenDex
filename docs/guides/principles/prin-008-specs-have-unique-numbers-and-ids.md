---
id: PRIN-008
title: Spec files and spec IDs are unique
maturity: gated
spec: [FR-QG-03, US-DEV-08]
---

## Why it is better

Parallel sessions can take the same file number or define the same ID twice. Later references then point to two things.

## How it is measured

The script reports every duplicate file number and every ID defined twice; the target is 0.

## Checked by

`app/tools/check/docs/specs/check-specs.mjs`, tests in `app/tools/check/docs/specs/check-specs.test.mjs`.

## Gate

`make gates` (step `npm run specs`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests `US-DEV-08: ...` cover duplicate file numbers, duplicate IDs and E-nn decisions.
