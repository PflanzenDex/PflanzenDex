---
id: PRIN-018
title: ESLint security rules are errors
maturity: gated
spec: [QG-S3, E-16]
---

## Why it is better

Common security mistakes (for example unsafe regular expressions or unsafe child-process calls) are cheap to catch while the code is written and expensive after release.

## How it is measured

Number of findings of `eslint-plugin-security` in its recommended set, with every rule at error level. Target: 0. The rule `security/detect-object-injection` is off on purpose: it flags every dynamic property access and gives false positives in typed code (see the comment in `app/eslint.config.js`; E-16 asks for a re-check after R1).

## Checked by

`app/eslint.config.js`.

## Gate

`make gates` (step `npm run lint`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

No own tests. This is a pattern check, not a data-flow analysis; the deeper CodeQL queries are in PRIN-019.
