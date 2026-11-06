---
id: PRIN-057
title: Components and pages keep their look unless a change is reviewed
maturity: gated
spec: [FR-QG-27, US-QS-07]
---

## Why it is better

A change that moves or hides content on a page is easy to miss in review. Pictures at the reference sizes, compared with baselines in git, show the change in the same PR.

## How it is measured

Pixel difference of each component story and each page story against its baseline, at the reference sizes and in light and dark (tolerance 0.1 % of the pixels, a starting value, assumption). A new page story without a baseline fails. Target: 0 differences that are not part of the same PR's baseline update. Known unstable screenshots are listed in `app/config/gates/baselines/page-snapshots-baseline.json` (0 entries today).

## Checked by

`app/tools/check/code/conformance/ds-snapshots.mjs`, `app/tools/check/code/conformance/ds-snapshots.lib.mjs`, `app/tools/check/code/conformance/ds-snapshots.container.mjs`, `app/config/gates/baselines/page-snapshots-baseline.json`; baselines in `app/packages/web/.storybook/snapshots` and `app/packages/web/.storybook/page-snapshots`.

## Gate

`make ds-snapshots-check` in the CI job `ds-snapshots` of `.github/workflows/ci.yml`, which runs in a pinned Playwright container; `ci-status` requires the job. The job never updates baselines; `make ds-snapshots` does, locally, and the new images are reviewed in the same PR.

## Evidence

Tests in `app/tools/check/code/conformance/ds-snapshots.lib.test.mjs` and the self-test `app/tools/check/code/conformance/ds-snapshots.selftest.mjs`. Local runs need Docker.
