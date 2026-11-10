---
id: PRIN-051
title: Every issue carries exactly one type label and one epic label
maturity: checked
spec: [FR-DEV-10, US-DEV-05]
---

## Why it is better

The board, the epics and the release plan are built from these labels. An issue without them is invisible in every view.

## How it is measured

Number of open issues without exactly one type label and exactly one epic label, both from `app/config/project/issue-taxonomy.json`. Target: 0. Such an issue gets the label `needs-triage` and a comment.

## Checked by

`app/tools/workflow/actions/issue/issue-cli.mjs`, `.github/workflows/issue-check.yml`, `app/config/project/issue-taxonomy.json`.

## Evidence

Tests in `app/tools/workflow/actions/issue/issue.test.mjs` and `app/tools/workflow/actions/issue/issue-lib.test.mjs`. The check runs when an issue is opened, edited or labelled; `make claim` refuses an issue without the labels, which is a gate for starting work, not for merging.
