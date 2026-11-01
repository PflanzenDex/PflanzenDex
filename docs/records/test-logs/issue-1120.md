# Issue 1120: faster CI tests and conformance run

As of: 2026-11-01 · Issue #1120 (Enabler, QG) · Story US-QG-02 · Follows the CI split of #1118 (PR #1119).

Measurements only. No gate file changes in this PR. The prototypes live on the branch
`chore/issue-1120-ci-experiments`, which is never merged. CI was dispatched on that branch (`workflow_dispatch`, e2e and
Lighthouse switched off).

## Summary

| Job                       | Before (run 41325451537) | 4 pages (run 41338477376) | 8 pages (runs 41338943307 / 41339307793) |
| ------------------------- | ------------------------ | ------------------------- | ---------------------------------------- |
| app-ui                    | 6:06                     | 3:19                      | 2:30 / 2:47                              |
| app-tests (api, core, db) | 5:56 (with web)          | 2:17                      | 2:45 / 2:56                              |
| app-tests-web (new, Q7)   | –                        | 2:22                      | 3:43 / 3:37                              |
| ds-snapshots              | ~3:40                    | 1:47                      | 1:48 / 1:57                              |
| app-gates                 | 1:50                     | 1:49                      | 1:35 / 1:56                              |
| **slowest job**           | **6:06**                 | **3:19**                  | **3:43 / 3:37**                          |

The starting value (assumption) was "slowest job under 4 min". All three runs with every prototype meet it. Same code,
different runner: the web suite took 123 s in one run and 197 s in the next. With 8 pages, app-ui is no longer the
slowest job; the web suite is, and it sets the wall time.

Four changes give the saving:

1. **Conformance on N pages (Q1)**, with a focus settle that makes the results reproducible. It saves 150–190 s.
2. **node_modules cache (Q6)**. It saves 30–50 s per job.
3. **ds-snapshots: one catalog per process and 4 workers (Q2)**. It saves ~70 s.
4. **Web tests as their own job (Q7)**. It saves ~120 s in app-tests.

Running the vitest workspaces in parallel inside one job (Q3), happy-dom (Q4) and one database per worker (Q5) do not
pay off. Details follow.

## Setup

- **CI:** GitHub-hosted `ubuntu-24.04` runner, 4 vCPU.
- **Local:** 12 logical cores. Most local runs are pinned to 4 cores with `taskset -c 0-3`, to model the runner. Q3
  shows where that model fails: Postgres (a Docker container) and the faster local cores are not pinned.
