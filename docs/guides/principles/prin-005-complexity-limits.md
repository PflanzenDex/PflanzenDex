---
id: PRIN-005
title: Cyclomatic complexity is at most 15, in the core at most 10
maturity: gated
spec: [FR-QG-04, E-15, US-QG-08]
---

## Why it is better

Business rules live in the core; branching-heavy functions there are the hardest to test and the most likely to hide defects.

## How it is measured

ESLint `complexity` reports the offending function; the target is 0 functions above the limit (starting values, an assumption per E-15). Cognitive complexity from E-15 is not enforced yet.

## Checked by

`app/config/lint/eslint.config.js`.

## Gate

`make gates` (step `npm run lint`), repeated in `make ci`, which the CI job `app` in `.github/workflows/ci.yml` runs and `ci-status` requires.

## Evidence

Thresholds are configured once, in `app/config/lint/eslint.config.js` (FR-QG-18).
