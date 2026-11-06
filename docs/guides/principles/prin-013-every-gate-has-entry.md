---
id: PRIN-013
title: Every gate of the repository has an entry in the principles register
maturity: measurable
spec: [US-QG-06, FR-DEV-04]
---

## Why it is better

A gate without an entry is invisible: nobody can say which rule it enforces, whether it blocks a merge or only reports, or whether it still earns its place. US-QG-06 requires one entry per rule that a gate checks.

## How it is measured

Count of gates without an entry. The gates are the scripts of the `gates` step in `app/package.json`, the jobs that `ci-status` requires in `.github/workflows/ci.yml`, and the report jobs of the nightly and scheduled workflows. An entry names a gate when its "Checked by" or "Gate" section names the script, job or make target. Target: 0.

## Evidence

Not checked by a script yet. At the time of writing, a search by hand found every step of the `gates` script named by an entry (the layout step through its make target), every job that `ci-status` requires named (except the plumbing jobs `changes` and `reuse`), and every nightly job named. A script that compares the lists would move this entry to `checked` (owner decision, see the State of implementation in `docs/specs/product/18-architecture-and-quality-gates.md`).
