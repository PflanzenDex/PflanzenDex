---
id: PRIN-029
title: Test coverage per package never drops below its threshold, thresholds only rise
maturity: gated
spec: [US-QG-06, E-15, FR-QG-18]
---

## Why it is better

Coverage that falls unnoticed means new code ships untested. A ratchet keeps the level reached and makes every later rise visible, without asking for a big-bang target.

## How it is measured

Line, branch, function and statement coverage of each package (`coverage-summary.json`) against the values in `app/config/gates/coverage-thresholds.json`. Target: every value at or above its threshold. Today the thresholds are core 98 / 90 / 96 / 96, api 97 / 86 / 94 / 96, web 97 / 86 / 94 / 95 and db 95 / 90 / 99 / 95 (lines / branches / functions / statements). If a value is at least 2 points above its threshold the check prints a hint to raise it; raising is a manual edit of the file.

## Checked by

`app/tools/check/quality/coverage/check-coverage-ratchet.mjs`, `app/config/gates/coverage-thresholds.json`, `app/tools/check/quality/coverage/coverage-config.mjs`.

## Gate

`make ci-coverage` (the coverage part of the CI job `results`, which runs after the test jobs and is required by `ci-status`; issue 1608). For a change without UI the web package is left out, because its tests were skipped: the input `COVERAGE_UNMEASURED=web` names it, and an unknown name fails (US-QG-02). Locally `make coverage` runs the tests and the ratchet.

## Evidence

Tests in `app/tools/check/quality/coverage/check-coverage-ratchet.test.mjs`: a value below its threshold fails, values at or above pass, a gap of 2 points only hints, a missing summary fails. Limits: the script compares with the file and never edits it; lowering a threshold is a change to a gate file that agents cannot merge and that needs a reason in the PR. Per-module coverage is a report only.
