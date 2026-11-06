---
id: PRIN-015
title: Functions have at most 60 lines, depth 4, 4 parameters and cognitive complexity 30 (15 in core)
maturity: gated
spec: [QG-K2, US-QG-08, FR-QG-16]
---

## Why it is better

A long, deeply nested or parameter-heavy function hides its branches. Limits keep functions readable and testable, and core logic stays small enough to decompose.

## How it is measured

Number of functions above a limit, reported by ESLint rules `max-lines-per-function`, `max-depth`, `max-params` and `sonarjs/cognitive-complexity`. Values come from `app/config/gates/quality-limits.json` (`default`: 60 lines, depth 4, 4 parameters, cognitive 30; `overrides` for the `core` package: cognitive 15). They are starting values (assumption, E-15). Target: 0 functions above a limit outside the baseline of PRIN-016.

## Checked by

`app/eslint.config.js`, `app/config/gates/quality-limits.json`.

## Gate

`make gates` (step `npm run lint`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

No own tests; the rules bite on the repository. A file with a `COMPLEXITY_IGNORE: <reason>` marker in its first five lines is exempt; the boundary script rejects a marker without a reason (rule MK-1 in `app/tools/check/code/check-boundaries.mjs`).
