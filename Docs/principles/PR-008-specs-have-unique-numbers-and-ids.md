---
id: PR-008
title: Spec files and spec IDs are unique
maturity: gated
spec: [FR-QG-03, US-DEV-08]
---

## Why it is better
Parallel sessions can take the same file number or define the same ID twice. Later references then point to two things.

## How it is measured
The script reports every duplicate file number and every ID defined twice; the target is 0.

## Checked by
`app/scripts/check-specs.mjs`, tests in `app/scripts/check-specs.test.mjs`.

## Gate
`make gates` (step `npm run specs`), repeated in `make ci`, which the CI job `app` in `.github/workflows/ci.yml` runs and `ci-status` requires.

## Evidence
Tests `US-DEV-08: ...` cover duplicate file numbers, duplicate IDs and E-nn decisions.
