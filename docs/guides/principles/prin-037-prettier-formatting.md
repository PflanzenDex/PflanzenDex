---
id: PRIN-037
title: Code and docs are formatted by Prettier
maturity: gated
spec: [QG-C2]
---

## Why it is better

A single formatter ends style discussions in review and keeps diffs free of formatting noise.

## How it is measured

Number of files that `prettier --check` reports as not formatted, across the repository. Target: 0.

## Checked by

`app/.prettierrc.json` (configuration of the formatter).

## Gate

`make gates` (step `npm run format:check`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it. The pre-commit hook (`.githooks/pre-commit`) formats staged files with lint-staged; `make format` applies the formatter.

## Evidence

No own tests. The pre-commit hook is local and can be skipped with `--no-verify`, which is not allowed for agents; the CI check is the blocking one.
