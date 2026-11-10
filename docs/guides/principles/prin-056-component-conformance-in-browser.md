---
id: PRIN-056
title: Every component story passes axe, touch-target, focus and overlay checks in a real browser
maturity: gated
spec: [QG-U5, FR-QG-09, US-QS-07]
---

## Why it is better

jsdom cannot measure contrast, focus rings, target sizes or overlay behaviour. A real browser run on every story catches what unit tests cannot.

## How it is measured

Findings per story, light and dark at 360 px: axe violations of serious or critical impact, touch targets below 44 px (DS-15), no visible focus indicator on Tab (DS-37), overlays that do not close with Esc or do not return focus (DS-40). Target: 0 findings; the allowlist `app/config/gates/conformance-allowlist.json` is empty.

## Checked by

`app/tools/check/code/conformance/check-conformance.mjs`, `app/tools/check/code/conformance/conformance-rules.mjs`, `app/tools/check/code/conformance/conformance-probes.mjs`, `app/config/gates/conformance-allowlist.json`.

## Gate

`make ci-ui` in the CI job `app-ui` of `.github/workflows/ci.yml`, which runs `npm run conformance:blocking`; `ci-status` requires the job. The local target `make conformance` runs the same checks in report mode.

## Evidence

Tests in `app/tools/check/code/conformance/check-conformance.test.mjs` and the self-test `app/tools/check/code/conformance/check-conformance.selftest.mjs`. Needs Chromium (`make browsers`). It checks the story catalog, not the pages; the pages are PRIN-057.
