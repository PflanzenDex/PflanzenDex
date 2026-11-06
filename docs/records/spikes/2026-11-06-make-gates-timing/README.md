# Measured `make gates` against its 60 s budget (US-QG-01)

As of: 2026-11-06 · Issue 1386 · Spec: US-QG-01 (budget marked "assumption") · Measurement only. No gate, script, Makefile, config, hook, threshold or budget was changed, and the spec text stays as it is.

## Summary

- **The budget does not hold.** `make gates` took 127.7 s and 128.0 s in two warm runs and 134.2 s in a cold one, against the 60 s budget. All three full runs and all 26 units exited 0.
- **Six steps take 89 % of the time:** `typecheck` 27.4 s, `lint` 24.6 s, `baseline` 24.2 s, `format-check` 18.2 s, `constants` 12.2 s and `ui-text` 7.1 s (means of two passes, 113.6 s of 127.8 s). `baseline`, `constants` and `ui-text` each run ESLint a second time.
- **CI repeats every step** of the chain. The CI job runs `make ci-gates`, which runs the same `npm run gates`. Only the local dependency check `check-deps` is not repeated.
- **No run was measured under load.** The 1-minute load stayed below 4 in every run (highest sampled value 3.48).
- **Recommendation for the owner, not decided here:** move `baseline`, `constants` and `ui-text` out of the pre-push part (saves 43.5 s), and set the budget in the spec with a reason. See the sections "Options" and "Recommendation".

## Machine

| Item          | Value                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| CPU           | AMD Ryzen 5 3600, 6 cores, 12 threads                                                                                        |
| Memory        | 15933 MB RAM and 15932 MB swap (`free -m`). Swap in use before the runs: 3254 to 3396 MB, from other sessions.               |
| OS and kernel | Linux 7.3.0-4-cachyos                                                                                                        |
| Node and npm  | v26.13.0 and 11.20.0                                                                                                         |
| Shared        | Yes. Other Claude sessions use the same machine, so load and memory were sampled during each run. Storage type not recorded. |

## Commit

The measured tree is `01a0d265`. The branch tip `bac56258` is the claim commit on top of it and adds no changes. The commit that adds this record changes only this file.

## Method

1. `make setup` in the new worktree, under the shared heavy lock. Not timed.
2. Three full runs of `make gates` from the worktree root. Each run was wrapped in `flock` on the shared heavy lock, and the timer started only after the lock was held.
3. Per step: two passes over the 26 units of the chain, each pass under the lock, in chain order. Each unit runs the command the chain runs: `make secrets` runs `tools/lint/gitleaks.sh` and `make workflows` runs `tools/lint/actionlint.sh` (both from the repo root); `make gates` runs `node tools/check/supply/check-deps.mjs` in `app/`; `npm run gates` runs its 23 scripts in `app/` as `npm run <script>`.
4. Load and memory: `uptime` and `free -m` before and after every run. During each run the 1-minute load and the available memory were sampled every 3 s. The table shows the maximum sampled load. A run counts as "under load" when that maximum is above about 4.
5. Cache state before each run: number of `*.tsbuildinfo` files, whether gitleaks is in `.cache/tools`, and the size of `app/node_modules/.cache`.
6. The timing script is a scratch file outside the repo. The repo received nothing for the measurement.

Make's own overhead was not timed separately. The sum of the 26 units (127.75 s mean) and the full runs (127.7 s to 128.0 s warm) differ by at most 0.3 s. Assumption: make adds negligible time.

## Cache state

- **Full-1 was cold for the tool cache.** `.cache/tools` was empty in the new worktree, so the `secrets` step downloaded gitleaks 8.30.1 during that run. The download was not timed separately. Full-1 took 6 s longer than full-2 and full-3. Assumption: the download is the main reason.
- **Full-2, full-3 and both step passes were warm.** The gitleaks tool was in `.cache/tools`, and the OS page cache held the packages that `make setup` had just written.
- **ESLint and tsc reuse nothing.** `npm run lint` (`eslint .`) has no cache option, and `tsc --noEmit` runs without `incremental`. No `.tsbuildinfo` file exists. These two steps do full work in every run, warm or cold.

## Runs

| Run                | Cache at start                        | Wall s | Exit      | Load 1 min, before to after | Max sampled load | Min MemAvailable MB | Load mark |
| ------------------ | ------------------------------------- | -----: | --------- | --------------------------- | ---------------: | ------------------: | --------- |
| full-1             | cold tool cache (gitleaks downloaded) | 134.18 | 0         | 3.36 to 2.55                |             3.36 |                6814 | clean     |
| full-2             | warm                                  | 127.97 | 0         | 2.21 to 2.46                |             3.48 |                8455 | clean     |
| full-3             | warm                                  | 127.72 | 0         | 3.38 to 1.95                |             3.46 |                8297 | clean     |
| steps-1 (26 units) | warm                                  | 127.12 | 0 for all | per unit, see below         |             2.32 |                8556 | clean     |
| steps-2 (26 units) | warm                                  | 128.39 | 0 for all | per unit, see below         |             2.78 |                8369 | clean     |

