---
id: PRIN-012
title: The principles register is valid in its fields, maturity levels and references
maturity: gated
spec: [US-QG-06, FR-DEV-04]
---

## Why it is better

An entry with a missing field, an unknown maturity or a reference to a script or make target that does not exist misleads everyone who relies on the register. A validator keeps the register usable as the single list of rules.

## How it is measured

Number of problems the validator reports: rule PRIN-1 (frontmatter and maturity), PRIN-2 (unique id, file name starts with the id), PRIN-3 (sections required for the maturity level), PRIN-4 (paths and make targets in "Checked by" and "Gate" exist). Target: 0.

## Checked by

`app/tools/check/docs/check-principles.mjs`, tests in `app/tools/check/docs/check-principles.test.mjs`.

## Gate

`make gates` (step `npm run principles`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

The validator checks format and references, not the truth of a maturity claim: whether a named job really blocks the merge is a review question. Completeness (every gate has an entry) is not checked by a script; see PRIN-013.
