---
id: PR-003
title: Web imports neither the API nor the database package
maturity: gated
spec: [AB-6, FR-QG-05]
---

## Why it is better
The browser may reach the server only over HTTP. A direct import would pull server code and secrets into the client bundle and couple the layers.

## How it is measured
Number of `AB-6` violations; the target is 0.

## Checked by
`app/scripts/check-boundaries.mjs`, tests in `app/scripts/check-boundaries.test.mjs`.

## Gate
`make gates` (step `npm run boundaries`), repeated in `make ci`, which the CI job `app` in `.github/workflows/ci.yml` runs and `ci-status` requires.

## Evidence
Violations fail with rule `AB-6` and path (tests in `app/scripts/check-boundaries.test.mjs`).
