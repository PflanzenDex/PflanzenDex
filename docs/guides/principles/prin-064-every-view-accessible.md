---
id: PRIN-064
title: Every view and layer is checked for accessibility violations and keyboard reachability
maturity: gated
spec: [FR-QG-24, NFR-13, QG-U7]
---

## Why it is better

Accessibility problems in a rarely visited screen are still problems. A register of all screens, checked on every change to the UI, keeps new screens from shipping inaccessible.

## How it is measured

Per registered screen at 390x844 and 1920x1080: axe violations of WCAG 2.2 A and AA, serious and critical, and keyboard-walk failures (reach, visible focus, no trap, skip link). Known findings: 13 entries in `app/config/gates/baselines/a11y-routes-baseline.json`, which only shrinks. A route without a register entry fails. Target: no new finding.

## Checked by

`app/packages/e2e/tests/accessibility/routes/a11y-routes.spec.ts`, `app/packages/e2e/support/display/screens.json` (the register), `app/packages/e2e/support/axe.ts`, `app/packages/e2e/tests/accessibility/keyboard/keyboard.ts`, `app/config/gates/baselines/a11y-routes-baseline.json`.

## Gate

Three tiers (US-QG-02, issue 2666). A pull request runs `make a11y-routes` in the job `ui-shard` of `.github/workflows/ci.yml` for the screens that its diff touches only (`touched-screens.ts`); a change to shared UI, the tokens or the frame touches every screen. The blocking nightly run `nightly-a11y` (`.github/workflows/nightly.yml`) runs every screen and sets the commit status `nightly-a11y` on the `dev` head it tested; `make release` refuses a release unless that status is green (`make nightly-a11y-check`). The warning run `nightly-a11y-report` runs the walk under forced colors and under reduced motion and never fails; its counts go to the rolling issue `a11y-nightly`. The job `results` merges the shards of a pull request run; `ci-status` requires the job, and a skipped run counts as green.

## Evidence

Tests in `app/packages/e2e/tests/accessibility/routes/a11y-routes-self-test.spec.ts`. The shortcut-register test (FR-QG-24) is missing until US-QS-11 exists. The job does not run for changes that touch neither the UI nor the e2e package nor the gate files.
