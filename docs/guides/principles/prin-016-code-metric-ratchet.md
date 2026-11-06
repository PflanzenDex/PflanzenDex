---
id: PRIN-016
title: Existing code-metric violations are listed in a baseline that only shrinks
maturity: gated
spec: [FR-QG-17, US-QG-08, US-QG-06]
---

## Why it is better

A gate that must be green on the day it is armed would block work on old disorder. A baseline lets the rule apply to all new code at once while known excesses are paid down one by one.

## How it is measured

Number of entries in `app/config/gates/baselines/quality-baseline.json` (`maxEntries` 0 and no entries today) and number of metric violations outside it. Target: 0 violations outside the baseline; the list only shrinks (BL-3: `maxEntries` is lowered, never raised).

## Checked by

`app/tools/check/quality/check-baseline.mjs`, `app/config/gates/baselines/quality-baseline.json`.

## Gate

`make gates` (step `npm run baseline`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests in `app/tools/check/quality/check-baseline.test.mjs`. The script runs ESLint with `QUALITY_BASELINE=off`, so the allowance of the baseline cannot hide a violation. Because the baseline is empty, any new excess fails at once. Changing the baseline file is a change to a gate file and needs a reason in the PR.
