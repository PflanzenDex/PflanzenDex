---
id: PRIN-061
title: The signed-in Heute and Sammlung screens are measured nightly (report)
maturity: checked
spec: [FR-QG-09]
---

## Why it is better

The start page is not what most users see every day. Measuring the signed-in screens shows where the real work is, before a limit is set for them.

## How it is measured

Lighthouse scores and Web Vitals of "Heute" and "Sammlung" for a seeded demo user, median of 3 mobile runs. No limit yet: a score never fails the run; a run that cannot measure or lands on another page fails. Limits follow from these numbers by owner decision.

## Checked by

`tools/lighthouse/lighthouse-signed.sh`, `tools/lighthouse/lighthouse-signed.mjs`, `tools/lighthouse/lighthouse-signed-run.mjs`.

## Evidence

Run nightly by the job `lighthouse-signed` in `.github/workflows/nightly.yml` (`make lighthouse-signed`); the summary goes to the job summary. Tests in `tools/lighthouse/lighthouse-signed.test.mjs`. Not part of `ci-status`.