"Clean" means the maximum sampled 1-minute load stayed below 4, so no run is marked as measured under load. The load before full-1 (3.36) and full-3 (3.38) was already high because of other sessions. The step-pass wall time is the sum of the 26 unit times. Per-unit load before and after is in the raw data.

## Steps (two passes each, chain order)

| Step              | Command                                        |   Pass 1 s |   Pass 2 s |     Mean s |  Share |
| ----------------- | ---------------------------------------------- | ---------: | ---------: | ---------: | -----: |
| secrets           | `tools/lint/gitleaks.sh` (repo root)           |       1.76 |       1.90 |       1.83 |  1.4 % |
| workflows         | `tools/lint/actionlint.sh` (repo root, Docker) |       0.46 |       0.71 |       0.58 |  0.5 % |
| check-deps        | `node tools/check/supply/check-deps.mjs`       |       0.05 |       0.04 |       0.04 |  0.0 % |
| lint              | `npm run lint`                                 |      23.99 |      25.11 |      24.55 | 19.2 % |
| typecheck         | `npm run typecheck`                            |      27.16 |      27.67 |      27.41 | 21.5 % |
| boundaries        | `npm run boundaries`                           |       0.82 |       0.83 |       0.82 |  0.6 % |
| layout            | `npm run layout`                               |       0.24 |       0.20 |       0.22 |  0.2 % |
| db-indexes        | `npm run db-indexes`                           |       0.15 |       0.17 |       0.16 |  0.1 % |
| migration-numbers | `npm run migration-numbers`                    |       0.16 |       0.14 |       0.15 |  0.1 % |
| baseline          | `npm run baseline`                             |      24.44 |      23.87 |      24.16 | 18.9 % |
| design-system     | `npm run design-system`                        |       0.97 |       0.72 |       0.84 |  0.7 % |
| ui-text           | `npm run ui-text`                              |       7.27 |       6.93 |       7.10 |  5.6 % |
| constants         | `npm run constants`                            |      12.10 |      12.33 |      12.21 |  9.6 % |
| stories           | `npm run stories`                              |       0.14 |       0.16 |       0.15 |  0.1 % |
| knip              | `npm run knip`                                 |       2.22 |       2.51 |       2.37 |  1.9 % |
| specs             | `npm run specs`                                |       0.38 |       0.37 |       0.38 |  0.3 % |
| spec-numbers      | `npm run spec-numbers`                         |       0.40 |       0.35 |       0.38 |  0.3 % |
| dod-numbers       | `npm run dod-numbers`                          |       0.15 |       0.15 |       0.15 |  0.1 % |
| principles        | `npm run principles`                           |       0.16 |       0.18 |       0.17 |  0.1 % |
| skills            | `npm run skills`                               |       0.19 |       0.16 |       0.17 |  0.1 % |
| reference         | `npm run reference`                            |       0.64 |       0.74 |       0.69 |  0.5 % |
| duplicates        | `npm run duplicates`                           |       1.15 |       1.03 |       1.09 |  0.9 % |
| dup               | `npm run dup`                                  |       0.51 |       0.49 |       0.50 |  0.4 % |
| format-check      | `npm run format:check`                         |      18.09 |      18.21 |      18.15 | 14.2 % |
| ci-drift          | `npm run ci-drift`                             |       0.17 |       0.14 |       0.16 |  0.1 % |
| docs              | `npm run docs`                                 |       3.35 |       3.28 |       3.31 |  2.6 % |
| **Sum**           |                                                | **127.12** | **128.39** | **127.75** |  100 % |

## Does the 60 s budget hold?

No. The full runs took 127.7 s to 128.0 s warm and 134.2 s cold. That is 2.1 to 2.2 times the 60 s budget, or about 68 s over in the warm case. All steps exit 0, so the time comes from the gates running normally, not from a failure. The budget is marked "(assumption)" in US-QG-01, so changing it is the owner's decision.

## Steps that take most of the time

| Step         | Mean s |  Share | What it does                                                                                                          |
| ------------ | -----: | -----: | --------------------------------------------------------------------------------------------------------------------- |
| typecheck    |   27.4 | 21.5 % | `tsc --noEmit -p .` in five workspaces (api, core, db, e2e, web), no incremental build                                |
| lint         |   24.6 | 19.2 % | `eslint .` over the repo                                                                                              |
| baseline     |   24.2 | 18.9 % | Code-metric ratchet (FR-QG-17). Its header says it runs ESLint again with the metric rules and `QUALITY_BASELINE=off` |
| format-check |   18.2 | 14.2 % | `prettier --check .` over the repo                                                                                    |
| constants    |   12.2 |  9.6 % | Runs ESLint a second time, filtered to the constants rules                                                            |
| ui-text      |    7.1 |  5.6 % | Runs ESLint a second time, filtered to `ui-text/no-literal-text`                                                      |

