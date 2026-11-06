---
id: PRIN-024
title: Threshold numbers in the definition of done equal the gate configuration
maturity: gated
spec: [FR-QG-18, QG-U11]
---

## Why it is better

Docs that repeat a threshold drift from the gate that enforces it (a known case: the definition of done named 70 % coverage while CI enforced 75 %). The number lives once in the configuration and the documents point to it.

## How it is measured

Findings in the definition-of-done documents (PR template, `AGENTS.md`, `CONTRIBUTING.md`): DN-1 a threshold-like number without a `gate:` marker, DN-2 a marked number that differs from its configuration value, DN-3 a marked path that does not exist. Target: 0.

## Checked by

`app/tools/check/docs/specs/spec-numbers/check-dod-numbers.mjs` (reuses `check-spec-numbers.mjs`).

## Gate

`make gates` (step `npm run dod-numbers`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests in `app/tools/check/docs/specs/spec-numbers/check-dod-numbers.test.mjs`. DN-1 is a heuristic over the wording (a percent sign, or a threshold keyword on the same line), so an unusual sentence can slip through.
