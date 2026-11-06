---
id: PRIN-031
title: No new copy-paste group in changed files, at most 1 % duplicated lines overall
maturity: gated
spec: [QG-K4, QG-K5, US-QG-08]
---

## Why it is better

Copies drift apart: a fix lands in one copy and not in the others. A diff gate stops new copies where they start, and the share limit keeps the whole project within reach of a review.

## How it is measured

Two numbers. (a) Clone groups with at least 3 copies that touch a file changed against the base branch: target 0. (b) Share of duplicated lines in `app/packages` measured by jscpd, against `dup.maxPercent` (1.0 in `app/config/gates/quality-limits.json`, the owner's target). DUP-2 also fails when the measured value is more than `slackPercent` (0.1) below the limit, so the limit is lowered to the measured value. US-QG-08 records a measured 0.64 % of duplicated lines.

## Checked by

`app/tools/check/quality/duplicates/check-duplicates.mjs`, `app/tools/check/quality/duplicates/check-dup.mjs`, `app/.jscpd.json`, `app/config/gates/quality-limits.json`.

## Gate

`make gates` (steps `npm run duplicates` and `npm run dup`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it. Locally: `make duplicates` and `make dup`.

## Evidence

Tests in `app/tools/check/quality/duplicates/check-duplicates.test.mjs` and `app/tools/check/quality/duplicates/check-dup.test.mjs`. The clone count of the whole project is only reported; test code is excluded by the tool.
