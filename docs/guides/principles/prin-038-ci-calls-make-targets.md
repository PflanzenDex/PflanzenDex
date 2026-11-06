---
id: PRIN-038
title: CI jobs run make targets, not raw npm or node commands
maturity: gated
spec: [FR-QG-01]
---

## Why it is better

When CI runs its own command line, a developer cannot reproduce the failure with the same command, and the two versions drift apart. Calling `make` keeps the local and the CI run identical.

## How it is measured

Number of workflow `run:` steps that call `npm`, `npx` or `node` directly, except the entries of the allowlist in the script (`npm ci` before `make`, and `actions/` steps). Target: 0.

## Checked by

`app/tools/check/release/check-ci-drift.mjs`.

## Gate

`make gates` (step `npm run ci-drift`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests in `app/tools/check/release/check-ci-drift.test.mjs`. The allowlist lives in the script, so an addition is a change to a check script that needs a reason in the PR.
