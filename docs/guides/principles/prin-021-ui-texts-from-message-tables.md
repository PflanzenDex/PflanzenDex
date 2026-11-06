---
id: PRIN-021
title: UI texts come from message tables, known literal texts only shrink
maturity: gated
spec: [FR-QG-26, QG-C8, FR-QG-17]
---

## Why it is better

Texts in message tables can be reviewed, translated and kept consistent; a literal text in a component cannot. The ratchet stops new literals while the old ones are migrated feature by feature.

## How it is measured

Literal UI texts per file, counted by the ESLint rule `ui-text/no-literal-text`, and in total. The baseline `app/config/gates/baselines/ui-text-baseline.json` allows `maxTotal` 1283 literals over 207 file entries today; the total only goes down. Target: no literal outside the baseline and no file above its count.

## Checked by

`app/tools/check/code/ui-text/check-ui-text.mjs`, `app/tools/check/code/ui-text/eslint-ui-text.mjs`, `app/config/gates/baselines/ui-text-baseline.json`.

## Gate

`make gates` (step `npm run ui-text`, plus the ESLint rule in `make lint`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests in `app/tools/check/code/ui-text/check-ui-text.test.mjs`. The count in FR-QG-26 of the specification is older than the baseline file; the file is the source. The ratchet checks where a text sits, not whether its German wording is right.
