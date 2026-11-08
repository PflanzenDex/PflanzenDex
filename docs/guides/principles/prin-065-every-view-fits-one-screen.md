---
id: PRIN-065
title: Every view and layer fits the window at phone and desktop sizes
maturity: gated
spec: [US-QS-15, QG-U8]
---

## Why it is better

A screen that needs scrolling in two directions on a phone, or that overlaps its content, is not usable. Measuring every view at the reference sizes shows the overflow where it happens.

## How it is measured

Per registered view and layer at 360x640, 390x844, 768x1024, 1024x768 and 1920x1080 (and the 1920 px width cap at 2560x1440, and 200 % text at 360x640): the page and each visible scroll region are at most 1 px larger than the window, vertically and sideways. Known findings: `app/config/gates/baselines/one-screen-baseline.json` has 0 entries. Target: 0 findings.

The layout shift of a cold load (US-QS-14, DS-52, issue 1697) is measured in the same project for every screen at 360x640, 390x844 and 1280x800, with the API answering each read after 1.5 s: the cumulative shift stays below 0.1 (a starting value, assumption); the loads above it are listed in `app/config/gates/baselines/layout-shift-baseline.json`, and a listed one may not get worse by more than 0.02. Reported, not yet blocking (spread up to 0.244 between identical CI runs): the check writes its findings to the step summary until the R1 ticket #1729 "deterministic shift check" makes it deterministic and blocking.

## Checked by

`app/packages/e2e/tests/accessibility/routes/one-screen.spec.ts`, `app/packages/e2e/tests/accessibility/routes/one-screen-sideways.ts`, `app/packages/e2e/tests/accessibility/routes/one-screen.shift.ts`, `app/packages/e2e/support/display/screens.json`, `app/packages/e2e/support/display/one-screen/judge.shift.ts`, `app/packages/e2e/support/display/one-screen/fit.shift.ts`, `app/config/gates/baselines/one-screen-baseline.json`, `app/config/gates/baselines/layout-shift-baseline.json`.

## Gate

`make one-screen` in the shard jobs `ui-shard` of `.github/workflows/ci.yml` (`make ui-gates`, one job per shard with the a11y-routes gate), merged by the job `results`, which runs for pull requests into `dev` and `main` when the UI, the e2e package, the demo seed or the gate files change; `ci-status` requires the job, and a skipped run counts as green.

## Evidence

The job's report (`make one-screen-report`) goes to the job summary. The screens come from the same register as PRIN-064.
