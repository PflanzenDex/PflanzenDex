---
id: PRIN-001
title: The core imports no I/O, framework or other package
maturity: gated
spec: [AB-1, P-02, FR-QG-05]
---

## Why it is better

One core serves every surface (web, API, AI). If the core could reach the database, network or file system, business rules would become untestable without infrastructure and could differ between surfaces.

## How it is measured

Number of `AB-1` violations reported by the boundary script; the target is 0. Exceptions live in `KNOWN_EXCEPTIONS` with a reason and may only shrink.

## Checked by

`app/tools/check/code/check-boundaries.mjs`, tests in `app/tools/check/code/check-boundaries.test.mjs`.

## Gate

`make gates` (step `npm run boundaries`), repeated in `make ci`, which the CI job `app` in `.github/workflows/ci.yml` runs and `ci-status` requires.

## Evidence

The script reports rule ID and path for each violation (tests `AB-1: ...`). `KNOWN_EXCEPTIONS` is empty today.
