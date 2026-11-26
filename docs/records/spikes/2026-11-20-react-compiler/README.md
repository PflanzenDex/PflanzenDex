# React Compiler trial: what it compiles, what it costs, what it touches (US-QS-14)

As of: 2026-11-20 · Issue 2300 · Story: US-QS-14 (calm and fast-feeling interface) · Evaluation only (owner decision 2026-11-19: evaluate, do not enable). Nothing in `dev` changes except this record. The trial code lives on the unmerged branch [`spike/react-compiler-2300`](https://github.com/PflanzenDex/PflanzenDex/tree/spike/react-compiler-2300) (heads `71697975` round 1, `df43b86e` round 2, `fccc0635` round 3 with the build toggle and the phone runner) and is never merged.

## Summary

- **As shipped, the compiler breaks the app.** Version 1.0.0 hoists the lazy `useState` initializer of `lazyPage` to module scope, where the closure variable it reads does not exist. Every lazy route then throws `ReferenceError: component is not defined` on mount: 390 of 4672 web tests in 33 of 363 files fail.
- **With one opt-out it works in the tests.** `"use no memo"` on the `Page` component of `lazyPage` (and on one test harness) makes all 4672 tests pass. The suite then fails only on the coverage thresholds, because the compiled memo code adds statements and branches (statements 95.97 % → 90.40 %, branches 91.00 % → 82.08 %).
- **It costs JS and build time.** Initial JS +4.5 % gzip (134,743 → 140,830 bytes), which is 830 bytes over the blocking budget of 140,000. Lazy route chunks +52 % own gzip. `npm run build` 0.50 s → 6.18 s (median of 3, about 12 times slower).
- **It would replace most manual memoization.** 1,162 functions compile; 36 functions bail out (85 of 104 events are "refs read during render"). 151 of the 176 `useMemo`/`useCallback` call sites sit in compiled functions.
- **Enabling it for real touches gate files:** `app/config/gates/quality-limits.json` (budget), `app/config/gates/coverage-thresholds.json` (coverage), `app/eslint.config.js` (compiler lint rules, 146 findings in 55 files). That makes it an owner-merge pull request.
- **On the phone it gains nothing measurable.** INP with and without the compiler differs by at most one 8 ms step on every interaction. React render time changes by −5.6 to +1.6 ms, inside the spread. A cold start transfers 19 % more JS.
- **Recommendation: do not enable. Revisit with a later compiler release.** See the last section.

## Machine and versions

| Item         | Value                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------- |
| Machine      | Mac Mini devbox (arm64, 16 GB, shared with Colima), macOS, Node v26.13.1, npm 11.20.0       |
| Base         | `origin/dev` at `66a9e30c`                                                                  |
| App          | React 19.3.1, Vite 8.3.8, `@vitejs/plugin-react` 6.3.0                                      |
| Compiler     | `babel-plugin-react-compiler` 1.0.0 (2025-10-07, latest stable; no later stable release)    |
| Babel bridge | `@rolldown/plugin-babel` 0.3.0 (2026-10-29), `@babel/core` 7.29.13 (already in the tree)    |
| Lint trial   | `eslint-plugin-react-hooks` 7.1.1 (2026-04-17), `recommended-latest`, separate trial config |

`@vitejs/plugin-react` 6 has no `babel` option any more. The compiler runs through `@rolldown/plugin-babel` with the preset the React plugin exports:

```ts
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
// plugins: [react(), babel({ presets: [reactCompilerPreset({ panicThreshold: "none", logger })] }), ...]
```

`panicThreshold: "none"` (the default) skips a function the compiler cannot handle instead of failing the build. The logger wrote one line per compile event (`CompileSuccess`, `CompileError`, `CompileSkip`, `PipelineError`) for the counts below. The plugin also applies to the Vitest transform, so the tests ran on compiled code. The experimental Rust port (`react({ compiler: true })`) was not evaluated.

## Part 1: build, tests, gates

All heavy runs held the machine-wide heavy lock. Raw outputs stayed in the session scratchpad; the numbers here are copied from them.

### Build time

`rm -rf dist && npm run build` in `app/packages/web`, the command `make ci-ui` uses. Three runs each.

| Measure         | Without compiler               | With compiler                    |
| --------------- | ------------------------------ | -------------------------------- |
| Wall time, s    | 0.89, 0.50, 0.50 (median 0.50) | 6.32, 6.18, 6.09 (median 6.18)   |
| Vite "built in" | 319, 291, 295 ms (median 295)  | 5.95, 5.95, 5.87 s (median 5.95) |

The first run without the compiler was cold. The cost per CI run is about 6 s per web build (the build runs in `ci-ui` and in the Lighthouse and UI-gate jobs); the web test run took 58.6 s with the compiler against 55 s without, plus the transform in every Vitest worker.

### JS size

Initial JS is the entry plus its modulepreloads and static imports, the definition of the blocking budget (`bundle.initialJsGzipBytes` = 140,000 in `app/config/gates/quality-limits.json`); gzip at level 9.

| Chunk                   | Without, raw / gzip bytes | With (round 2), raw / gzip bytes |
| ----------------------- | ------------------------: | -------------------------------: |
| `index-*.js`            |         370,218 / 116,994 |                387,794 / 123,081 |
| `oidc-client-ts-*.js`   |           68,836 / 17,318 |                  68,836 / 17,318 |
| `rolldown-runtime-*.js` |                 726 / 431 |                        726 / 431 |
| **Initial JS**          |     **439,780 / 134,743** |            **457,356 / 140,830** |

Round 2 numbers for `index-*.js` are the round 1 numbers less the 39 gzip bytes the opt-out saved; the per-chunk split of round 2 was not recorded separately. `npm run bundle-budget` with the compiler: exit 1, "initial JS is 140.8 kB gzip, allowed 140.0 kB (over by 0.8 kB)". Without it: 134,743 bytes by the same definition (the budget script itself was not rerun on that build).

Lazy routes (63 dynamic entries of the Vite manifest, round 1 build):

| Measure                                  |          Without |             With |          Change |
| ---------------------------------------- | ---------------: | ---------------: | --------------: |
| Own gzip of the 63 lazy chunks, sum      |          239,098 |          363,461 |         +52.0 % |
| All non-initial JS files (157), gzip sum |          442,619 |          612,707 |         +38.4 % |
| `collection-page`: own / needed gzip     | 15,289 / 124,596 | 27,492 / 157,461 | +80 % / +26.4 % |
| `light-page`: own / needed gzip          |   7,315 / 98,821 | 12,053 / 116,069 | +65 % / +17.5 % |
| `measure-page`: own / needed gzip        |  5,756 / 109,401 |  9,191 / 132,848 | +60 % / +21.4 % |
| `match`: own / needed gzip               |  5,637 / 121,631 |  8,998 / 145,457 | +60 % / +19.6 % |
| `equipment-page`: own / needed gzip      | 14,743 / 152,492 | 24,883 / 187,114 | +69 % / +22.7 % |

"Needed" is the chunk plus every chunk of its static import closure that the first load does not already hold. The growth is the memo cache code the compiler emits (`_c(n)` slots and the comparisons around them).

### What it compiles and skips

- Compiled: 1,162 functions (40 anonymous) in 533 files.
- Not compiled: 104 `CompileError` events on 36 functions in 31 files. No `PipelineError`; one `CompileSkip` (the opt-out).

| Reason (compiler text, first sentence)                                          | Events | Example                                                                        |
| ------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------------------ |
| Cannot access refs during render                                                |     85 | `shared/ui/overlays/sheet/sheet-panel/sheet-panel.tsx`, `use-layer.ts`         |
| This value cannot be modified (props, hook args, state)                         |     11 | `plant-forms/address/use-form-address.ts`, `layer-sheet.guard.tsx`             |
| Unsupported syntax (`??=`, getter, `import()`, `try` forms, optional in a test) |      6 | `transition-router.tsx`, `use-request.ts`, `announcer.tsx`, `friends-news.tsx` |
| Cannot access variable before it is declared                                    |      1 | `app/flows/add-plant/wish-to-specimen.ts`                                      |
| First argument must be an inline function expression                            |      1 | `account/session/session.ts`                                                   |

Most skips are in the sheet, layer and form primitives that read refs during render on purpose (measuring, focus return). Those primitives sit under many views, so the compiled children still re-render when they do.

### The bug that breaks lazy routes

`lazyPage` (`app/packages/web/src/shared/platform/routing/lazy-page/lazy-page.ts`, used by 61 routes) keeps the loaded component in a `let` of the enclosing function and reads it in `useState(() => component)` inside the nested `Page` component. The compiler treats `Page` as a component and moves the initializer to a module-level `_temp()` function, where `component` is not in scope. The same transform breaks a callback in `preload.test.ts`. Reproduced with `@babel/core` and the plugin alone. In the browser: not verified, but the tests show the page never mounts. Not yet reported upstream.

### Manual memoization

A Babel parse of the 750 non-test, non-story TS/TSX files of `app/packages/web/src`: 176 call sites in 116 files (137 `useCallback`, 22 `useMemo`, 11 `React.useCallback`, 6 `React.useMemo`; no `React.memo`). 151 sites in 106 files sit inside a compiled function, the upper bound of what would become redundant (heuristic by enclosing function; the compiler keeps manual memos it cannot prove equal). 25 sit in skipped functions or non-components.

### Lint rules

`eslint-plugin-react-hooks` 7.1.1, `recommended-latest` (17 rules incl. the compiler-backed ones), over `app/packages/web/src` (1,169 files incl. tests and stories), from a trial config outside the gate config. The root ESLint config loads no react-hooks rules today.

| Rule                              | Findings |                                     Files |
| --------------------------------- | -------: | ----------------------------------------: |
| `react-hooks/refs`                |       95 |                                        24 |
| `react-hooks/immutability`        |       23 |                                         9 |
| `react-hooks/set-state-in-effect` |       10 |                                        10 |
| `react-hooks/globals`             |        7 |                                         5 |
| `react-hooks/exhaustive-deps`     |        6 |                                         6 |
| `react-hooks/rules-of-hooks`      |        4 |                                         4 |
| `react-hooks/use-memo`            |        1 |                                         1 |
| Ten other rules                   |        0 |                                         0 |
| **Total**                         |  **146** | **55** (122 product, 19 tests, 5 stories) |

The lint rules did not flag the `lazyPage` pattern that the compiler miscompiles.

### Tests and gates on the trial branch

| Check                                           | Without compiler         | Round 1 (`71697975`)               | Round 2 (`df43b86e`, opt-out)               |
| ----------------------------------------------- | ------------------------ | ---------------------------------- | ------------------------------------------- |
| `make heavy-lock ci-tests-web`                  | exit 0; 4672/4672 tests  | exit 2; 390 tests in 33 files fail | exit 2; 4672/4672 pass, coverage gate fails |
| Web coverage, statements / branches / functions | 95.97 / 91.00 / 94.98 %  | not judged (tests failed first)    | 90.40 / 82.08 / 93.46 % (gate 95 / 86 / 94) |
| `npm run bundle-budget`                         | under (134,743 computed) | exit 1, over by 869 bytes          | exit 1, over by 830 bytes                   |
| `FRESH=1 make gates`                            | not run (dev green)      | exit 0, 24 steps                   | exit 0, 24 steps                            |
| e2e, one-screen, a11y-routes, ds-snapshots      | not run                  | not run                            | not run                                     |

The coverage drop is a measurement effect: the statement and branch denominators grow about 2.5 and 3.2 times with the compiled code, and no test was removed. It was not checked line by line. To pass the gates `make gates` in the trial needed the logger kept under the complexity limit and the trial lint config kept out of the repository; no gate file was changed.

### Files a real enablement touches

Decided by `isGateFile` in `.claude/hooks/rules.mjs`.

| File                                                                  | Gate file | Why                                                                  |
| --------------------------------------------------------------------- | --------- | -------------------------------------------------------------------- |
| `app/packages/web/vite.config.ts`                                     | no        | compiler wiring; also the Vitest transform                           |
| `app/packages/web/package.json`, `app/package-lock.json`              | no        | three pinned devDependencies                                         |
| `app/packages/web/src/shared/platform/routing/lazy-page/lazy-page.ts` | no        | the opt-out (or a rewrite that keeps the component out of a closure) |
| `app/config/gates/quality-limits.json`                                | yes       | initial JS budget, over by 830 bytes                                 |
| `app/config/gates/coverage-thresholds.json`                           | yes       | web coverage under the thresholds on compiled code                   |
| `app/eslint.config.js`                                                | yes       | the react-hooks compiler rules (146 findings to fix first)           |
| `app/config/lint/knip.json`                                           | yes       | only if knip must learn about the lint plugin                        |
| `app/packages/web/.storybook/main.ts`                                 | no        | Storybook inherits the Vite plugins (not tested)                     |
| `app/packages/web/src/**` (116 files with memo calls)                 | no        | optional removal of redundant memos, later                           |

## Part 2: phone

Method: exactly that of the record [2026-11-20-real-phone-performance](../2026-11-20-real-phone-performance/README.md) (issue 2299): its `scripts/measure/run.mjs` with raw CDP, taps through `Input.dispatchTouchEvent`, Event Timing for INP, the React DevTools hook for commits and `actualDuration`, the same five interactions and the same cold starts. Pitfall PF-040 applies: every series set the CDP online emulation and checked `navigator.onLine === true`.

| Item     | Value                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phone    | OnePlus 9 Pro (LE2123), dark mode, Chrome 156 (reduced user agent; the full build was not read), viewport 360 × 695 CSS px at DPR 3, no network, USB                                                                                             |
| Builds   | Trial commit `fccc0635`. A = `PDX_REACT_COMPILER=0` (no compiler), B = compiler on. Profiling pair: the record's `vite-profiling.config.mjs`, without and with the compiler. Every series checked that the served entry chunk was its own build. |
| Back end | API and PostgreSQL of the trial worktree, shared Keycloak, demo seed `DEMO_SEED_PROFILE=states`, account `test2`. `vite preview` of one build at a time. `adb reverse` and `adb forward`.                                                        |
| Runs     | One warm-up, then 7 runs per interaction (production), 5 per interaction (profiling), 5 per cold start. Dark mode only; warm starts and light mode not run. The heavy lock was held for the session.                                             |

**Load.** The 1-minute load before the runs: production A interactions 1.46–1.99, production B interactions 2.00–3.97, profiling A 1.65–4.24, profiling B 1.44–2.28, starts A 1.67–2.02, starts B 1.51–2.26. The record's rule asks for a repeat below 1.5 when the load looks like it skewed a series. No series was repeated. B mostly ran at a higher load than A, which can only make B look worse. The recommendation does not depend on this: even read in B's favour, no gain shows. **Discarded:** two earlier sessions, in which a `vite preview` that kept the port served build A for the series meant as B (seen in the preview logs and caught by the entry-chunk check). Only their A series were valid, and they were measured again.

### Interactions

Medians in ms, INP = the latency of the longest Event Timing entry of the interaction. Event Timing rounds to 8 ms, so a difference below 16 ms is within the rounding.

| Interaction   | Production INP A (7) | Production INP B (7) | Δ ms (% of A) | Profiling INP A → B (5) | React render A ms | React render B ms | Δ render ms (% of A INP) |
| ------------- | -------------------: | -------------------: | ------------: | ----------------------: | ----------------: | ----------------: | -----------------------: |
| plant-layer   |          96 (88–112) |         104 (88–112) |   +8 (+8.3 %) |               104 → 104 |  29.0 (26.2–36.1) |  30.6 (28.2–34.7) |            +1.6 (+1.5 %) |
| view-switch   |          96 (88–112) |          88 (88–112) |   −8 (−8.3 %) |                 96 → 88 |  21.2 (17.5–23.4) |  18.3 (12.7–21.5) |            −2.9 (−3.0 %) |
| page-next     |          96 (88–104) |          96 (88–112) |     0 (0.0 %) |                 96 → 96 |  18.3 (16.4–25.6) |   12.7 (8.2–19.5) |            −5.6 (−5.8 %) |
| news-layer    |          96 (88–120) |         104 (96–112) |   +8 (+8.3 %) |                88 → 104 |  27.2 (24.1–36.7) |  26.2 (23.4–34.2) |            −1.0 (−1.1 %) |
| watering-done |        128 (112–144) |        120 (104–136) |   −8 (−6.3 %) |               128 → 120 |  21.6 (18.2–26.2) |  18.3 (11.4–26.9) |            −3.3 (−2.6 %) |

- The production INP differences are one rounding step or none, in both directions. Input delay, processing and presentation delay each moved by at most 3 ms.
- The one profiling difference of 16 ms (news-layer) is at the rounding limit; the same interaction in production differs by 8 ms.
- React render times overlap between A and B in every row. The largest gain (page-next, −5.6 ms) is 5.8 % of its INP and lies inside both spreads.
- The number of React commits to the final state is the same with and without the compiler (3 to 7, depending on the interaction). No long animation frame of 50 ms or more overlapped an interaction (0 in 120 runs).

### Cold starts

| Route (cold)  | LCP A → B ms                  | Data ready A → B ms           | React commits A → B | JS transferred kB A → B |   JS decoded kB A → B |
| ------------- | ----------------------------- | ----------------------------- | ------------------: | ----------------------: | --------------------: |
| `/today`      | 672 (652–756) → 752 (720–784) | 628 (590–702) → 673 (663–710) |             29 → 29 |       486 → 579 (+19 %) | 1,265 → 1,498 (+18 %) |
| `/collection` | 732 (704–752) → 720 (708–996) | 686 (639–695) → 674 (629–945) |             19 → 18 |       486 → 579 (+19 %) | 1,265 → 1,498 (+18 %) |

The extra JS is real and the same on every route: a start loads the first load plus the idle preload of the destinations (137 files), all of which grow. The `/today` difference (+80 ms LCP, +45 ms data ready) comes from a series at a higher load and is not separated from it. `/collection` is within the spread. Over USB the 93 kB more cost little; on a mobile network they cost their transfer time, which this setup cannot measure.

### Phone afterwards

`adb reverse --list` and `adb forward --list` empty, `cmd uimode night` → "Night mode: yes", "stay awake" left as found (setting 3). Chrome zoom was not changed during the session and was not read again afterwards. The trial worktree's database container was left running (no `make stop` or `db-down`).

## Recommendation

**Do not enable the React Compiler now. Revisit it with a later stable compiler release**, or when React rendering becomes a measured share of a slow interaction.

- **Gain:** none measurable on the phone. React renders 18 to 30 ms of 96 to 128 ms INP, and the compiler changed that by −5.6 to +1.6 ms, inside the spread and below the 8 ms resolution of INP. #2299 already showed every interaction "good" (≤ 200 ms) without it.
- **Cost:** a miscompiled pattern that breaks all 61 lazy routes until opted out, and the lint rules do not catch it; +6.1 kB gzip on the first load, which breaks the blocking budget by 830 bytes; +52 % lazy chunk gzip and +19 % JS per cold start; the web build about 12 times slower (0.5 s → 6.2 s); a coverage drop under the thresholds from the compiled code. Three gate files would change (budget, coverage, ESLint), so enabling it is an owner-merge pull request that loosens two limits.
- **What would change the answer:** a compiler release that compiles `lazyPage` correctly and emits less cache code, and an interaction where React render time is a large, measured part of an INP near the limit. A revisit repeats this record's steps on the trial branch: build-only first (tests, budget, coverage), the phone only if those pass.
- **Useful without the compiler:** the 36 functions it skips mostly read refs during render on purpose (measuring, focus return). That is no defect today; the list is in Part 1 in case the lint rules are adopted on their own.
