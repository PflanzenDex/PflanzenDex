---
id: PRIN-011
title: The file layout is checked and the baseline only shrinks
maturity: gated
spec: [FR-QG-21, FR-QG-22, US-QG-09]
---

## Why it is better

A directory with few entries and a predictable name can be read at a glance, and a rule that a script checks does not rot. The baseline lets the gate run from day one without blocking work on old disorder.

## How it is measured

`make layout` counts units per directory (files with the same stem count once) and reports violations of LY-1 to LY-5; the target is an empty `app/layout-baseline.json`. Limits: 5 units per directory, 10 feature directories per module (starting values, assumption).

## Checked by

`app/tools/check/code/layout/check-layout.mjs`, `app/tools/check/code/layout/layout-rules.mjs`, `app/tools/check/code/layout/layout-baseline.mjs` and their tests `app/tools/check/code/layout/check-layout.test.mjs`, `app/tools/check/code/layout/layout-rules.test.mjs`, `app/tools/check/code/layout/layout-baseline.test.mjs`; configuration `app/layout.config.mjs`.

## Gate

`make layout` (part of `make gates`, repeated in `make ci`), which the CI job `app` in `.github/workflows/ci.yml` runs and `ci-status` requires.

## Evidence

One test per rule and a test that the repo passes with its baseline (US-QG-09). Limits: the module-root rule and the "touch-it" rule of FR-QG-22 are not implemented yet; the baseline starts with about 100 directories and shrinks with the migration (FR-QG-23).
