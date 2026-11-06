---
id: PRIN-036
title: Markdown is linted and relative links resolve
maturity: gated
spec: [QG-U2, FR-QG-03]
---

## Why it is better

The docs are the first place a reader looks. A dead relative link or a broken Markdown structure is found in review only by chance.

## How it is measured

Number of markdownlint-cli2 findings in `docs/**/*.md` and `CLAUDE.md` (configuration `.markdownlint-cli2.jsonc`) and number of relative links that do not resolve. Target: 0 for both.

## Checked by

`app/tools/check/docs/check-links.mjs`, `.markdownlint-cli2.jsonc`.

## Gate

`make gates` (step `npm run docs`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`); a pull request that changes only documentation runs it in the job `docs-gates` (`make ci-docs`) instead, and `ci-status` requires both. Locally: `make docs-check`.

## Evidence

Tests in `app/tools/check/docs/check-links.test.mjs`. External links are not checked.
