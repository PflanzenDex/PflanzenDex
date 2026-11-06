---
id: PRIN-054
title: Every write route requires the repeat-guard key
maturity: gated
spec: [US-QS-03]
---

## Why it is better

A write that is sent again after a lost answer must not happen twice. The key makes a repeated request recognisable; a write route without it cannot offer that protection.

## How it is measured

Number of non-GET routes that do not answer a request without the key with `400` and `idempotency.key_missing`, apart from the named exceptions (each with a reason in the test). Target: 0. The test also checks that the AI client's write routes carry the key.

## Checked by

`app/packages/api/src/write-key-routes.test.ts`.

## Gate

`make ci-tests-base` in the CI job `app-tests` of `.github/workflows/ci.yml`; `ci-status` requires the job.

## Evidence

The test names carry US-QS-03: one test walks every non-GET route, one checks the AI client, one checks that each named exception is still a route with a reason. A new exception is a reviewable change in the test file.
