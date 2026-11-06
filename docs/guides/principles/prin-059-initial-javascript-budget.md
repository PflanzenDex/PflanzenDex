---
id: PRIN-059
title: The initial JavaScript of the web app stays within its budget
maturity: gated
spec: [FR-QG-09, QG-U6, FR-QG-16]
---

## Why it is better

Every kilobyte of script a phone loads before the first screen costs time on mobile networks. A fixed ceiling keeps the first load from growing unnoticed.

## How it is measured

Gzip size of the initial JavaScript of the built app (the entry chunk, the modulepreload chunks and their static imports; lazy routes are not counted) against `bundle.initialJsGzipBytes` (140000 in `app/config/gates/quality-limits.json`, a fixed ceiling). The goal of 125 kB is only reported (`make bundle-report`). Target: at or below the limit.

## Checked by

`app/tools/check/supply/check-bundle-budget.mjs`, `app/config/gates/quality-limits.json`.

## Gate

`make ci-ui` in the CI job `app-ui` of `.github/workflows/ci.yml` (runs the budget after the build); `ci-status` requires the job.

## Evidence

Tests in `app/tools/check/supply/check-bundle-budget.test.mjs`. The report of each chunk is written to the job summary by the job `app-ui` (report only).
