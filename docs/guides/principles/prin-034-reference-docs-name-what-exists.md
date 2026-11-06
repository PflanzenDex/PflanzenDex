---
id: PRIN-034
title: The reference docs name every API route, core operation and shared component
maturity: gated
spec: [FR-QG-25, US-QG-10]
---

## Why it is better

An agent or a developer that does not find an existing route, operation or component builds it again. Naming them in the reference docs makes the existing building blocks findable.

## How it is measured

RF-1: API routes not named as `METHOD /path` in `docs/guides/reference/app.md`. RF-2: core operations not named as `domain.verb` there. RF-3: components of `app/packages/web/src/shared/ui`, `app/packages/web/src/shared/patterns` and `app/packages/web/src/app/frame` not named in `docs/guides/reference/design-system.md`. RF-4 and RF-5: baseline entries that are stale or that the baseline on dev does not have. The baseline `app/config/gates/baselines/reference-baseline.json` lists 109 routes, 69 operations and 0 components today; the list only shrinks. Target: 0 findings outside it.

## Checked by

`app/tools/check/docs/agents/check-reference.mjs`, `app/tools/check/docs/agents/api-routes.mjs`, `app/tools/check/docs/agents/reference-sources.mjs`.

## Gate

`make gates` (step `npm run reference`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`); a pull request that changes only documentation runs it in the job `docs-gates` (`make ci-docs`) instead, and `ci-status` requires both. Locally: `make reference-check`.

## Evidence

Tests in `app/tools/check/docs/agents/check-reference.test.mjs`. The check looks for the name, not for the quality of the description; that is a review question.
