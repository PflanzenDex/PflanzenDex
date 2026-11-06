---
id: PRIN-066
title: The full suite runs nightly on dev and opens an issue when it fails
maturity: checked
spec: [US-DEV-03, FR-DEV-03]
---

## Why it is better

The pull request checks run on the change; the nightly run shows whether `dev` is still green after all merges, which a single pull request cannot show.

## How it is measured

Result of the nightly run on `dev`: `make ci`, `make audit` and `make release-tags-check` must pass. Target: green every night. A failure opens or comments an issue labelled `nightly`.

## Checked by

`.github/workflows/nightly.yml` (job `suite`, and the job `report` that opens the issue).

## Evidence

Each step is the same make target as a blocking check, so the nightly run finds drift, but a failure does not block a merge. As the workflow comment says, scheduled workflows run only from the default branch, so the schedule starts once the file has reached `main`.