These six steps sum to 113.6 s, which is 88.9 % of the 127.75 s total. The other 20 units take 14.2 s together; the largest of them is `docs` at 3.3 s.

The headers of `baseline`, `constants` and `ui-text` refer to rules in `eslint.config.js`, which `lint` already runs. Their second ESLint pass may therefore be redundant with `lint`. Assumption, not measured: merging them into `lint` could save part of the 43.5 s. That would need a change to gate code.

## Which steps CI repeats

`.github/workflows/ci.yml` line 118 runs `make ci-gates`. That target runs `secrets`, `workflows` and `npm run ci:gates` (which is `npm run gates`). CI therefore repeats every step measured here except `check-deps`, which only checks the local `node_modules` against the lock file. Tests and the UI build run in separate CI jobs and were not measured here.

The spec's table in `docs/specs/product/18-architecture-and-quality-gates.md` marks rows QG-C2 to QG-C5 (lint with Prettier, types, structure, boundaries) as "pre-push + CI". The `baseline` script (FR-QG-17) is not named there. QG-C4 mentions a baseline ratchet for the layout check, which is a different check.

## Options from the issue

**Option 1: move slow gates to CI.** The steps leave the pre-push part and stay in CI. Savings from the measured means:

| Variant | Steps moved out of pre-push        | Time saved | Pre-push left (computed) | Spec impact                                                 |
| ------- | ---------------------------------- | ---------: | -----------------------: | ----------------------------------------------------------- |
| 1a      | `baseline`, `constants`, `ui-text` |     43.5 s |               about 84 s | None: none of them is named in the QG-C2 to QG-C5 rows      |
| 1b      | 1a plus `typecheck`                |     70.9 s |               about 57 s | QG-C3 says "pre-push + CI": the spec changes in the same PR |
| 1c      | 1b plus `lint` and `format-check`  |    113.6 s |               about 14 s | QG-C2 and QG-C3 change                                      |

**Option 2: change the budget in the spec, with a reason.** Saves 0 s of runtime; the pre-push time stays as measured. To fit the measured runs the budget would have to be at least 135 s (cold run, 134.2 s) or about 130 s (warm).

The "pre-push left" values are computed by subtracting the measured means. They were not measured as runs.

## Recommendation

Recommendation, for the owner to decide: take variant 1a. Move `baseline`, `constants` and `ui-text` out of the pre-push part. CI keeps running them, so no check is lost, and no spec row changes. Variant 1a alone still leaves about 84 s, above 60 s, so the budget in the spec needs a change with a reason as well. A starting value of about 100 s for that budget is an assumption, not measured. Variant 1b would reach about 57 s, but it changes the QG-C3 row, which only the owner can decide.

## Limits

- One workstation, shared with other sessions. Their load and memory use are part of the numbers, but the loads stayed below the threshold of 4. Warm full runs agree within 0.3 s.
- Three full runs (two warm, one cold) and two passes per step.
- Not measured: CI wall time (the issue quotes 136 s for one CI run of `make ci-gates`; not checked here), disk speed, and the pre-push hook run during the push, which runs the same chain once more and is not part of this table.
- The raw per-unit timings and logs stay outside the repo.

## Result after the change (issue 1471)

The owner chose neither option above: the gates now run in parallel, at most four at a time, and `baseline`, `constants` and `ui-text` read one shared ESLint pass. No step left pre-push, and CI runs the same checks.

| Run | Runner s | `make gates` wall s | Exit | 1-minute load at start |
| --- | -------: | ------------------: | ---- | ---------------------: |
| 1   |     31.0 |        not recorded | 0    |                   6.58 |
| 2   |     28.9 |        not recorded | 0    |                   5.83 |
| 3   |     29.8 |        not recorded | 0    |                   7.28 |
| 4   |     30.0 |                32.6 | 0    |                   6.30 |

- **The 60 s budget holds:** 32.6 s for a full `make gates`, so the budget stays as it is. Runs 1 to 3 lost their wall time to a broken timing script; the runner's own time excludes `secrets`, `workflows` and `check-deps`, about 2.5 s.
- **These runs were under load,** above the threshold of about 4 in this record, on the same machine. A quiet machine was not measured.
- **The longest steps now set the time:** in run 3 `typecheck` took 29.8 s, `lint` 27.9 s, `format-check` 23.3 s and the shared ESLint pass 15.3 s.
- **`lint` keeps its own ESLint run.** It runs with the baseline allowances on, so ESLint runs twice instead of four times.
