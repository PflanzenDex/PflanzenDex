---
id: PRIN-022
title: Inline numbers and enum literals are central constants, known hits only shrink
maturity: gated
spec: [FR-QG-12, QG-C9, FR-QG-17]
---

## Why it is better

The same threshold written in two places drifts apart, and a changed rule then misses one of them. Named constants have one source and a name that says what the number means.

## How it is measured

Hits of the ESLint rules `constants/no-magic-number` and `constants/no-enum-literal` per file and in total. The baseline `app/config/gates/baselines/constants-baseline.json` allows `maxTotal` 324 hits over 158 file entries today; the total only goes down. Target: no hit outside the baseline.

## Checked by

`app/tools/check/code/constants/check-constants.mjs`, `app/tools/check/code/constants/eslint-constants.mjs`, `app/tools/check/code/constants/constants-config.mjs`, `app/config/gates/baselines/constants-baseline.json`.

## Gate

`make gates` (step `npm run constants`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests in `app/tools/check/code/constants/check-constants.test.mjs`. The ratchet counts hits; it does not judge whether a named constant is the right one. Exclusions are defined in `constants-config.mjs`.