- **Before:** the run named in the issue, 41325451537 (dev after #1119).

## Q1: conformance with N parallel pages

Prototype: `CONFORMANCE_PAGES=N` starts N browser contexts. They share one queue of (story, scheme) jobs. The results
keep the order of the queue, so the report reads the same. A raw dump per story (targets, axe rule ids with node
counts, focus styles, overlay results) was compared across runs.

Local, 4 cores, 184 stories × 2 schemes, seconds for the stories (catalog build 11.5–13 s on top):

| Pages         | Without focus settle | Findings | With focus settle | Findings |
| ------------- | -------------------- | -------- | ----------------- | -------- |
| 1             | 362                  | 0        | 445               | 0        |
| 2             | 172                  | 0        | –                 | –        |
| 4             | 91                   | 0        | 112               | 0        |
| 8             | 71                   | **2**    | 75                | 0        |
| 12 (12 cores) | 48                   | **2**    | 54                | 0        |

CI: 4 pages with settle 128 s (run 1), 150 s (run 2) and 128 s (run 3); 8 pages 94 s (run 4) and 102 s (run 5). The sequential run took
~290 s before. The self-test of the run (two fixture stories) still catches the 36 px target and the unlabeled input
at 4 and 8 pages.

**Results are not identical without a fix, and they were not identical before either.** The DS-37 probe takes the
"before" style right after a `blur()` and the "after" style right after each Tab, without waiting for the focus ring
transition. Without the settle, 12 to 17 of 368 raw records differed between the 1-, 2- and 4-page runs, and 79 to 91
at 8 and 12 pages. The sequential baseline is just as racy. It catches whichever frame of the ring transition is
current. At 8 and 12 pages the race turned into a false finding: `ui-checkbox--focus` (light and dark), "shows no focus
indicator on Tab (DS-37)".

**Fix (prototype):** run the existing QG-U9 `settleStyles` after the blur and after each Tab. With it, **all 368 raw
records are identical** for 1, 4, 8 and 12 pages, and there are no findings. The QG-U9 wait before axe is untouched.
It still runs before every axe call, and no run threw "animation(s) still running". The settle costs +23 %
sequentially (362 → 445 s), but parallel pages more than pay for it.

**Answer:** use 8 pages plus the focus settle (on CI 94–102 s instead of ~290 s). The settle belongs in the gate anyway,
because the DS-37 probe is racy today.

## Q2: do conformance and ds-snapshots build Storybook twice?

Yes, and more than twice. Every `buildCatalog` call is a full Storybook build of 9–13 s:

- **app-ui:** 2 builds, one for the real run and one for the self-test with fixtures.
- **ds-snapshots:** 6 builds, one for the real check and one per `runCatalog` call in the self-test (5 calls). The
  self-test's 4 px case changes story args in the URL, so it needs no new build.

Breakdown of ds-snapshots-check before, 164 s on CI: 10 s build, 34 s image pull, 59 s for 92 screenshots on 1 worker,
61 s self-test (5 builds plus 5 container starts).

Prototype: `DS_REUSE_CATALOG=1` builds each catalog (with or without fixtures) once per process, which makes 2 builds
instead of 6. `DS_WORKERS=4` runs Playwright with 4 workers and `fullyParallel`.

| ds-snapshots-check | Before | Reuse + 4 workers      |
| ------------------ | ------ | ---------------------- |
| Local (12 cores)   | 164 s  | 60 s                   |
| CI                 | 164 s  | 92 s, 92 s, 85 s, 88 s |

All 92 baselines still match with 4 workers. The self-test still passes: two runs give identical pictures, and the
4 px padding change fails and writes a diff image. On CI, 92 screenshots take 20–24 s instead of 59 s. The image pull
(27–34 s) remains.

**Not measured:** one shared build across the two jobs. It needs an artifact upload and download plus a dependency
between the jobs, so the job that builds would start the other one late. With the per-process reuse each job builds
once (≈10 s), which leaves little to gain.

## Q3: vitest workspaces in parallel

Local, 4 cores, with coverage:

| Package | Alone (sequential) | All four at once |
| ------- | ------------------ | ---------------- |
| api     | 58 s               | 112 s            |
| core    | 10 s               | 16 s             |
| db      | 72 s               | 150 s            |
| web     | 126 s              | 147 s            |
| Wall    | 266 s              | 151 s            |

CI (two runs), all four at once: **wall 303 s and 291 s**. Sequential took 269 s before, so parallel is slower on the
runner. It also failed both times under load:

- `api src/catalog/load/cli.test.ts` "US-BES-12 … Given PFLANZENDEX_ENV=prod, when the dev seed runs" (new to the flaky
  list).
- `web src/shell/app/app.test.tsx` "US-ACC-01 App > signed in: the navigation switches between all views" (known flaky).

The runner has 4 vCPU, and each vitest run already fills them. The local 4-core pin misses this, because Postgres runs
outside the pin.

Coverage and the ratchet: each package still writes its own `coverage/coverage-summary.json`, so the ratchet would stay
correct. It did not run here, because the test step failed first.

**Answer:** no. Splitting the work over jobs (Q7) beats splitting it inside one job.

## Q4: happy-dom, or `environment` per file

`environment` is already set per file: 192 of 226 web test files declare `// @vitest-environment jsdom`, and only 1 of
those 192 uses no DOM API at all. The default is `node`.

Local, 4 cores, web without coverage:

| Variant                            | Duration             | Result                     |
| ---------------------------------- | -------------------- | -------------------------- |
| jsdom, forks (today)               | 105 s                | all pass                   |
| jsdom, `--pool=threads`            | 102 s                | all pass                   |
| jsdom, threads, with coverage      | 119 s (forks: 126 s) | all pass                   |
| happy-dom 21.0.4 for all 192 files | 182 s                | 100 tests in 25 files fail |
| jsdom, `--no-isolate`              | 124 s                | 142 tests in 41 files fail |

**Answer:** no. happy-dom fails and is slower, mostly waiting into timeouts. Reusing the environment across files leaks
state. The threads pool saves about 5 %, too little to justify a pool change.

## Q5: is Postgres the bottleneck?

The db suite runs its files one after another (`fileParallelism: false`): 45 s before on CI, 36 s in run 3, 72 s
locally on 4 cores.

| db variant (local, 4 cores, no coverage)                                           | Duration | Result                                               |
| ---------------------------------------------------------------------------------- | -------- | ---------------------------------------------------- |
| files in parallel, shared database                                                 | 49 s     | 2 files fail (account counts, superuser table owner) |
| files in parallel, one owner database per worker (prototype: `_w<VITEST_POOL_ID>`) | 72 s     | 7 files fail with hook timeouts                      |

The failing files work across the whole cluster: roles, scratch databases, superuser-owned tables and the realistic
migration. Each worker database also has to be migrated first, so the variant gains nothing.

**Answer:** not at the moment. Once web runs in its own job, the db suite costs 36–45 s inside app-tests, which is not
on the critical path. Per-worker databases would need the cluster-level files moved into their own serial group first.

## Q6: cache `node_modules`

`make setup` runs `npm ci`: 35–57 s per job (959 packages, `node_modules` 861 MB). Prototype: `actions/cache@v6` on
`app/node_modules` and `app/packages/*/node_modules` (without `.cache`). The key is `.nvmrc` plus
`app/package-lock.json`. On a hit, only the `check-deps --stamp` step runs.

| Per job                | Before  | Cache hit                |
| ---------------------- | ------- | ------------------------ |
| `make setup` / restore | 35–57 s | 3–10 s (archive ~180 MB) |

The first run after a lockfile change misses and installs as today. The cache is keyed on the lockfile, so a change
that adds a package never sees stale modules. `setup-node`'s `cache: npm` still restores 191 MB on a hit. It is only
needed on a miss, so 3–5 s more could be saved.

**Answer:** yes, it saves 30–50 s in each of the five jobs that install dependencies.

## Q7: split further

Only the web suite needs it. In one job, app-tests ran web after api, core and db (155 s of 278 s). As its own job, web
took 123 s and 197 s (runner variance). app-tests without web took 107 s and 137 s.

The coverage ratchet then needs the web summary from the other job, for example as an artifact passed to a final step,
or the ratchet runs per job on its own packages.

## Flaky tests seen

- Only under the parallel-workspace load (Q3): `api src/catalog/load/cli.test.ts` (US-BES-12) and
  `web src/shell/app/app.test.tsx` "navigation switches between all views".
- Local, my own prototype: the db branch coverage fell to 89.91 % (< 90 %), because the per-worker prototype added an
  untested branch. Reverted. It is not a finding on `dev`.
- In every other run, all tests passed (api 92 files, core 156, db 69, web 227).

## Proposed follow-ups (each a gate PR, the owner merges)

| #   | Change                                                                                                 | Expected saving (measured)                        |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 1   | Conformance: settle styles around the DS-37 probe, plus N pages (`CONFORMANCE_PAGES`, default 8 in CI) | app-ui −150 to −190 s; reproducible DS-37 results |
| 2   | `node_modules` cache keyed on the lockfile in every job that runs `make setup`                         | −30 to −50 s per job                              |
| 3   | ds-snapshots: build each catalog once per process, 4 Playwright workers                                | ds-snapshots −70 s                                |
| 4   | Web tests as their own job (app-tests-web), coverage ratchet over both                                 | app-tests −120 s                                  |

Not worth doing: vitest workspaces in parallel inside one job, happy-dom, `--no-isolate`, one database per worker
(today).
