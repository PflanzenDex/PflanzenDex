---
id: PRIN-046
title: Merges into dev and main need a pull request and a green ci-status
maturity: gated
spec: [FR-QG-02, US-QG-02]
---

## Why it is better

A single required check makes "green" mean one thing for every merge, and it cannot be skipped by a direct push or a force push.

## How it is measured

Number of pushes or merges into `dev` or `main` that skip the required check or the pull request (target 0). Read with `gh api repos/PflanzenDex/PflanzenDex/rulesets` on 2026-11-06, the rulesets `dev-protection` and `main-protection` are active and contain `required_status_checks` with the context `ci-status`.

## Checked by

`.github/workflows/ci.yml` (job `ci-status`), `.github/rulesets/dev-protection.json`, `.github/rulesets/main-protection.json`.

## Gate

The ruleset files `.github/rulesets/dev-protection.json` and `.github/rulesets/main-protection.json`, applied with `tools/repo/rulesets-apply.sh`; the required check is the job `ci-status` in `.github/workflows/ci.yml`.

## Evidence

The rulesets are versioned; no CI job compares the live rulesets with the files. The review rules are in `.github/rulesets/dev-review.json` (no approval on `dev`, ADR 0005) and `.github/rulesets/main-review.json` (one approval). `ci-status` counts a skipped job as green, so a job that does not run for a pull request does not block it; the path filter in `changes` decides which jobs run.
