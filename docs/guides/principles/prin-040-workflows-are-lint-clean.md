---
id: PRIN-040
title: GitHub workflow files are lint-clean
maturity: gated
spec: [FR-QG-01]
---

## Why it is better

A workflow with a syntax or expression error fails only when it runs, often on the merge. Linting it on every change catches the error where it is written.

## How it is measured

Number of findings of actionlint over `.github/workflows/`. Target: 0.

## Checked by

`tools/lint/actionlint.sh`.

## Gate

`make gates` and `make ci-gates` run the target `workflows` first; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

No own tests; the script runs over the repository's own workflow files.
