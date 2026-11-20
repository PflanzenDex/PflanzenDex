# Measurement: real-phone performance of Heute, Sammlung and Neu bei Freunden

As of: 2026-11-20 · Issue 2299 · Story US-QS-14 (redesign: the first load stays within the budget of QG-U6; motion and views must not make the app slower) · Measurement only. No app code, gate, config or threshold was changed.

## Summary

- **Every measured interaction is "good" by the published INP limit (≤ 200 ms, web.dev).** Medians of 7 runs in dark mode: open a plant layer 104 ms, switch the Sammlung view 112 ms, next page 112 ms, open "Neu bei Freunden" 104 ms, mark a plant as watered 152 ms. The slowest single run of all 85 measured interactions took 168 ms. Light mode gives the same numbers, within 16 ms.
- **React rendering is not the bottleneck anywhere.** The React render of an interaction takes 25 to 36 ms in total (profiling build, medians), about a quarter of the interaction latency. The rest is Chrome's touch pipeline before the click (about 35 ms, never a long task), style, layout and paint (20 to 30 ms), and the wait for the display (presentation). No frame of 50 ms or more (long animation frame) overlapped any interaction (0 in 85 runs). Even if React's rendering cost nothing, every interaction would still sit at about 70 to 125 ms.
- **The cold start is limited by the network waterfall, not by the CPU.** LCP is 700 to 750 ms on every route (limit for "good": 2.5 s, web.dev), and the data is on screen after 620 to 690 ms. In the first second the main thread is idle more than half the time. There is no long task. React renders for 31 to 57 ms in total up to "data ready", spread over 18 to 37 commits. The data waits for about four sequential network steps: the account, then a chain of JS chunks (about 340 ms), then 11 requests in parallel, then `/onboarding/hints`, and only then `/today`. These are measured over USB on localhost. On a real mobile network each step adds its round trip, which this setup cannot measure.
- **JS:** the first load is 134.7 kB gzip (3 chunks). React DOM alone is 65.4 kB of that, or 48.5 % (bundle report). The goal is 125 kB and the hard limit 140 kB (ADR 0018). After the first load, the idle preload (issue 1645) loads all other destinations: every start, on every route, transfers 107 JS files (462 kB, 1.25 MB decoded) before LCP. Parsing and compiling on the main thread takes only 5 to 8 ms per start (V8 streams and compiles off the main thread). Evaluating the modules takes 14 to 20 ms.
- **Verdict for the follow-up tickets:** a Solid rewrite (#2301) would not fix any measured bottleneck. At most it would remove a part of the 25 to 36 ms of render per interaction and about 60 kB gzip of the first load, while the waterfall and the device pipeline stay. The React Compiler (#2300) can only cut re-render work inside those 25 to 36 ms. Both are low value by these numbers. The cold-start waterfall is the lever that would gain the most (see "Where the time goes").

## Setup

| Item         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone        | OnePlus 9 Pro (LE2123), Android 13 (LE2123_13.1.0.591(EX01)), Chrome 156.0.8078.79, viewport 360 × 700 CSS px at DPR 3, on AC power, battery 100 %, 29.8 to 30.3 °C. Wi-Fi on but not connected, no SIM: the phone has **no network**. Everything ran over USB. About 15 other Chrome tabs were open (from earlier sessions). At the start the phone had 172 MB of free RAM and 1.5 GB of swap in use.                                                |
| Host         | Mac mini (Mac16,10, Apple M4, 10 cores, 16 GB), macOS 15.7.7, Node v26.13.1. Other sessions kept 12 test databases and Keycloak running in Colima, and Claude sessions were active. The 1-minute load average before each run was 1.1 to 3.0 (see "Load").                                                                                                                                                                                            |
| Build        | Commit `c378135f` (branch `chore/issue-2299-measure-real-phone-performance`, the claim commit on top of `66a9e30c` on `dev`). Production build `vite build` with `VITE_API_URL=http://localhost:56008`, served by `vite preview` on port 56508. Profiling build: the same config plus the alias `react-dom/client` → `react-dom/profiling` (`scripts/measure/vite-profiling.config.mjs`); it is 387.8 kB raw instead of 370.3 kB for the entry chunk. |
| Back end     | API of the worktree (`tsx src/main.ts`, `TAXONOMY_BUILD=off`) on port 56008, PostgreSQL 18 of the worktree, shared Keycloak on 18081, demo seed `DEMO_SEED_PROFILE=states`. Account `test2` ("Ben", 51 plants, friends with Clara).                                                                                                                                                                                                                   |
| Reach        | `adb reverse` for 56508, 56008 and 18081, so the phone reaches the same `localhost` origins as e2e. `adb forward tcp:9222 localabstract:chrome_devtools_remote` for raw CDP. Playwright was not used, so the colour scheme was never forced.                                                                                                                                                                                                          |
| Online state | With no network, Chrome reports `navigator.onLine === false` and the app shows its offline notice (US-QS-30). The first series ran that way and were discarded. All reported series set `Network.emulateNetworkConditions` with `offline: false, latency: 0` and 1 GB/s, so Chrome reports online. 1 GB/s is far above the USB link, so this adds no throttle. A value of 1e10 overflows and stalls every request.                                    |

## Method

1. **Driver:** `scripts/measure/run.mjs` talks raw CDP (Node's `WebSocket`) to the foreground Chrome tab on the phone. Before every document it injects `scripts/measure/instrument.js` and web-vitals 5.3.0 (attribution build) through `Page.addScriptToEvaluateOnNewDocument`.
2. **Interactions:** each is a tap through `Input.dispatchTouchEvent` (touchStart, 40 ms hold, touchEnd) at the centre of the real control. Then an in-page `requestAnimationFrame` waiter records when the final state is on screen. Each interaction starts from a fixed state: a plant layer is closed with `history.back()`, the view switch goes back to "Pflanzen" with a tap, the pager with "Zurück", and the watering rows written by the run are deleted in the database before every run. Watering also reloads the layer, so the deleted rows are not cached. One unreported warm-up run (rep 0, first use of the lazy chunks) comes first, then 7 runs (dark) or 5 runs (light, profiling) are measured. The interactions:
   - **plant-layer:** Sammlung → tap the plant row "Birkenfeige". Final state: the layer shows its actions.
   - **view-switch:** Sammlung "Pflanzen" → tap "Arten". Final state: `?view=species` with its rows.
   - **page-next:** Sammlung page 1 → tap "Weiter". Final state: "Seite 2 von …".
   - **news-layer:** Heute → tap the tile "Neu bei Freunden". Final state: the layer with its rows. All 9 lines were already read, so the layer showed "Gerade nichts Neues von Freunden." above the read lines. The unread state was not measured.
   - **watering-done:** the layer "Gießen" → tap "Gegossen" on "Echte Aloe – Zweite". Final state: the row is gone (POST plus refetch).
3. **INP:** an Event Timing observer (`durationThreshold: 16`) groups the entries by `interactionId`. The latency of the interaction is the longest entry (the click), as in INP. It is split as web-vitals does, from that longest entry: input delay (`processingStart − startTime`), processing (`processingEnd − processingStart`) and presentation delay (the rest). The tables come from `scripts/report/summarize.mjs`, which splits this way. The measured run stored a split over the whole group (from `pointerdown`), which counted the 40 ms touch hold as processing; the review found it, `run.mjs` is fixed, and the split in `data/runs.json` was recomputed from the stored event entries. Event Timing rounds durations to 8 ms. With one tap per measurement, this per-interaction latency is the INP the page would report. The injected `webVitals.onINP` reports the worst interaction of the page, including the untimed reset taps, so it was 0 to 40 ms higher. It served as a cross-check only.
4. **Where the time goes:** Long Animation Frame entries (none ≥ 50 ms overlapped an interaction). One Chrome trace per run of a separate traced series (`TRACE=1`, 3 runs per interaction, categories `devtools.timeline`, `v8`, `blink`, `cc`, `input`, …). `scripts/report/analyze-trace.mjs` sums the self time of the renderer main thread inside the click's Event Timing window by category: script (incl. React), GC, style and layout, paint and composite, input handling, task overhead, other, and idle. Tracing adds overhead: the traced runs were 0 to 32 ms slower than the untraced ones. Their split is used, not their totals.
5. **React:** `instrument.js` installs a minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__`, which React calls on every commit, in production builds too. In the profiling build the root fiber carries `actualDuration`, the render time of the committed tree. "React render ms" is the sum of `actualDuration` of the commits between the tap and the final state.
6. **Starts:** `about:blank`, then `Page.navigate` to the route. "Cold" disables the HTTP cache and bypasses the service worker. "Warm" uses both, as a keeper's second visit does. The page is kept 6.5 s after the data is on screen. Recorded: TTFB, FCP and LCP (Performance API, cross-checked with web-vitals: identical in all 30 dark runs), "data ready" (the screen's data rows are visible), the resource timings and the React commits. "TTI estimate" follows Lighthouse (the end of the last long task before 5 s without one, not earlier than FCP or DCL), without the network-quiet condition. Only 4 of all 126 recorded starts (warm-ups and traced runs included) had a long task, one each of 53 to 56 ms and each within 5 s of FCP; all others had none, so the estimate equals FCP and is not informative. The review found that the loop in the measured run did not check the 5 s window; the fixed rule in `scripts/measure/run.mjs` gives the same values for these runs. "Data ready" is the useful number. Before every start a signed-in page is opened (not measured), so the session is alive. Access tokens live 300 s, so a start may include the token renewal that a keeper's start includes too.
7. **Routes:** `/today` (Heute), `/collection` (Sammlung), `/today?sheet=news` (the layer "Neu bei Freunden" on a cold start).
8. **JS per route:** `make bundle-report` for the first load (QG-U6). Resource Timing on the phone for what a start really transfers and decodes.
9. **Colour scheme:** Android's `cmd uimode night yes/no`. Chrome follows it, which was checked via `matchMedia` and the body background. Dark is the main series. Light was repeated for all interactions and starts, because the scheme changes only CSS custom properties and could only differ in paint.

The scripts are in `scripts/` (`measure/` drives the phone, `report/` builds the tables). The per-run numbers, Event Timing entries, React commits and API request timings are in `data/runs.json`. The Chrome traces (348 MB) were not committed.

## Budgets

| Budget                                 | Value                                                                                                 | Source                                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INP "good"                             | ≤ 200 ms                                                                                              | web.dev, "Interaction to Next Paint (INP)", <https://web.dev/articles/inp>                                                                                                             |
| LCP "good"                             | ≤ 2.5 s                                                                                               | web.dev, "Largest Contentful Paint (LCP)", <https://web.dev/articles/lcp>                                                                                                              |
| Final state after a tap                | ≤ 1 s, so the keeper's flow is not broken                                                             | Nielsen, "Response Times: The 3 Important Limits", <https://www.nngroup.com/articles/response-times-3-important-limits/>. Applying it to "final state incl. network" is an assumption. |
| React rendering counts as a bottleneck | when it takes more than half of an interaction's latency, or when it alone would push INP over 200 ms | **assumption** (no published threshold)                                                                                                                                                |
| First-load JS                          | goal 125 kB gzip, hard limit 140 kB                                                                   | ADR 0018, QG-U6 (`app/config/gates/quality-limits.json`)                                                                                                                               |

## Results: interactions

Median (min–max), ms. INP-equivalent = latency of the interaction's longest event entry (8 ms resolution).

**Production build, dark, 7 runs each** (series `prod-dark-int`, load 1.16–1.65):

| Interaction   |           INP | input delay | processing | presentation delay | to final state | API fetches | React commits to final state | first use (warm-up) INP |
| ------------- | ------------: | ----------: | ---------: | -----------------: | -------------: | ----------: | ---------------------------: | ----------------------: |
| plant-layer   |  104 (88–112) |  35 (28–39) |    4 (2–5) |         69 (49–70) |  181 (149–190) |           1 |                            6 |                     112 |
| view-switch   |  112 (88–112) |  38 (33–41) |    4 (4–6) |         67 (48–69) |  155 (142–160) |     2 (2–3) |                            4 |                     104 |
| page-next     |  112 (88–128) |  37 (24–40) |    4 (3–6) |         72 (60–86) |  150 (138–165) |           0 |                            3 |                     104 |
| news-layer    |  104 (88–112) |  37 (27–41) |    4 (2–5) |         67 (50–71) |  171 (148–190) |           0 |                            7 |                     112 |
| watering-done | 152 (144–168) |  55 (36–64) |    9 (8–9) |       100 (79–107) |  302 (270–311) |     4 (4–6) |                            7 |                     152 |

**Production build, light, 5 runs each** (series `prod-light-int`, load 1.26–1.73):

| Interaction   |           INP | input delay | processing | presentation delay | to final state | React commits |
| ------------- | ------------: | ----------: | ---------: | -----------------: | -------------: | ------------: |
| plant-layer   |  120 (96–120) |  34 (32–47) |    4 (4–5) |         69 (59–82) |  188 (148–191) |             6 |
| view-switch   |  104 (88–112) |  36 (28–40) |    5 (4–6) |         65 (56–68) |  160 (151–168) |             4 |
| page-next     | 112 (104–112) |  38 (31–46) |    4 (3–4) |         69 (62–71) |  153 (148–175) |             3 |
| news-layer    |  112 (88–112) |  37 (26–39) |    4 (3–5) |         70 (58–72) |  178 (148–186) |             7 |
| watering-done | 144 (120–160) |  43 (24–51) |    8 (6–9) |        94 (81–100) |  289 (263–302) |             7 |

**Profiling build, dark, 5 runs each** (series `prof-dark-int`, load 1.30–1.67). INP does not change with the profiling build:

| Interaction   |           INP | to final state | React commits | React render, sum to final state | largest single commit |
| ------------- | ------------: | -------------: | ------------: | -------------------------------: | --------------------: |
| plant-layer   |  104 (96–120) |  176 (148–187) |             6 |                 31.2 (22.1–33.2) |      28.5 (19.1–30.1) |
| view-switch   |  112 (96–112) |  152 (136–161) |             4 |                 25.4 (16.7–33.7) |      22.3 (12.9–28.8) |
| page-next     |  104 (88–112) |  164 (159–177) |             3 |                 27.3 (19.3–30.9) |      26.6 (18.2–30.1) |
| news-layer    |  104 (96–112) |  177 (172–185) |             7 |                 35.8 (28.7–42.2) |      31.8 (24.6–34.8) |
| watering-done | 144 (128–168) |  290 (263–295) |           6–7 |                 25.8 (25.0–27.8) |         8.3 (8.1–9.0) |

**Main thread inside the click window, traced series, dark, 3 runs each** (ms, self time; series `prod-dark-trace`):

| Interaction   |        window | script (incl. React) |  GC | style + layout | paint + composite | input handling | task overhead | other |       idle |
| ------------- | ------------: | -------------------: | --: | -------------: | ----------------: | -------------: | ------------: | ----: | ---------: |
| plant-layer   |  121 (89–134) |           41 (33–54) |   0 |     17 (14–19) |         11 (8–12) |              3 |             7 |    10 | 22 (18–40) |
| view-switch   |   99 (88–101) |           33 (31–34) |   2 |     13 (12–19) |          9 (8–12) |              2 |             5 |     8 | 21 (11–30) |
| page-next     |  103 (89–107) |           24 (22–25) |   2 |      10 (8–17) |          9 (8–11) |              2 |             5 |     6 | 38 (29–49) |
| news-layer    | 114 (100–122) |           51 (46–55) |   0 |     19 (14–19) |         11 (8–12) |              3 |             7 |    10 |  13 (7–21) |
| watering-done | 138 (123–183) |           25 (24–45) |   0 |       9 (8–19) |          8 (8–13) |              2 |             7 |    10 | 78 (66–79) |

### Where the time goes, per interaction

The task timeline (`scripts/report/timeline.mjs`) shows the same order in every interaction:

1. Chrome dispatches the `touchend`, runs a frame, and only then turns the tap gesture into `click`. This is the "input delay" of 35 to 55 ms. No long task occurs in it; it is the browser's tap pipeline on this device as driven over CDP. Assumption: a real finger takes the same path, but its hardware timestamps were not measured.
2. The click handler runs in 4 to 9 ms ("processing").
3. React renders in the scheduler's next tasks (`MessagePort`), then style, layout and paint follow, and the frame waits for the display ("presentation delay", 64 to 100 ms).

| Interaction   | INP vs 200 ms | to final state vs 1 s | where the time goes                                                                                                                                                                            | React share       |
| ------------- | ------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| plant-layer   | within (104)  | within (181)          | script 41 (React render about 30; Radix focus scope on mount 9 ms in one trace), style/layout 17, paint 11, tap pipeline about 35. Network: 1 fetch, which completes after the layer is shown. | about 30 %        |
| view-switch   | within (112)  | within (155)          | script 33 (React about 25), style/layout 13, paint 9, tap pipeline about 37, 2 fetches for the species rows                                                                                    | about 23 %        |
| page-next     | within (112)  | within (150)          | script 24 (React about 27 incl. commit), style/layout 10, paint 9, idle 38 waiting for the frame, no network                                                                                   | about 24 %        |
| news-layer    | within (104)  | within (171)          | script 51 (React about 36), style/layout 19, paint 11, no network (the data comes with Heute)                                                                                                  | about 34 %        |
| watering-done | within (152)  | within (302)          | network: POST plus 3 refetches set the final state. Inside the INP window the main thread is idle 78 ms; script 25 (React about 26 over 7 commits, none above 9 ms).                           | about 17 % of INP |

**React rendering is a bottleneck in none of the five interactions.** Its share is 17 to 34 % (assumed limit 50 %). Removing it entirely would leave every interaction between about 70 and 125 ms.

## Results: starts

Median (min–max), ms, 5 runs per cell after one warm-up. "Data ready" = the screen's rows are visible.

**Dark, production build** (series `prod-dark-start`, load 1.49–3.00):

| Route                                | mode |       TTFB |           FCP |           LCP |    data ready |         long tasks | API fetches | React commits to data ready |
| ------------------------------------ | ---- | ---------: | ------------: | ------------: | ------------: | -----------------: | ----------: | --------------------------: |
| Heute `/today`                       | cold | 21 (19–29) | 184 (172–196) | 744 (704–776) | 674 (640–700) |                  0 |          20 |                          26 |
| Sammlung `/collection`               | cold | 21 (15–24) | 184 (176–228) | 728 (692–736) | 658 (639–677) |                  0 |          13 |                          21 |
| Neu bei Freunden `/today?sheet=news` | cold | 22 (17–23) | 196 (176–208) | 712 (708–776) | 663 (626–711) |                  0 |          20 |                          35 |
| Heute                                | warm | 15 (13–17) | 184 (164–196) | 716 (680–816) | 621 (582–672) |                  0 |          17 |                          26 |
| Sammlung                             | warm | 16 (15–18) | 176 (164–180) | 700 (696–728) | 651 (624–663) | 0 (one run: 56 ms) |          13 |                          18 |
| Neu bei Freunden                     | warm | 17 (13–19) | 184 (164–192) | 712 (680–772) | 666 (624–720) |                  0 |          17 |                          37 |

**Light, production build** (series `prod-light-start` and, for the layer, `prod-light-start-news`, load 1.08–2.03): cold LCP Heute 704 (696–776), Sammlung 732 (688–744), Neu bei Freunden 748 (732–756); warm 768, 684 and 704; data ready 637 to 673. These are the same as dark within the spread. In the first light series the predicate for "data ready" of the layer did not match (it counted only buttons, but the rows are links), so the layer was measured again in its own series.

**Profiling build, dark, 3 runs** (series `prof-dark-start`): React render up to data ready, cold: Heute 37.9 (33.0–39.9) ms, Sammlung 38.8 (32.8–40.1), Neu bei Freunden 53.5 (45.3–54.2); warm: 51.6, 30.9 and 56.4 ms. LCP and data ready match the production build (712 to 764 and 649 to 720 ms).

**JS of a start** (identical on every route and in both modes): 107 JS files, 462.4 kB transferred (cold; 0 kB warm from the worker), 1,245.7 kB decoded; 106 of them start before LCP. The bundle report lists the first load at 134.7 kB gzip: `index` 117.0 kB, `oidc-client-ts` 17.3 kB, runtime 0.4 kB. By package: react-dom 65.4 kB (48.5 %), oidc-client-ts 17.0, web/shared 11.6, @tanstack/query-core 10.2, react-router 9.4. The other 104 files are the destinations that `useDestinationPreload` requests when the browser is idle (issue 1645). They arrive in waves at 100 to 650 ms, while the app waits for its data.

**Main thread in the first 1000 ms of a start, traced, dark, 2 runs** (ms; series `prod-dark-trace-start`):

| Start                 |      busy |    script | parse + compile |      GC | style + layout |   paint | task overhead |     other |      idle |
| --------------------- | --------: | --------: | --------------: | ------: | -------------: | ------: | ------------: | --------: | --------: |
| Heute cold            | 460 / 464 | 203 / 186 |           6 / 8 |  6 / 12 |        34 / 39 | 16 / 14 |       87 / 84 | 109 / 119 | 540 / 536 |
| Heute warm            | 479 / 445 | 202 / 182 |           6 / 5 | 12 / 13 |        42 / 41 | 19 / 19 |       79 / 76 | 118 / 108 | 521 / 555 |
| Sammlung cold         | 437 / 406 | 163 / 156 |           6 / 8 |   8 / 4 |        46 / 46 | 25 / 24 |       80 / 78 |  108 / 90 | 564 / 595 |
| Sammlung warm         | 404 / 381 | 144 / 139 |           5 / 5 |   3 / 5 |        46 / 43 | 21 / 25 |       76 / 66 |  107 / 96 | 596 / 619 |
| Neu bei Freunden cold | 524 / 499 | 225 / 221 |           6 / 6 | 11 / 10 |        57 / 49 | 24 / 23 |       84 / 87 | 115 / 102 | 476 / 501 |
| Neu bei Freunden warm | 465 / 502 | 181 / 209 |           6 / 7 |  4 / 10 |        50 / 52 | 27 / 25 |       85 / 77 | 110 / 122 | 536 / 499 |

### Where the time goes, per start

Example: cold Heute, dark run 2, times from navigation start:

| ms         | what                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 to 80    | HTML, CSS, entry and `oidc-client-ts` (preloaded)                                                                                                                                                 |
| 133 to 189 | `GET /account`                                                                                                                                                                                    |
| 184        | FCP (the shell)                                                                                                                                                                                   |
| 100 to 527 | chunk waves: 46 files at 100 to 150 ms, then 8 to 9 files per 50 ms up to 450 ms, 19 at 500 ms                                                                                                    |
| 527 to 636 | 11 requests in parallel (`/account/profile`, `/treatments`, `/watering/due`, `/specimens/hints`, `/locations`, `/achievements/*`, `/friends/requests`, `/specimens/count`, `/onboarding/unlocks`) |
| 627 to 650 | `/onboarding/hints`                                                                                                                                                                               |
| 644 to 686 | `/today`, plus a second round of `/watering/due`, `/treatments`, `/specimens/hints`, `/feed/banner`                                                                                               |
| 693        | data ready                                                                                                                                                                                        |
| 776        | LCP (a text line of Heute)                                                                                                                                                                        |

| Route            | LCP vs 2.5 s      | where the time goes                                                                                                                                                                                                |
| ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Heute            | within (744 cold) | Network-bound: about 4 sequential network steps after the HTML, plus 340 ms of chunk waves before the data requests start. The main thread is idle 54 % of the first second, with no long task. React about 38 ms. |
| Sammlung         | within (728 cold) | Same chain; 13 fetches. Idle 56 to 60 %. React about 39 ms.                                                                                                                                                        |
| Neu bei Freunden | within (712 cold) | Same chain as Heute; the layer renders with the screen. Idle 48 to 50 %. React about 54 ms, the largest of the three.                                                                                              |

These starts ran over USB on localhost with API responses of 20 to 110 ms. With a real network round trip every one of the sequential steps gets longer, so the waterfall, not rendering, decides the start on a mobile network. That was not measured here: the phone has no network.

## Load

The owner rule of 2026-11-20 says to repeat a series at a load below 1.5 when Mac load looks like it skewed it. The 1-minute load before each run:

| Series                                 |    runs | load range                               |
| -------------------------------------- | ------: | ---------------------------------------- |
| prod-light-start (+ news)              | 36 + 12 | 1.08–2.03                                |
| prod-light-int                         |      30 | 1.26–1.73                                |
| prod-dark-int                          |      40 | 1.16–1.65                                |
| prod-dark-start                        |      36 | 1.49–3.00 (runs 2 to 10 at 2.3 to 3.0)   |
| prod-dark-trace, prod-dark-trace-start | 20 + 18 | not tabulated (only their split is used) |
| prof-dark-int                          |      30 | 1.30–1.67                                |
| prof-dark-start                        |      24 | 1.43–2.06                                |

The Mac only serves files and the API: all rendering runs on the phone. The dark starts measured at a load of 2.3 to 3.0 match the light starts at 1.1 to 2.0 within the spread (LCP 704 to 776 vs 696 to 776 ms for Heute cold). So no series looked skewed, and none was repeated. Discarded series: the first light and dark series, which ran while Chrome reported offline (see "Setup"); a debug run that landed on the signed-out start page; and the first light layer start (wrong predicate, see above).

## Limits of this measurement

- One device, one account with 51 plants, and a news layer with only read lines. Paging shows 3 plant rows per page at 360 × 700. Larger collections or unread news were not measured.
- Taps came from CDP touch events, not a finger. The input delay may differ for real input.
- Event Timing rounds to 8 ms, so INP differences below 16 ms are within the rounding.
- No real network: localhost over USB. LCP and "data ready" are lower bounds for a phone on Wi-Fi or mobile data.
- The phone had many other tabs open and little free RAM. Nothing showed memory pressure (no long tasks, stable spreads), but it was not controlled.
- Tracing and the profiling build add overhead. Their splits are used, not their totals, and INP in the profiling series matched the production series.

## Follow-ups (not decided here)

- #2301 (Solid spike) and #2300 (React Compiler): by these numbers both address 17 to 34 % of interaction latency, and none of the interactions is near the INP limit. The owner decides whether they stay.
- The cold-start waterfall (account → chunk waves → 11 requests → hints → today) is the largest share of the time to data. The record names it as the place where a change would gain the most on a real network; no issue was opened from this record.
