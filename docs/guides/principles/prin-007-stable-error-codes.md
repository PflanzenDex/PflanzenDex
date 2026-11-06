---
id: PRIN-007
title: Errors carry stable codes of the form domain.reason
maturity: gated
spec: [FR-QG-11]
---

## Why it is better

Clients and tests rely on codes, not on texts. A renamed or removed code breaks them silently.

## How it is measured

Tests check every code of `ERROR_TEXTS`: the format `<domain>.<reason>` and a non-empty user text, and the sorted list of codes in `error.codes.json`, which must equal the codes of `ERROR_TEXTS` in both directions. A renamed or removed code fails and is named in the message; a new code fails until it is added to the list. Target: 0 failures.

## Checked by

`app/packages/core/src/kernel/error.ts` (definition), `app/packages/core/src/kernel/error.test.ts` (format test and the two list tests), `app/packages/core/src/kernel/error.codes.json` (the sorted list of all codes).

## Gate

`make ci` runs the core tests in `app/packages/core/src/kernel/error.test.ts` (step `npm run ci:tests`); in CI the job `app-tests` of `.github/workflows/ci.yml` runs them and `ci-status` requires it.

## Evidence

The gap is closed. `error.codes.json` lists every code, sorted. The two tests named "FR-QG-11" in `error.test.ts` compare it with `ERROR_TEXTS`: "every code listed in error.codes.json still exists in ERROR_TEXTS" fails on a renamed or removed code and names it; "every code in ERROR_TEXTS is listed in error.codes.json" fails on a new code until it is added. Proof on the branch of this change: a temporary rename of `wish.not_found` in `error-texts/wun.ts` failed the first test with "Error code(s) wish.not_found are listed in error.codes.json but missing in ERROR_TEXTS", and a temporary dummy code failed the second test; both edits were reverted before the commit. Honest limit: the list is a snapshot, so one deliberate change of the text and the list in the same pull request passes; the reviewer checks that in the diff of `error.codes.json`. The check has no escape hatch.
