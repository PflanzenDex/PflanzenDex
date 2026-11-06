---
id: PRIN-042
title: No known high or critical vulnerability in the dependencies without a dated exception
maturity: gated
spec: [QG-S2, NFR-10]
---

## Why it is better

A known high-severity vulnerability in a dependency is a known way in. The exceptions are dated, so that an accepted risk is reviewed again when its date passes.

## How it is measured

Number of high or critical npm advisories without an entry in the allowlist, and number of allowlist entries past their expiry. Target: 0 for both. Today the allowlist has 4 entries, all expiring on 2026-11-28 (30 days, starting value chosen by the owner).

## Checked by

`app/tools/check/supply/check-audit.mjs`, `app/config/gates/audit-allowlist.json`.

## Gate

`make audit` in the CI job `audit`, which runs only for pull requests into `main` and is required by `ci-status`; and the job `dependency-review` in `.github/workflows/ci.yml` (`fail-on-severity: high`) for every pull request, also required by `ci-status`.

## Evidence

Tests in `app/tools/check/supply/check-audit.test.mjs`. Limits: the full audit does not run on pull requests into `dev`; the nightly suite runs `make audit` and opens an issue on failure. The dependency review sees only the dependencies a pull request adds or changes.
