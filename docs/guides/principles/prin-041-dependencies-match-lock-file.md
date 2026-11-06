---
id: PRIN-041
title: Installed dependencies match the lock file
maturity: gated
spec: [FR-QG-15, FR-QG-01]
---

## Why it is better

After a pull that changed the lock file, a stale `node_modules` fails later with errors that do not name the cause (a missing module in the type check). The check names the cause and the fix.

## How it is measured

Equality of the SHA-256 of `app/package-lock.json` with the value stamped into `app/node_modules/.setup-lock-hash` by `make setup`. Target: equal; otherwise the check fails with "run make setup".

## Checked by

`app/tools/check/supply/check-deps.mjs`, `.githooks/_lib.sh` (the hooks call it too).

## Gate

`make gates` runs `node tools/check/supply/check-deps.mjs` before `npm run gates`. The CI job `app-gates` runs `make ci-gates`, which does not include this step: CI installs the dependencies in `make setup` itself.

## Evidence

Tests in `app/tools/check/supply/check-deps.test.mjs`. In practice the check bites locally (after a pull that changed the lock file); CI installs its own dependencies in `make setup`.
