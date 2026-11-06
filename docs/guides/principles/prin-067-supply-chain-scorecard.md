---
id: PRIN-067
title: The repository's supply-chain hygiene is measured by OpenSSF Scorecard (report)
maturity: checked
spec: [US-QG-06, QG-S2]
---

## Why it is better

Branch protection, pinned actions and token permissions decide how easily the repository can be changed by someone who should not. An external scorecard measures these without the project writing its own rules for them.

## How it is measured

Scorecard results per check (branch protection, pinned dependencies, token permissions and others) under Security, Code scanning. No threshold: the scorecard is a report, as US-QG-06 requires for a new gate.

## Checked by

`.github/workflows/scorecard.yml` (OpenSSF Scorecard action, results as SARIF).

## Evidence

Runs on pushes to `main`, weekly and by hand. Not part of `ci-status`, and no threshold has been set; a threshold would need a measured baseline first.
