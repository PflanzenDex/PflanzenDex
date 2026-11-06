---
id: PRIN-033
title: Spec references resolve and the status counters match the stories
maturity: gated
spec: [FR-QG-03, QG-U2]
---

## Why it is better

A reference to a story that does not exist, or a counter that disagrees with the story headings, sends the reader and the agent to the wrong place. The counters are derived from the specs, so they cannot drift silently.

## How it is measured

Number of references to `US-`, `FR-`, `DM-`, `NFR-` and `E-` IDs in `docs/specs/product/*.md` that have no definition (the dropped epic MIG stays reserved), and number of differences between the status table in `docs/specs/product/readme.md` and the story and requirement headings. Target: 0 for both.

## Checked by

`app/tools/check/docs/specs/check-spec-refs.mjs`, `app/tools/dev/agent/spec-status.mjs`.

## Gate

`make gates` (step `npm run specs`, which runs `spec-status.mjs --check`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it. Locally: `make spec-check`.

## Evidence

Tests in `app/tools/check/docs/specs/check-spec-refs.test.mjs` and `app/tools/dev/agent/spec-status.test.mjs`. The labels P-, AB-, QG-, DS- and TE- are not checked, as the script says.
