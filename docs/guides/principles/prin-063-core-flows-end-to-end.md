---
id: PRIN-063
title: Core flows work end to end on mobile and desktop before a release
maturity: gated
spec: [QG-T3, FR-QG-08, QG-U1]
---

## Why it is better

Unit tests do not prove that the pages, the API and the database work together. Before a release one browser run through the core flows does.

## How it is measured

Number of failing Playwright tests in the mobile and desktop projects. Target: 0. The axe checks in these tests fail on serious and critical findings.

## Checked by

`app/packages/e2e/playwright.config.ts`, `app/packages/e2e/tests/care-phases.spec.ts`, `app/packages/e2e/tests/light.spec.ts`, `app/packages/e2e/tests/measure.spec.ts`, `app/packages/e2e/tests/sign-in.spec.ts`.

## Gate

`make e2e` in the CI job `e2e` of `.github/workflows/ci.yml`, which runs for pull requests into `main` and by hand; `ci-status` requires the job. On pull requests into `dev` the job is skipped.

## Evidence

The nightly job `e2e` runs the same target on `dev`; its failure opens an issue through the job `report` and does not block a merge. The flows of FR-QG-08 are not all covered yet (FR-QG-08 is still open).
