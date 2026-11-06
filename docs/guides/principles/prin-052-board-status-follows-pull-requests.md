---
id: PRIN-052
title: The project status of a story follows its pull requests
maturity: checked
spec: [US-DEV-05]
---

## Why it is better

A board that shows a story as open after it was merged, or as done before the release, makes the team plan on wrong facts.

## How it is measured

Number of stories whose project status disagrees with their pull requests (merged into `dev` but not `On dev`, released but not `Done`, closed without merge but still `In Progress`). Target: 0. `make status-check` exits with 1 on drift.

## Checked by

`app/tools/workflow/actions/project-status/project-status.mjs`, `.github/workflows/project-status.yml` (sets the status from pull request events).

## Evidence

Tests in `app/tools/workflow/actions/project-status/project-status.test.mjs`. The drift check is run by hand; the workflow sets the status from events, and a failure of that workflow does not block a merge.
