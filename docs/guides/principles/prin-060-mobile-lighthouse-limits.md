---
id: PRIN-060
title: Mobile Lighthouse scores and Web Vitals of the start page stay within their limits
maturity: gated
spec: [FR-QG-09, QG-U1]
---

## Why it is better

Scores and Web Vitals are the measurable side of "usable on a phone". A limit per metric stops a regression before it reaches users.

## How it is measured

Median of 3 mobile runs per metric against `lighthouse` in `app/config/gates/quality-limits.json`: performance at least 88, accessibility at least 95, best practices at least 90, SEO at least 80; LCP at most 3300 ms, TBT at most 200 ms, CLS at most 0.1. Target: every median within its limit. The values are starting values with slack over a measured run (see the comment in the file).

## Checked by

`app/tools/check/release/check-lighthouse-summary.mjs`, `tools/lighthouse/lighthouse-run.sh`, `app/config/gates/quality-limits.json`.

## Gate

`make lighthouse` in the CI job `lighthouse` of `.github/workflows/ci.yml`, which runs for pull requests into `dev` and `main` when the app changes; `ci-status` requires the job, and it counts as green when the job is skipped.

## Evidence

Tests in `app/tools/check/release/check-lighthouse-summary.test.mjs`. Measured under Lighthouse's simulated mobile throttling, not on a real phone. The same target runs nightly on `dev` in the job `lighthouse` of `.github/workflows/nightly.yml`; a value past its limit turns that job red (the `report` job that opens an issue does not wait for it).
