---
id: PRIN-039
title: No secrets in the repository or in its history
maturity: gated
spec: [QG-S1, NFR-10]
---

## Why it is better

A secret that reaches a public repository stays in its history even after it is deleted from the files. Finding it before it is pushed, or at least on every run, keeps the damage small.

## How it is measured

Number of findings of Gitleaks over the full git history. Target: 0. The job fetches the full history so that old commits are scanned too.

## Checked by

`tools/lint/gitleaks.sh`.

## Gate

`make gates` and `make ci-gates` run the target `secrets` first; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`, with `fetch-depth: 0`) and `ci-status` requires it.

## Evidence

No own tests. Gitleaks finds the patterns it knows; a secret in an unknown format is not detected.
