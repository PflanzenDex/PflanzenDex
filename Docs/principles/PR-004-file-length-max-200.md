---
id: PR-004
title: Source files have at most 200 lines
maturity: gated
spec: [FR-QG-04, E-15, US-QG-08]
---

## Why it is better
Short files stay reviewable and keep responsibilities separate. A reviewer can read a whole file in one pass.

## How it is measured
ESLint `max-lines` reports the offending file; the target is 0 files above 200 lines (starting value, an assumption per E-15). Tests are exempt. A file may opt out only with a `MAX_LINES_IGNORE: <reason>` marker, which the boundary script (`MK-1`) rejects if the reason is empty.

## Checked by
`app/eslint.config.js`.

## Gate
`make gates` (step `npm run lint`), repeated in `make ci`, which the CI job `app` in `.github/workflows/ci.yml` runs and `ci-status` requires.

## Evidence
The threshold is configured once, in `app/eslint.config.js` (FR-QG-18).
