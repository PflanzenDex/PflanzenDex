---
id: PRIN-055
title: Every shared UI component has a story that shows its variants and states
maturity: gated
spec: [QG-U5, US-QS-07]
---

## Why it is better

A component that nobody has rendered in every state is only tested in the screens that happen to use it. The story catalog is where a reviewer sees all states at once.

## How it is measured

Number of components in `app/packages/web/src/shared/ui`, `app/packages/web/src/shared/patterns` and `app/packages/web/src/app/frame` without a `<name>.stories.tsx` next to them, and number of stories missing an exported `Default`, `AllVariants` (when the component has variants), `Disabled` or `Invalid` (when the source mentions them) and `Loading` or `Pending` (when the source mentions them). Target: 0. No baseline.

## Checked by

`app/tools/check/quality/check-stories.mjs`.

## Gate

`make gates` (step `npm run stories`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests in `app/tools/check/quality/check-stories.test.mjs`. Limits: the check is mechanical; focus has no trigger, and whether a story is meaningful is a review question, as the script says.
