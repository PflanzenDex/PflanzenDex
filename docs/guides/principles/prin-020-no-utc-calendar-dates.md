---
id: PRIN-020
title: Calendar dates are never cut from a UTC timestamp
maturity: gated
spec: [NFR-08, QG-D4]
---

## Why it is better

Cutting the calendar day from `toISOString()` yields the UTC day, which is wrong around midnight for every user east or west of UTC. The rule keeps dates in the user's time zone (prototype bug B-01).

## How it is measured

Number of `toISOString().slice(0, 10)` (and the same with `substring` or `substr` and the arguments 0 and 10) in the code. Target: 0. The rule is an ESLint error with a message that names the local-date helpers.

## Checked by

`app/eslint.config.js` (rule `noUtcDateSlice`, a `no-restricted-syntax` selector).

## Gate

`make gates` (step `npm run lint`), repeated in `make ci`; in CI the job `app-gates` of `.github/workflows/ci.yml` runs it (`make ci-gates`) and `ci-status` requires it.

## Evidence

No own test of the selector. It catches the literal pattern only; another UTC derivation (for example date arithmetic on UTC fields) is not detected. The working rules for dates are in `.agents/skills/date-and-timezone/SKILL.md`.
