---
id: PRIN-014
title: Lint and the strict type check pass in every package
maturity: gated
spec: [QG-C2, QG-C3, FR-QG-10]
---

## Why it is better

Lint and types find defects and drift before review, and one shared configuration means every package is held to the same bar. A red lint or type check is a stop for the merge, not a comment.

## How it is measured

Number of ESLint errors (configuration `app/eslint.config.js`, with the typescript-eslint strict rules) and of TypeScript errors under `strict` (`app/config/project/tsconfig.base.json`, `tsc --noEmit` in each package). Target: 0.

## Checked by

`app/eslint.config.js`, `app/config/project/tsconfig.base.json`.

## Gate

`make gates` (steps `npm run lint` and `npm run typecheck`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it. Locally: `make lint` and `make typecheck`.

## Evidence

The rules have no tests of their own; they are proven by the repository passing the run and by the rule messages of a failed run. The file length and complexity rules are in PRIN-004 and PRIN-005.
