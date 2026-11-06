---
id: PRIN-062
title: Every GET route stays within its load budget at 1,000 specimens (report)
maturity: checked
spec: [NFR-12, FR-QG-09]
---

## Why it is better

A route that is fast on a demo can be slow with a real collection. Measuring every GET route at a realistic size shows which one is getting slow before users notice.

## How it is measured

Median and 95th-percentile latency and body size per GET route at 1,000 specimens, against `perf` in `app/config/gates/quality-limits.json` (default: median 50 ms, p95 75 ms, body 250 kB; some routes have their own budget). A route past its budget is reported. Target: every route within its budget; the switch to blocking is an owner decision (`perf.blocking` is `false` since 2026-11-05).

## Checked by

`app/packages/api/perf/load/measure.ts`, `app/packages/api/perf/load/budget-report.ts`, `app/config/gates/quality-limits.json`.

## Evidence

Run nightly by the job `perf` in `.github/workflows/nightly.yml` (`make perf-nightly`), with a concurrency probe; the summary goes to the job summary. A broken measurement (a route that does not answer 200, or no rows) turns the job red, because the report must not hide missing numbers (P-10). The budget values come from one CI run (assumption, see the comment in the file).
