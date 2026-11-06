# Measurement: pre-commit hook against its 10 s budget (US-DEV-02)

As of: 2026-11-06 · Issue 1398 · Spec US-DEV-02 (`docs/specs/product/19-development-process-and-automation.md`)

## Summary

- **Every measured case is within the 10 s budget.** The slowest run took 2.6 s (40 staged files, 34 of them in the hook's scope). At that case the margin is about 3.8 times.
- **No run was under load.** The 1-minute load average stayed between 0.83 and 1.64. "Under load" means above about 4. At least 8.8 GB of RAM was available in every run.
- **The hook does not check Markdown under `docs/`.** Lint-staged runs in `app/`, and for a staged `docs/` Markdown file it found no matching file. Such a commit costs only the fixed startup of about 0.4 s.
- **ESLint runs without a cache,** so every hook run is cold. In a small commit most of the time is ESLint's configuration load, about 1 s per call.
- **Nothing was changed** in gates, hooks, lint configs, thresholds, the Makefile or the spec. This record is the only added file.

## Machine and versions

| Item | Value |
| --- | --- |
| Machine | Local workstation: AMD Ryzen 5 3600 (6 cores, 12 threads), 15.9 GB RAM, Linux 7.3.0-4-cachyos |
| Commit | 04e0e56c, the claim commit of branch `chore/issue-1398-measure-pre-commit-against`, on top of a0bb22df. This record commit adds no code. |
| Node, npm | v26.13.0, npm 11.20.0 |
| Tools used by the hook | lint-staged 17.6.0, ESLint 10.13.0, Prettier 3.9.10, typescript-eslint 8.72.0 |

## Method

1. The hook `.githooks/pre-commit` runs `need_setup` (checks `app/node_modules` and runs `tools/check/supply/check-deps.mjs`), then `cd app && npx --no-install lint-staged`.
2. The lint-staged configuration in `app/package.json` runs `prettier --write` and `eslint --max-warnings=0 --no-warn-ignored` for `*.{ts,tsx,js,mjs}`, and `prettier --write` for `*.{json,md,css,html,yml,yaml}`.
3. For each case, one temporary comment line was appended to each file (`// ...` for code, an HTML comment for Markdown). The files were staged with `git add`, and `./.githooks/pre-commit` was run from the worktree root. Only this command is timed (`date +%s%N` before and after). The wait for the lock is not timed. Every run was wrapped in `flock` on the shared heavy lock.
4. Three runs per case. The first case is a baseline with nothing staged.
5. After each hook run, the same staged files were checked with the same tools, one step at a time, to see where the time goes. These steps are read-only.
6. After each case, `git restore --staged --worktree` was run on the exact paths. Afterwards no staged or unstaged change remained, and the stash count was unchanged (2 stashes that belong to other work, not touched).
7. Files: one `.ts` (`app/packages/core/src/light/fields.ts`), one `.tsx` (`app/packages/web/src/shared/ui/display/label/label.tsx`), one `.md` under `docs/` (`docs/guides/principles/prin-011-file-layout.md`). The mixed sets were chosen by even spacing from size-filtered lists of tracked files: 10 files (3 core `.ts`, 2 api `.ts`, 3 web `.tsx`, 2 `docs/` `.md`) and 40 files (14 core `.ts`, 6 api `.ts`, 14 web `.tsx`, 6 `docs/` `.md`). Gate files were excluded on purpose (`app/tools/`, `app/config/`, `.githooks/`, `.github/`, lint and Makefile configs). That is why the sets contain no YAML, JSON, CSS or `.mjs` files.
8. Before any edit, every file passed `prettier --check` and `eslint --max-warnings=0` at HEAD. After each hook run, `prettier --check` still passed on the same files. All hook runs exited with 0.
9. ESLint cache: lint-staged calls ESLint without `--cache`, the ESLint configuration sets no cache, and `app/.eslintcache` does not exist (checked before and after). Every run is therefore cold by construction. A warm run cannot be measured without a configuration change, which is out of scope.

## Results: hook runs

"Load" is the 1-minute load average from `uptime` before and after the run. "RAM" is `free -m` before the run (used / available, MiB). ESLint cache was absent in every run. No run was under load.

| Case | Run | Staged (in hook scope) | Exit | Hook time (ms) | Load before -> after | RAM used / available (MiB) |
| --- | --- | --- | --- | --- | --- | --- |
| Nothing staged | 1 | 0 (0) | 0 | 392 | 0.97 -> 0.97 | 6416 / 9516 |
| Nothing staged | 2 | 0 (0) | 0 | 351 | 0.97 -> 0.97 | 6441 / 9491 |
| Nothing staged | 3 | 0 (0) | 0 | 398 | 0.97 -> 0.97 | 6423 / 9510 |
| One Markdown file, `docs/` | 1 | 1 (0) | 0 | 407 | 0.89 -> 0.89 | 6464 / 9468 |
| One Markdown file, `docs/` | 2 | 1 (0) | 0 | 374 | 0.89 -> 0.90 | 6463 / 9469 |
| One Markdown file, `docs/` | 3 | 1 (0) | 0 | 441 | 0.90 -> 0.90 | 6452 / 9480 |
| One `.ts`, `app/packages/core` | 1 | 1 (1) | 0 | 1286 | 0.83 -> 0.83 | 6459 / 9473 |
| One `.ts`, `app/packages/core` | 2 | 1 (1) | 0 | 1492 | 0.92 -> 0.92 | 6563 / 9369 |
| One `.ts`, `app/packages/core` | 3 | 1 (1) | 0 | 1476 | 1.01 -> 1.01 | 6564 / 9368 |
| One `.tsx`, `app/packages/web` | 1 | 1 (1) | 0 | 1489 | 1.33 -> 1.33 | 6511 / 9421 |
| One `.tsx`, `app/packages/web` | 2 | 1 (1) | 0 | 1513 | 1.33 -> 1.46 | 7080 / 8852 |
| One `.tsx`, `app/packages/web` | 3 | 1 (1) | 0 | 1525 | 1.46 -> 1.46 | 6656 / 9276 |
| Mixed, 10 files | 1 | 10 (8) | 0 | 1634 | 1.47 -> 1.43 | 6441 / 9492 |
| Mixed, 10 files | 2 | 10 (8) | 0 | 1991 | 1.43 -> 1.64 | 6559 / 9373 |
| Mixed, 10 files | 3 | 10 (8) | 0 | 1761 | 1.64 -> 1.64 | 6492 / 9440 |
| Mixed, 40 files | 1 | 40 (34) | 0 | 2533 | 1.46 -> 1.42 | 6451 / 9481 |
| Mixed, 40 files | 2 | 40 (34) | 0 | 2596 | 1.39 -> 1.39 | 6503 / 9429 |
| Mixed, 40 files | 3 | 40 (34) | 0 | 2261 | 1.36 -> 1.36 | 6623 / 9310 |

Per case, in ms:

| Case | Staged (in hook scope) | Min | Median | Max | Within 10 s |
| --- | --- | --- | --- | --- | --- |
| Nothing staged (baseline) | 0 (0) | 351 | 392 | 398 | yes |
| One Markdown file, `docs/` | 1 (0) | 374 | 407 | 441 | yes |
| One `.ts`, `app/packages/core` | 1 (1) | 1286 | 1476 | 1492 | yes |
| One `.tsx`, `app/packages/web` | 1 (1) | 1489 | 1513 | 1525 | yes |
| Mixed, 10 files | 10 (8) | 1634 | 1761 | 1991 | yes |
| Mixed, 40 files | 40 (34) | 2261 | 2533 | 2596 | yes |

**Verdict: the 10 s budget holds for every case in every run.** No case is over budget.

## Where the time goes

Median of three runs, in ms. Each step was run separately on the same staged files, after the hook, read-only.

| Step | One `.ts` | One `.tsx` | Mixed, 10 files | Mixed, 40 files |
| --- | --- | --- | --- | --- |
| `check-deps` (`need_setup`) | 36 | 31 | 45 | 38 |
| ESLint configuration load only (`eslint --print-config`) | 1081 | 1055 | 1081 | 1094 |
| Prettier `--check` | 418 | 367 | 476 | 722 |
| ESLint `--max-warnings=0` (includes the configuration load) | 1186 | 1120 | 1267 | 1506 |

These steps were called through `npx`, which adds about 0.3 s per call. Measured: `npx --no-install prettier --version` took 291 to 363 ms, and the binary directly took 63 to 81 ms (three runs each). Each step row therefore overstates its tool by roughly that amount. The hook totals above are the figures that count.

Measured parts of ESLint's configuration load (one process, cumulative imports, two runs): `eslint-plugin-sonarjs` 0.24 to 0.25 s, `typescript` 0.13 to 0.15 s, `typescript-eslint` 0.09 to 0.13 s, `eslint` 0.05 s. The file walk that `eslint.config.js` runs at load (`walkCode("packages")`, 1,951 files, plus the marker check) takes about 0.05 s. The rest of the configuration load was not broken down.

What takes the time:

1. **Fixed cost, about 0.4 s.** With nothing staged the hook takes 351 to 398 ms: starting the processes, `check-deps` (about 40 ms) and lint-staged's own startup.
2. **ESLint, one call per commit, mostly configuration load.** Loading the configuration takes about 1.0 to 1.1 s, and the module imports listed above are the largest part of that. Linting itself is small: the 34 in-scope files of the 40-file case add about 0.4 s on top of the load (1506 minus 1094 ms, medians, both through `npx`).
3. **Prettier, a small startup plus a little per file.** One file takes about 0.37 to 0.42 s through `npx`. The 34 in-scope files take about 0.72 s.
4. **About 30 ms more per additional in-scope file.** This is derived from the medians: (2533 - 1476) / (34 - 1) is about 32 ms per file. It includes lint-staged's git work per run (backup and re-staging), which was not separated out (assumption).
5. **Markdown under `docs/` runs no tools.** The hook spends only its fixed cost.

## Findings (not changed, for the owner)

- **Coverage, not time.** Lint-staged runs in `app/` (`cd app && npx lint-staged`), so a staged file outside `app/` matches no glob. Checked with `lint-staged --debug` on a staged `docs/` Markdown file: the generated task had `fileList: []`, and the hook printed "could not find any staged files matching configured tasks". The same mechanism applies to other paths outside `app/`, such as the repository root and `.github/`. `docs/` Markdown is checked by markdownlint in `make gates` (the `docs` script), not by Prettier. The `format` and `format:check` scripts run Prettier from `app/`. I did not verify whether any other gate runs Prettier on `docs/`.
- **No ESLint cache.** Every commit is a cold ESLint run. A cache would only help the per-file part. The configuration load of about 1 s would remain.
- **Stashes.** Two stashes in the shared repository predate this work and were not touched. Lint-staged writes a backup object during each run ("Backing up original state"). The stash list was unchanged across all runs.

## Not measured, and assumptions

- **Load above 4:** no run reached it, so no run is marked as under load. Times while another heavy job runs (for example `make gates` in another session) are not measured. They would be higher (assumption).
- **Warm ESLint cache:** not measurable with the current configuration (see method, step 9).
- **Commits that make Prettier rewrite files:** not measured. The temporary edits were already Prettier-clean.
- **Cold OS file cache (after a reboot) and other machines:** not measured.
- **Full `git commit` wall time,** including the `commit-msg` hook (commitlint): not measured. The issue asks for the pre-commit hook.
- **About 32 ms per in-scope file:** derived from the medians, not measured per file.
- **The 10 s budget** is itself marked "(assumption)" in US-DEV-02. This record measures against it and does not change it.

## Budget decision and options

No case is over budget. The two options from the issue (fix the slower case, or change the budget with a reason) therefore do not apply. Nothing was fixed or changed.

## Recommendation (for the owner to decide)

Recommendation: keep the 10 s budget unchanged, and decide whether to remove the "(assumption)" marker from its US-DEV-02 text. This measurement supports it on this workstation: the slowest run took 2.6 s, and no run was under load. Repeat the measurement if the hook's scope changes, for example if Markdown under `docs/` is added to it.
