---
id: PRIN-030
title: A complex function must be tested, CRAP score at most 450 per function
maturity: gated
spec: [QG-K3, US-QG-08, FR-QG-16]
---

## Why it is better

A complex function is acceptable when it is well tested; it is a risk when it is complex and untested. The CRAP score combines both, so the gate fits a function's real risk better than a complexity limit alone.

## How it is measured

Number of functions in changed files whose CRAP score (complexity squared times the uncovered share cubed, plus complexity) is above `crap.max` in `app/config/gates/quality-limits.json` (450, a starting value taken from another project, assumption). Target: 0 on the diff. `make crap ARGS=--all` checks the whole project and is report material.

## Checked by

`app/tools/check/quality/check-crap.mjs`, `app/config/gates/quality-limits.json`.

## Gate

`make ci-coverage` (the coverage part of the CI job `results`), which runs `npm run crap` after the ratchet; `ci-status` requires the job.

## Evidence

Tests in `app/tools/check/quality/check-crap.test.mjs`. The check needs the coverage output of `make coverage` and the complexity from Fallow `health`; a function in a file without coverage data is scored with Fallow's conservative estimate.
