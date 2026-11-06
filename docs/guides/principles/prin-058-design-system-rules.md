---
id: PRIN-058
title: The UI follows the design-system rules, known deviations only shrink
maturity: gated
spec: [FR-QG-20, QG-U4, FR-QG-17]
---

## Why it is better

One set of UI rules keeps the screens consistent and accessible. A deviation that is allowed to stay is listed, so it is visible and only gets smaller.

## How it is measured

Violations of the design-system rules (IDs DS-nn in `docs/guides/reference/design-system.md`) in `app/packages/web`, per rule and file. Target: 0 new violations; the baseline `app/config/gates/baselines/quality-ds-baseline.json` has 0 entries today, and native form controls outside `app/packages/web/src/shared/ui` (DS-48) are a hard error that is never baselined.

## Checked by

`app/tools/check/code/design-system/check-design-system.mjs`, `app/tools/check/code/design-system/check-design-system-rules.mjs`, `app/tools/check/code/design-system/check-design-system-ast.mjs`, `app/tools/check/code/design-system/check-design-system-css.mjs`, `app/tools/check/code/design-system/check-design-system-imports.mjs`.

## Gate

`make gates` (step `npm run design-system`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests in `app/tools/check/code/design-system/check-design-system.test.mjs`. The rules are only as complete as their implementation; a rule without a check stays a convention.
