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

Phone exception (owner decision 2026-11-20, issue 1854): below 768 px (360x640, 390x844 and 360x640 at 200 % text) a list and the Heute frame may scroll vertically, the page or its inner scroll region; the page title, the first rows of the list and the primary action must be fully visible in the window at load and not under a fixed bar; at 200 % text the page title is whole in the first screen. Every other view keeps its page within the window (a layer: its own box and regions). From 768 px every view and layer fits one screen as before; sideways scroll and the 1920 px width cap are checked unchanged at every size.

The layout shift of a cold load (US-QS-14, DS-52, issue 1697) is measured in the same project for every screen at 360x640, 390x844 and 1280x800, with the API answering each read after 1.5 s: the cumulative shift stays below 0.1 (a starting value, assumption); the loads above it are listed in `app/config/gates/baselines/layout-shift-baseline.json`, and a listed one may not get worse by more than 0.02. Reported, not yet blocking (spread up to 0.244 between identical CI runs): the check writes its findings to the step summary until the R1 ticket #1729 "deterministic shift check" makes it deterministic and blocking.

## Checked by

`app/packages/e2e/tests/accessibility/routes/one-screen.spec.ts`, `app/packages/e2e/tests/accessibility/routes/one-screen-sideways.ts`, `app/packages/e2e/tests/accessibility/routes/one-screen.shift.ts`, `app/packages/e2e/support/display/screens.json`, `app/packages/e2e/support/display/one-screen/judge.shift.ts`, `app/packages/e2e/support/display/one-screen/fit.shift.ts`, `app/config/gates/baselines/one-screen-baseline.json`, `app/config/gates/baselines/layout-shift-baseline.json`.

## Gate

Three tiers (US-QG-02, issue 2666). A pull request runs `make one-screen` in the job `ui-shard` of `.github/workflows/ci.yml` for the screens that its diff touches only, at the six fit and cap sizes (`ONE_SCREEN_SIZES=gate`; the 200 % text size is not measured there). The blocking nightly run `nightly-a11y` measures every screen at the same six sizes and sets the commit status that `make release` checks. The warning run `nightly-a11y-report` measures 200 % text (`ONE_SCREEN_SIZES=text200`) and never fails; its counts go to the rolling issue `a11y-nightly`. The job `results` merges the shards of a pull request run (every touched screen and size measured once); `ci-status` requires the job, and a skipped run counts as green.

## Evidence

The job's report (`make one-screen-report`) goes to the job summary. The screens come from the same register as PRIN-064.
