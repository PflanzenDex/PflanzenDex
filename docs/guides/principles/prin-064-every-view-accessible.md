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

`app/packages/e2e/tests/accessibility/routes/a11y-routes.spec.ts`, `app/packages/e2e/support/display/screens.json` (the register), `app/packages/e2e/support/axe.ts`, `app/packages/e2e/support/keyboard.ts`, `app/config/gates/baselines/a11y-routes-baseline.json`.

## Gate

`make a11y-routes` in the CI job `a11y-routes` of `.github/workflows/ci.yml`, which runs for pull requests into `dev` and `main` when the one-screen paths change; `ci-status` requires the job, and a skipped run counts as green.

## Evidence

Tests in `app/packages/e2e/tests/accessibility/routes/a11y-routes-self-test.spec.ts`. The shortcut-register test (FR-QG-24) is missing until US-QS-11 exists. The job does not run for changes that touch neither the UI nor the e2e package nor the gate files.
