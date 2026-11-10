---
id: PRIN-023
title: Numbers marked in the product specs equal the constants in the code
maturity: gated
spec: [FR-QG-13, QG-U10]
---

## Why it is better

A spec that says "buffer 2" while the code uses 3 misleads the reader and the test writer. Marked numbers in the spec point to the constant they must equal.

## How it is measured

Findings per code: SN-1 (a marked spec number differs from the constant), SN-2 (the constant does not exist), SN-3 (a marker without a number), SN-4 (a registered constant lost its marker). Target: 0.

## Checked by

`app/tools/check/docs/specs/spec-numbers/check-spec-numbers.mjs`, register `app/config/project/spec-numbers.json`.

## Gate

`make gates` (step `npm run spec-numbers`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`); a pull request that changes only documentation runs it in the job `docs-gates` (`make ci-docs`) instead, and `ci-status` requires both.

## Evidence

Tests in `app/tools/check/docs/specs/spec-numbers/check-spec-numbers.test.mjs`. Only numbers with a marker are compared; an unmarked number in a spec is not checked.
