---
id: PRIN-012
title: The principles register is valid in its fields, maturity levels and references
maturity: gated
spec: [US-QG-06, FR-DEV-04]
---

## Why it is better

An entry with a missing field, an unknown maturity or a reference to a script or make target that does not exist misleads everyone who relies on the register. A validator keeps the register usable as the single list of rules.

## How it is measured

Number of problems the validator reports: rule PRIN-1 (frontmatter and maturity), PRIN-2 (unique id, file name starts with the id), PRIN-3 (sections required for the maturity level), PRIN-4 (paths and make targets in "Checked by" and "Gate" exist), PRIN-5 (a gated entry still carries `blocking_from`), PRIN-6 (`blocking_from` is not a date, or its day has come while the entry is not gated), PRIN-7 (a `Caught:` line is malformed, outside Evidence or dated after today). Target: 0.

## Checked by

`app/tools/check/docs/check-principles.mjs`, tests in `app/tools/check/docs/check-principles.test.mjs`.

## Gate

`make gates` (step `npm run principles`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`); a pull request that changes only documentation runs it in the job `docs-gates` (`make ci-docs`) instead, and `ci-status` requires both.

## Evidence

The validator checks format and references, not the truth of a maturity claim: whether a named job really blocks the merge is a review question. Completeness (every gate has an entry) is not checked by a script; see PRIN-013. The validator checks the form of a `Caught:` line, not that the failure was real: that is the PR's statement, and the quarterly review (`make principles-review`) only lists the entries without one.
