# How to gate the scroll components and one-screen (QG-U8, US-QS-15)

As of: 2026-11-22 · Issue 2425 (refs 2412, 2417) · Stories: US-QS-15, SG-LIST-01/02 · Evaluation only: no gate change and no app code in this PR; accepted proposals become later tickets (E-30, US-QG-07).

## Summary

- **The gap is not the ratio, it is what the register measures and where.** QG-U8 judges overflow of 153 screens at 7 sizes in the bare CI runner. It has no state per screen, no size assertion for visible content, no behaviour check (drag, snap, keys, loader, retry), and it waits for fonts with a fixed 400 ms pause. Each finding of the issue (#2383, #2315/#2316, #2402, #2384, #2411, #2350) falls into one of these four holes.
- **Behaviour belongs in the browser, not in jsdom.** 354 of 356 web test files run in jsdom, which has no layout. They stay the right layer for logic, ARIA, keys, announcements and markers in the DOM; they cannot see a height, a snap or a peek.
- **Proposal: no new CI job.** Real-browser checks go into the two browser runs that exist (QG-U5 conformance over 222 stories, QG-U8 one-screen in 5 shards). Estimated added wall time is under 1 minute (assumption, see cost column; to be measured in the first component ticket).
- **Determinism first.** Record and judge sizes in one pinned environment (the Playwright container of ADR 0010), wait for `document.fonts.ready` and a quiet DOM instead of 400 ms, and treat the macOS host run as informational. This is the fold-in of #2411.
- **Six proposals need an owner choice** (section "Proposals"). Recommendation for all six: accept; P-D (determinism) and P-L (marker lint) first, because the component tickets #2418 to #2422 depend on honest markers and a stable number.

## Measured facts (scout, 100 `ci.yml` runs, 2026-11-21 07:20Z to 2026-11-22 09:45Z; nearest-rank percentiles, n small, approximate)

| Layer                                                      | Where it runs                   |                 Median |         p90 | Red in sample                                                                       |
| ---------------------------------------------------------- | ------------------------------- | ---------------------: | ----------: | ----------------------------------------------------------------------------------- |
| Unit and component (Vitest 5, jsdom 31, `app-tests-web`)   | 2 shards, ui change             |          146 s / shard |       177 s | 1 flake (sharing-section, issue 2408), green on attempt 2                           |
| Storybook conformance (QG-U5: axe, 44 px, focus, Esc)      | inside `app-ui`                 |            203 s (job) | 225 s (job) | 0; 222 stories x 2 schemes                                                          |
| Visual snapshots (`ds-snapshots`, pinned Playwright image) | docker, ui change               |                  146 s |       172 s | 0; 116 + 140 PNGs, retries 0                                                        |
| One-screen + a11y-routes (QG-U8, 5 shards)                 | bare ubuntu-24.04 runner        |          351 s / shard |       433 s | 4 shard executions, all deterministic judgements on the gate PR (#2423), none flaky |
| Playwright e2e                                             | PR into `main` and nightly only | 18 to 24 min (nightly) |             | nightly e2e red in 5 of 9 (issue 1720), not part of dev PRs                         |

- Ready-run wall time: median 8.1 min, p90 11.9 min (n = 27). UI shards decide it (median 8.7 min with them, 1.1 min without).
- One-screen: about 110 tests and 4.6 min Playwright time per shard, so about 2.5 s per measured screen-size (derived; assumption that cost is linear).
- Playwright CI retries 1; of 83 parsed shard logs one test was flaky (US-QS-14 layout shift, passed on retry). Quarantine is empty.
- Fonts: Figtree, self-hosted woff2, `font-display: swap`; the e2e support code never awaits `document.fonts`; settle is `networkidle` (6 s cap, errors swallowed) plus a fixed 400 ms pause (`fit.ts`).
- Environment: one-screen and a11y-routes run on the bare runner; only `ds-snapshots` uses the pinned image ("same browser build, same fonts", ADR 0010). Local `make one-screen` uses the host Chromium (macOS here). #2411 (red locally at 390x844 and 1024x768 for `collection-view-species-sheet-cards`, green in CI) has no Linux measurement recorded; the cause is **not established** (fonts, rendering and the Colima clock are suspects, unproven).
- Register: 153 screens, no `kind`, no `state`; 98 layers, 49 with steps, 0 tables, 1 card row. 200 % text is a size, not a state. Accounts: 125 on test2; hint accounts test5/test6 hold one plant. The `states` seed profile makes 38 of 160 missing feature states reachable.
- Storybook 10.6.7 has no test runner and no addon-vitest; 1 story with a play function (segmented control). Stories exist for LayerSheet (2), Pager (2), table (2), responsive table (4), card (5); none for `ScrollEntries`, `PagedGroups`.
- Lint: no rule on `overflow-*` classes or the markers (57 `overflow-*` lines in web src; `data-scroll-region` 0, `data-scroll-x` 1).

## Layers

| Code | Layer                                                    | Sees layout?        | Good at                                                                                   |
| ---- | -------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| U    | Vitest + Testing Library (jsdom)                         | no                  | state logic, keys, ARIA, live-region text, markers in the DOM, forced failure via mocks   |
| S    | Storybook story + play function in the QG-U5 browser run | yes (real Chromium) | one component in one state at exact sizes: heights, snap, peek, sticky header, min sizes  |
| P    | Playwright one-screen over the register (QG-U8)          | yes                 | whole screens in real data states at the seven gate sizes; frame, regions, primary action |
| V    | Visual snapshot (`ds-snapshots`, pinned image)           | yes                 | a change a human should look at once; not a rule check (diff is not a verdict)            |
| A    | axe and conformance (QG-U5)                              | partly              | names, roles, 44 px targets, focus; not scroll behaviour                                  |
| L    | Lint or source scan                                      | no                  | markers honest, forbidden classes and components; costs seconds                           |
| M    | Device check on the four phones                          | yes, real           | drag feel, momentum, peek perception, software keyboard, TalkBack announcement            |

Legend: **●** primary (the check that must fail CI), **○** secondary or supporting, blank = not suited.

## Matrix: rule x layer

| #   | Rule (source)                                                                                                            | U   | S   | P   | V   | A   | L   | M   | CI cost of the primary check                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --- | --- | --- | --- | --- | --- | --- | ------------------------------------------------------------------------------ |
| 1   | Frame fixed: bars and primary action do not move, page does not scroll (US-QS-15, DS-58, SG-LIST-02)                     |     |     | ●   |     |     |     | ○   | exists in #2423; scroll the region in the judge, 0 extra                       |
| 2   | Only marked regions scroll; markers honest (DS-61)                                                                       | ○   |     | ●   |     |     | ●   |     | runtime in #2423; lint < 2 s (P-L)                                             |
| 3   | The four region kinds exist as marked (list, table, card row, sheet content)                                             | ○   | ●   | ○   |     |     | ○   |     | one story each, about 1 s per story (assumption)                               |
| 4   | Segmented control and tab strip fit their row; sideways only at 200 % (`data-scroll-x="row"`, DS-63)                     |     | ●   | ○   |     |     | ○   |     | stories at 360 px normal and 200 % text                                        |
| 5   | No `Pager`, no "Zurück/Weiter", no "Seite n von m", no `?page=` (DS-60)                                                  | ○   |     | ○   |     |     | ●   |     | import ban + text scan < 2 s; QG-U8 already has a no-Pager rule                |
| 6   | Overview never scrolls; at most 6 entries (DS-58)                                                                        |     |     | ●   |     |     |     |     | exists; count of entry links in the judge, 0 extra                             |
| 7   | Primary action pinned in top bar or action bar (FX-36)                                                                   |     |     | ●   |     |     |     |     | measure its box before and after scrolling the region                          |
| 8   | Title and primary action fully visible at load and while scrolled, not under a fixed bar (US-QS-15)                      |     |     | ●   |     |     |     | ○   | same step as 7                                                                 |
| 9   | Loader row at end: quiet, no layout shift, no focus, SR text "Weitere werden geladen …"                                  | ●   | ○   | ○   |     |     |     |     | U with fake observer; P only measures shift on a slow route                    |
| 10  | End marker "Das waren alle n" (filtered count; none when unknown or when the list fits)                                  | ●   | ○   | ○   |     |     |     |     | U for the four cases; P on one real list at 360x640 and 1024x768               |
| 11  | Retry row on a forced failed part; stacks at 200 % text; entries stay (P-10)                                             | ●   | ●   | ○   |     |     |     |     | U logic; S at 200 % for the stack; P with a route that fails page 2 (one test) |
| 12  | Back keeps position; no `?from=`; old parts stripped with `replaceState`                                                 | ●   |     | ●   |     |     |     |     | U for the strip; P one flow, about 5 s                                         |
| 13  | Sheet fitting height when content fits within half                                                                       |     | ●   | ○   |     |     |     |     | S, exact px at 360x640                                                         |
| 14  | Sheet half height = 50 % of visible height                                                                               |     | ●   | ○   |     |     |     |     | S                                                                              |
| 15  | Drag snaps to nearer of half/full; full = visible height minus status bar                                                | ○   | ●   |     |     |     |     | ●   | S with pointer events; real feel stays M                                       |
| 16  | Swipe on content at half height scrolls the content, sheet does not grow                                                 |     | ●   |     |     |     |     | ●   | S with wheel/touch emulation; M confirms on devices                            |
| 17  | Drag past half closes; Esc, "Schließen", Back close; discard question on typed input                                     | ●   | ○   | ○   |     |     |     |     | U for Esc/Back/question; S for the drag                                        |
| 18  | Toggle "Vollbild/Halbe Höhe", arrow up/down on the handle, polite announcement, arrow down at half stays open            | ●   | ○   |     |     | ○   |     | ○   | U: key events and live-region text                                             |
| 19  | Reduced motion: snaps without animation                                                                                  | ●   | ○   |     |     |     |     |     | U checks no transition class/duration; S with `reducedMotion`                  |
| 20  | 200 % text: title and actions that do not fit half height open at full height                                            |     | ●   | ●   |     |     |     |     | S at 200 %; P is the existing 200 % size                                       |
| 21  | Dialog or pane: content is the scroll region, title and actions stay                                                     |     | ●   | ○   |     |     |     |     | S at 768 and 1024 px                                                           |
| 22  | Table: header row and first column stay while scrolling; sideways only inside                                            |     | ●   | ●   |     |     |     |     | S: scroll and compare box offsets (0 px drift); P on the first real table      |
| 23  | Card row: next card peeks (visible slice of card n+1 between 8 px and 40 % of width, starting value); active tab in view |     | ●   | ○   |     |     |     | ●   | S after scrolling to card k; P on `collection-view-species-sheet-cards`        |
| 24  | Two-level card: 4:3 picture at full width, name, at most 2 facts, deck never scrolls                                     |     | ●   | ●   | ○   |     |     |     | S plus P (measure the picture box, see minimum sizes)                          |
| 25  | Minimum visible sizes (picture, row, name width, text not cut) so a cap or collapse fails (#2383, #2315)                 |     | ●   | ●   |     |     |     |     | in the judge, same run (P-S)                                                   |
| 26  | No sideways scroll (page and regions, 1.00 + 1 px) outside table, card row, chip row                                     |     |     | ●   |     |     |     |     | exists                                                                         |
| 27  | 200 % text and 400 % zoom: content scrolls inside its region instead of being cut (WCAG 1.4.4, 1.4.10)                   |     | ○   | ●   |     |     | ○   | ○   | exists as size; "cut" detection is P-S                                         |
| 28  | `--bar-clearance`: focused control and last row stay above the bottom bar (SG-LIST-02)                                   |     |     | ●   |     |     |     | ○   | tab to the last row, assert it is above the bar                                |
| 29  | `overscroll-contain` on a region; no scroll chaining to the page                                                         | ○   |     | ●   |     |     | ●   |     | lint on the shared component; P wheel at region end                            |
| 30  | rem font sizes, `touch-action`, nowrap number+unit (DS-63)                                                               | ●   |     |     |     |     | ●   |     | exists (source scan)                                                           |
| 31  | Names, roles, 44 px targets, focus order and return, Esc in the layer                                                    | ○   |     |     |     | ●   |     | ○   | exists (conformance, a11y-routes)                                              |
| 32  | Look of the finished component (spacing, picture crop, illustration)                                                     |     |     |     | ●   |     |     | ●   | a story snapshot per component, 2 schemes; review by eye                       |

Rules with no automatic primary check: the feel of drag and momentum, the perceived peek, the software keyboard and the spoken announcement (rows 15, 16, 18, 23). They stay with the device check (M); the layer only proves the numbers (snap heights, offsets, live-region text).

## What the findings show

| Finding                                      | Why the ratio missed it                                                | Check that fails it                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| #2383 picture capped to 53x40 px             | overflow ratio fell, so the cap looked like a fix                      | P-S: picture box at least 4:3 and at least a floor width at 360x640 (row 24, 25)       |
| #2315, #2316 rows at 1 to 2 px at 200 %      | a collapsed row adds no overflow                                       | P-S: every visible text node's box at least its line height; row height floor (row 25) |
| #2402 friends-match measures an empty deck   | the register has no state                                              | P-R: `state` per screen, `match card shown` required for the kind (row 24)             |
| #2384 due hints not measured                 | seed account had no due plant in the measured view                     | P-R with the hint accounts (test5/test6) as named states                               |
| #2350 seed gap fails for a non-layout reason | the judge reports a data failure as a layout rule (also #2427 "title") | P-R: a seed precondition check that says "seed gap" and is not baselinable             |
| #2411 red locally, green in CI               | different Chromium build and fonts, fixed 400 ms pause                 | P-D: one pinned environment, fonts awaited, quiet-DOM wait                             |

## Owner decision (2026-11-22)

All six proposals are accepted (P-D, P-L, P-R, P-S, P-B, P-V). Order: P-D and P-L first, then P-R and P-S, then P-B and P-V; all before the component tickets #2418 to #2422. Tickets: #2429 (P-D, P1), #2430 (P-L, P1), #2431 (P-R with P-S, P2), #2432 (P-B with P-V, P2); each names its finding for E-30 and refs #2425. The layout fix (the two 2026-11-06 spikes in one folder) is accepted.

## Proposals (owner decisions)

Each is a later ticket; none is in this PR. Gate-file changes are owner-merge (US-QG-07).

| ID  | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Cost in CI (estimate unless stated)                                                                                                                | Recommendation |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| P-D | **Determinism:** run one-screen and a11y-routes in the pinned Playwright image (as `ds-snapshots`), locally through the same container in `make one-screen`; await `document.fonts.ready` and a quiet DOM (250 ms, as ADR 0010) instead of the fixed 400 ms; macOS host run stays available, but only informational; record numbers in the container. Measure first: run `collection-view-species-sheet-cards` in the container on this Mac and on CI and write both numbers into #2411. | container start about +20 s per shard (assumption), quiet-DOM wait is cheaper than 400 ms on fast screens; shard median 351 s stays about the same | accept, first  |
| P-L | **Marker lint:** a source scan (script in `app/tools/check/`, no ESLint rule needed) refuses `overflow-auto/scroll/x-*/y-*` outside the shared scroll components, requires `data-scroll-region`/`data-scroll-x` on those, and requires `overscroll-contain`; baseline = today's 57 lines, only shrinks. The runtime check of #2423 stays as the second net.                                                                                                                              | under 2 s in `make gates`                                                                                                                          | accept, first  |
| P-R | **Register states:** `screens.json` gets `kind` (overview, list, table, sheet, card-row) and `state` (empty, one, many, due-hints, error, text200); a check requires per kind the states that apply (list: empty, one, many, error; deck: match card shown, empty; sheet: fitting and half). A missing seed is reported as "seed gap", never baselined as a layout rule (#2350, #2427). New states run at 3 sizes only (360x640, 360x640 at 200 %, 390x844).                             | about 20 states x 3 sizes = 60 tests, about 2.5 s each, so +150 s shard time, about +30 s wall over 5 shards                                       | accept         |
| P-S | **Minimum sizes in the judge:** assert (a) the picture box of a card keeps 4:3 and a floor width, (b) no visible text box is shorter than its line height, (c) row height floor and name width floor per kind. Floors are starting values, assumptions, set from the style guide tokens in the component tickets.                                                                                                                                                                        | same run, under 5 % of judge time                                                                                                                  | accept         |
| P-B | **Browser behaviour in the QG-U5 run:** play functions for LayerSheet (13 to 21), table (22), card row (23), list end states (11), at 360x640 and 200 % text. Run them in the existing conformance run, not through a new Storybook test runner or addon-vitest (no new dependency, no new job). Component tickets #2418 to #2421 write them; the conformance script runs every play function it finds.                                                                                  | about +1 s per story, 25 to 30 stories, so under 1 min in `app-ui` (203 s median, not on the critical path of the 351 s UI shards)                 | accept         |
| P-V | **Visual snapshots only where a human judges the look:** one story snapshot per new component (two schemes, 360 px) and the existing 14 page stories; no snapshot per state. The snapshot is not the check for any rule above.                                                                                                                                                                                                                                                           | 6 to 8 more PNGs per component, in `ds-snapshots` (146 s median, retries 0)                                                                        | accept         |

Not proposed: a new Storybook test runner (cost and a second browser run, no rule needs it), a new CI job, e2e on dev PRs (nightly e2e is 18 to 24 min and red in 5 of 9 runs), snapshots as a rule check (a diff says "changed", not "wrong"), jsdom layout mocks (they pass whatever they are given).

## What the component tickets name (after the owner decides)

| Ticket                       | Checks it names (matrix rows)                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| #2418 sheet                  | 13 to 21 (U for 17, 18, 19; S for heights, snap, swipe, 200 %), 3, 31, V snapshot            |
| #2419 list end states        | 9 to 12 (U for the four cases and the strip; S for 200 % stacking; P one forced failure), 28 |
| #2420 table                  | 22 (S, P), 3, 25                                                                             |
| #2421 card row and chip row  | 23, 24, 25 (S, P), 3, 4                                                                      |
| #2422 (frame and one-screen) | 1, 2, 6 to 8, 26 to 29 on the register with P-D, P-R, P-S                                    |
| #2417 gate (PR #2423)        | rows 1, 2, 5 exist; P-L, P-R, P-S, P-D are its follow-ups; fold #2427 into P-R               |

## Not verified

- All "estimate" costs above are derived from the 100-run sample (about 26 h) and linear scaling; none was run.
- The cause of #2411 is not established; P-D's first step measures it.
- Floors in P-S, the peek range in row 23 and the shard split after P-R are starting values, assumptions.
- The sample holds 27 ready runs; flake rates per layer are too small to give percentages.

Raw data: the scout's run lists (`ci.yml`, 100 runs) were kept in the session scratchpad and are not part of the repository.

## Result of P-B and P-V (issue 2432, 2026-11-23)

- **P-B, built.** The QG-U5 run plays the `play` function of each story before it probes the story. A play that throws fails the story as `QG-U5 <story> (<scheme>): play function failed: <message>`. The run waits for the render to pass the play, through the Storybook channel (`storyRenderPhaseChanged`, `playFunctionThrewException`). No runner, addon, dependency or CI job was added.
- **Before the change, a failing play passed.** The self-test fixture `conformance-fixture/Play` `Fail` gave no finding in the red run. The old wait ended at the first `sb-show-main`, which Storybook sets before the play runs.
- **Examples on existing components.** `data-display/Tabs` `ActiveTabInView` checks that the selected last tab is scrolled into view on a 360 px strip (DS-63). `shared/LayerSheet` `Closed` checks that focus moves into the layer on open, that Escape closes it and that focus returns to the opener. The overlay probe already checked the focus return, so the play adds the focus on open.
- **Not a play yet.** The half-height rule (DS-60) is not built: the sheet panel caps its height at `max-h-[90dvh]` and has no half or full snap. Its play comes with the sheet ticket #2418.
- **The examples can fail.** With the tab reveal and the layer's focus on open disabled in a scratch edit, the run reported four findings: two per example, in light and dark. The edit was reverted.
- **Cost.** Same machine, heavy lock, 8 pages. The real run alone: 83 s before, 82 s after. `make conformance` (real run and self-test): 99 s before, 99 s after. Stories: 222 to 223 (`ActiveTabInView`).
- **Look only (P-V).** No snapshot was added: the new story sits outside the `shared/ui` set and the page set of `ds-snapshots`. The rule is written in PRIN-057 and in design-system section 6.
