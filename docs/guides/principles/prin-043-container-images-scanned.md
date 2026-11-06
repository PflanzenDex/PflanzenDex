---
id: PRIN-043
title: Container images are scanned for known vulnerabilities (report)
maturity: checked
spec: [NFR-10]
---

## Why it is better

A vulnerable base image reaches production unnoticed unless something scans it. The scan first reports, so that its findings can be read before any threshold is set.

## How it is measured

Findings of Grype per image, in the job summary. No threshold yet: a threshold needs a measured baseline first (the owner decides when). Target for now: every finding is read and either fixed or explained.

## Checked by

`tools/lint/image-scan.sh`, run by `make image-scan`.

## Evidence

The nightly workflow job `image-scan` in `.github/workflows/nightly.yml` runs it; findings never fail the run, but a scan that cannot run turns the job red. The job is not in `ci-status`.
