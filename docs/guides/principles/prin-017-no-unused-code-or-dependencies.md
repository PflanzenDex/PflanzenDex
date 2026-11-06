---
id: PRIN-017
title: No unused exports, files or dependencies
maturity: gated
spec: [QG-C6, QG-C7, US-DEV-03]
---

## Why it is better

Dead code and unused packages keep being read, maintained and shipped, and they hide the code that is really used. Removing them keeps the codebase small enough to change safely.

## How it is measured

Number of findings of knip (exports, files and dependencies not used, and dependencies used but not declared), with tests counted as entry points. Target: 0. A weekly report without tests as entry points lists code that only tests keep alive; it is reported and not blocking.

## Checked by

`app/config/lint/knip.json`.

## Gate

`make gates` (step `npm run knip`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

No own tests. knip returns an error on findings, and the `knip` script in `app/package.json` does not disable that. The weekly production-only report (`.github/workflows/unused-code.yml`, `make unused-report`) is report only; a finding there is deleted, wired in or explained in its issue.
