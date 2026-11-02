# Issue 1136: Lighthouse baseline for the QG-U1 limits

Date: 2026-11-02. Requirement: FR-QG-09, gate QG-U1. Measured on the CI runner (`ubuntu-24.04`), the reference environment, before any limit existed (P-08).

## Method

`make lighthouse` builds the web app, serves it with `vite preview` and runs Lighthouse 13.5.0 three times in mobile emulation on the start page (signed out): simulated throttling, 150 ms RTT, 1638 kbit/s, 4x CPU slowdown, device profile moto g power (2022). One sample is the median of those three runs. These are emulated values, not measurements on a real phone.

Samples:

- run 41506580023 (dispatch on branch `fix/qg-17-one-screen-gate-measures`, dev plus #1188), one sample;
- run 41536111267 (dispatch on the never-merged branch `exp/issue-1136-lighthouse-samples`, dev at 74f9ae1e): the `lighthouse` job as a matrix of five independent jobs, five samples. The rest of that run was cancelled.

## Results

| Sample          | Performance | Accessibility | Best practices | SEO | LCP    | TBT  | CLS   |
| --------------- | ----------- | ------------- | -------------- | --- | ------ | ---- | ----- |
| 41506580023     | 93          | 100           | 96             | 82  | 2.75 s | 0 ms | 0.000 |
| 41536111267 / 1 | 93          | 100           | 96             | 82  | 2.74 s | 0 ms | 0.000 |
| 41536111267 / 2 | 93          | 100           | 96             | 82  | 2.75 s | 3 ms | 0.000 |
| 41536111267 / 3 | 93          | 100           | 96             | 82  | 2.75 s | 1 ms | 0.000 |
| 41536111267 / 4 | 93          | 100           | 96             | 82  | 2.79 s | 4 ms | 0.000 |
| 41536111267 / 5 | 93          | 100           | 96             | 82  | 2.75 s | 3 ms | 0.000 |

The scores did not move at all, LCP moved by 0.05 s, TBT by 4 ms. The `lighthouse` job took 121 s.

## Limits (owner decision 2026-11-02, starting values)

In `app/config/gates/quality-limits.json` (`lighthouse`): performance ≥ 88, accessibility ≥ 95, best practices ≥ 90, SEO ≥ 80; LCP ≤ 3.3 s (about 20 % over the measurement); TBT ≤ 200 ms and CLS ≤ 0.1 (the "good" limits of web.dev). The scores carry 2 to 5 points of slack. The check prints a hint when a value beats its limit by 5 score points or stays under half of a metric limit, so the limits can be tightened later.

## Not covered

Only the signed-out start page is measured; signed-in views need the API and a seeded account (out of scope of issue 1136). SEO is 82; its failing audits were not analysed here.
