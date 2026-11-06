---
id: PRIN-027
title: Modules import only through their public interface and along the dependency matrix
maturity: gated
spec: [FR-QG-19, E-20, AB-7]
---

## Why it is better

A modulith stays a modulith only while modules touch each other through a small, declared surface. Cycles and hidden edges make a later split or change expensive.

## How it is measured

Number of violations of AB-7 (import of a module's internal file), AB-8 (edge not in the dependency matrix, or a cycle), AB-9 (SQL on a foreign table), AB-10 (foreign key across modules), AB-11 (kernel imports a domain module), AB-12 (coupling upwards), AB-13 (register inconsistent, port without contract test), AB-14 (migration without module). Each message names the rule, the file and the edge. Target: 0.

## Checked by

`app/tools/check/code/check-boundaries.mjs`, `app/tools/check/code/modules/check-modules.mjs`, `app/tools/check/code/modules/rules/check-modules-graph.mjs`, `app/tools/check/code/modules/rules/check-modules-sql.mjs`, `app/tools/check/code/modules/rules/check-modules-contracts.mjs`, `app/tools/check/code/modules/rules/check-layer-rules.mjs`; the register is `app/config/lint/modules.config.mjs`.

## Gate

`make gates` (step `npm run boundaries`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

Tests in `app/tools/check/code/check-boundaries.test.mjs`, `app/tools/check/code/modules/check-modules.test.mjs`, `app/tools/check/code/modules/rules/check-modules-graph.test.mjs` and `app/tools/check/code/modules/rules/check-layer-rules.test.mjs`. The rules run for every module folder that exists. The SQL check (AB-9) is heuristic, as FR-QG-19 says. Per-module coverage is a report, without thresholds.
