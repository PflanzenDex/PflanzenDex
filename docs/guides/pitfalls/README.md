# Pitfalls register

Known traps that cost time or caused defects (US-DEV-05). An entry is short and says whether it can become a gate; when it does, the rule moves to `docs/guides/principles/` and the entry links to it.

## Format

One heading per entry `## PF-<nnn> <title>`, then:

- **Symptom:** what you notice.
- **Cause:** why it happens.
- **Fix:** what to do instead.
- **Can it become a gate?** yes (how) / no (why), with the principle ID once it exists.
- **Source:** where the finding comes from (spec ID, PR, incident).

IDs are never renumbered.

## PF-001 Calendar dates shifted by UTC

- **Symptom:** A plant captured late in the evening shows the next or previous day as capture or measurement date.
- **Cause:** The prototype formatted dates with `toISOString().slice(0, 10)`, which converts to UTC before cutting the string.
- **Fix:** Use the local date in the time zone of the user profile for every calendar date (NFR-08); compute phases and reminders in that zone.
- **Can it become a gate?** Yes, and part of it exists: the ESLint rule `no-restricted-syntax` in `app/eslint.config.js` (the constant `noUtcDateSlice`) forbids `toISOString().slice(0, 10)`, and the same call with `substring` or `substr`; `make gates` runs ESLint. It does not catch other UTC cuts, such as `slice(0, 7)` for months. Time zone tests: `app/packages/core/src/kernel/input/date.test.ts` (NFR-08, QG-D4) and the New York case in `app/packages/api/src/collection/specimens/specimens.test.ts` (FR-BES-04).
- **Source:** Defect B-01 of the prototype; `docs/specs/product/14-cross-cutting.md` (NFR-08), `docs/specs/product/18-architecture-and-quality-gates.md` (QG-D4).

## PF-002 Duplicate spec file numbers from parallel sessions

- **Symptom:** Two spec files carry the same number, or the same ID is defined in two places; references become ambiguous.
- **Cause:** Parallel sessions (worktrees) each pick the next free number independently.
- **Fix:** Check the next free number against `origin/dev` right before creating a file; resolve duplicates in the PR that merges second.
- **Can it become a gate?** Already is: `app/tools/check/docs/specs/check-specs.mjs` in `make gates` (principle PRIN-008).
- **Source:** US-DEV-08 in `docs/specs/product/19-development-process-and-automation.md`.

## PF-003 Definition of Done and CI disagree on a number

- **Symptom:** The DoD asks for coverage of at least 70 %, CI enforces 75 %; people pass the DoD and fail CI, or the reverse.
- **Cause:** The threshold was written down in two places and changed in one.
- **Fix:** State each threshold once, in the gate configuration; documents refer to it instead of repeating the number (FR-QG-18).
- **Can it become a gate?** Yes, and it is one: `npm run dod-numbers` (`app/tools/check/docs/specs/spec-numbers/check-dod-numbers.mjs`, QG-U11, FR-QG-18) fails when a DoD document repeats a threshold without a `<!-- gate: file#path -->` marker or with a number differing from the configuration.
- **Source:** Finding from the Tombola project, recorded in FR-QG-18 in `docs/specs/product/18-architecture-and-quality-gates.md`.

## PF-004 Caddy does not start with every capability dropped

- **Symptom:** a Caddy container with `no-new-privileges`, `cap_drop: [ALL]` and a non-root user exits at once with `exec /usr/bin/caddy: operation not permitted`.
- **Cause:** the official image gives the binary the file capability `cap_net_bind_service=ep`. The kernel refuses to execute a binary whose file capabilities it cannot grant.
- **Fix:** copy the binary in the image (`cp /usr/bin/caddy /tmp/caddy && mv /tmp/caddy /usr/bin/caddy`; a plain copy drops the capability). Ports below 1024 still work, because Docker lets unprivileged users bind them inside a container. An existing `/data` volume needs a one-time `chown` (runbook "Container privileges").
- **Can it become a gate?** Already is: `deploy-config.test.ts` checks the copy, the non-root user and the dropped capabilities of every service.
- **Source:** #761 (TE-03 hardening), found on 2026-10-30.

## PF-005 Two GraphQL counters, and a board listing that costs a point per item

- **Symptom:** `gh api rate_limit` shows the GraphQL budget nearly unused while calls fail with "API rate limit exceeded"; the reset named by the failing response's `X-RateLimit-Reset` header differs from the one `rate_limit` shows. One `gh project item-list --limit 1000` uses a large part of the hourly budget, and `make issue` plus a few board edits used all of it in about 20 minutes.
- **Cause:** The rate-limit endpoint and the responses report different windows, and the header of the failing response was the true one (2026-11-05). `gh project item-list` and `gh project field-list` load the fields of every item: one page of 100 items costs about 100 points, measured with GitHub's own `rateLimit.cost`. `make claim` read the whole board twice.
- **Fix:** Measure a GraphQL call with `rateLimit { cost }` in the same query, not with another endpoint's counters. Read the board with small queries: one issue's `projectItems`, plain field values in pages of 100, the field ids once per run (`app/tools/workflow/claim/lib/board-client.mjs`). Use REST for repository, issue and pull request calls (own budget). When a call fails on a rate limit, wait for the reset named in the failing response (its `X-RateLimit-Reset` header), not for the one `rate_limit` shows; do not work around the claim, and never poll `gh pr view` in a loop.
- **Can it become a gate?** No. The budget belongs to the shared account, not to the repository. The query shapes are unit-tested (`board-client.test.mjs`); the cost is not, so re-measure it by hand when a board query changes.
- **Source:** #1412, measured on 2026-11-05 (`gh api graphql` with `rateLimit { cost }`).

## PF-006 Board single-select options rewritten without their ids

- **Symptom:** After a field edit on the "PflanzenDex Roadmap" board, the value of that field is empty on every item.
- **Cause:** The options of a single-select field were written again without their ids. GitHub then drops each item's value, because the values point at the old option ids.
- **Fix:** Before any field edit, snapshot the items (small queries, see PF-005). Add options in the GitHub UI, never through the API.
- **Can it become a gate?** No: the safe path is a UI step, and no check can run a UI step.
- **Source:** Board field work, 2026-11 (lessons review of issue 1746).

## PF-007 vitest in a worktree without the test database URL

- **Symptom:** `vitest` in a worktree fails with "code.charCodeAt is not a function" or "No test files found", which points at the test code or the file pattern, not at the environment.
- **Cause:** `PFLANZENDEX_TEST_DATABASE_URL` is not set in the shell, and the test setup fails with a message that names something else.
- **Fix:** Run the tests with `make test-files`, or set `PFLANZENDEX_TEST_DATABASE_URL` with the test database port of this worktree (`PFLANZENDEX_TEST_DB_PORT` in `.env.worktree`, see `parallel-work.md`).
- **Can it become a gate?** No: the failure comes from the local shell, and CI runs with its own database service.
- **Source:** Test runs in worktrees, 2026-11 (lessons review of issue 1746).

## PF-008 Empty database after a chained `make db-up migrate browsers`

- **Symptom:** The database has no tables, and `migrate` fails with "role pflanzendex_app does not exist".
- **Cause:** The chain starts `migrate` right after `make db-up`, before the database has its application role, and the chain does not wait for it.
- **Fix:** Run `make migrate` on its own after `make db-up`, then check that the tables exist.
- **Can it become a gate?** Maybe: `migrate` could wait for the database before it runs. Not now.
- **Source:** Local setup of a worktree database, 2026-11 (lessons review of issue 1746).

## PF-009 Test tools hide console output and StrictMode effects

- **Symptom:** A `console.log` in a vitest test prints nothing. An effect that runs twice under React StrictMode in the app runs once in the test. A testing-library role query finds nothing while a modal is open.
- **Cause:** vitest hides console output and does not run StrictMode effects twice (only the e2e tests on the Vite dev server do). A modal layer makes the page behind it `aria-hidden`, and role queries skip hidden elements.
- **Fix:** Check StrictMode behavior in an e2e test on the dev server, not in vitest. Query the elements of the open layer, not the page behind it.
- **Can it become a gate?** No: these are the limits of the test tools; a gate would repeat them.
- **Source:** Test runs in the UI work, 2026-11 (lessons review of issue 1746).

## PF-010 `make -n` runs recipe lines that contain `$(MAKE)`

- **Symptom:** A dry run (`make -n <target>`) of a target that starts `auth-up` still starts the auth service.
- **Cause:** make runs recipe lines that contain `$(MAKE)` even in a dry run. That is make's behavior, not a bug in the Makefile.
- **Fix:** Never dry-run a target that starts `auth-up`; read its recipe in the Makefile instead.
- **Can it become a gate?** No: this is make's own semantics, and no gate changes it.
- **Source:** Makefile work in a worktree, 2026-11 (lessons review of issue 1746).

## PF-011 React Suspense holds a chunk wait after a fallback

- **Symptom:** A loading hook used inside a Suspense boundary gives a late or wrong loading state. A `ResponsiveModal` opened from that boundary renders its children outside it.
- **Cause:** React Suspense keeps a chunk wait about 300 ms after any fallback. `ResponsiveModal` portals its children outside the boundary that wraps its caller, so a loading state read inside that boundary does not follow them.
- **Fix:** Keep the loading hook outside the Suspense boundary.
- **Can it become a gate?** No: this is React's timing and the place of the portal; a test would only repeat it.
- **Source:** UI work on `ResponsiveModal`, 2026-11 (lessons review of issue 1746).

## PF-012 CodeQL blocks a merge while `ci-status` is green

- **Symptom:** The PR shows a green `ci-status`, but the merge is blocked by a CodeQL alert on the head. Typical findings: a regex that strips comment delimiters in one pass (`/<!--.*?-->/`), or a polynomial ReDoS pattern.
- **Cause:** CodeQL is required by the ruleset next to `ci-status`, and it flags such regexes in the changed code.
- **Fix:** Look at every check run on the head, not only `ci-status`, and read the CodeQL annotations through the check-runs API. Rewrite the flagged code without the regex. PR 1760 hit this in the comment stripping of the Lessons check.
- **Can it become a gate?** Already is: CodeQL, required by the ruleset, blocks the merge.
- **Source:** PR 1760 (Lessons check of `make pr`).

## PF-013 GitHub PR quirks: missing CI runs and merge conflicts

- **Symptom:** A push reaches the branch, but no CI run appears on the PR. A PR shows `mergeable_state: unknown`. `make merge` exits 2 with "merge conflicts".
- **Cause:** A push right after a merge into `dev` may not start CI on the PR (no `synchronize` event) while GitHub recomputes mergeability (PR 1757). A conflicting PR gets no CI run. `unknown` can also mean the PR is already merged.
- **Fix:** Make a new commit, or merge `origin/dev` into the branch: both bring the CI run back. Read `.merged` before you act on `mergeable_state: unknown`. For `make merge` exit 2: merge `origin/dev`, keep both news fragments, push.
- **Can it become a gate?** No: the event behavior belongs to GitHub, and the repo cannot test it.
- **Source:** PR 1757; `make merge` runs (lessons review of issue 1746).

## PF-014 No GitHub GraphQL in Claude Code cloud sessions

- **Symptom:** In a cloud routine or remote session, `gh pr list`, `gh issue list`, `gh issue comment` and `gh auth status` fail with 403 "GitHub GraphQL is not available from Claude Code sessions"; a write over the GitHub app can fail with `403 Resource not accessible by integration`.
- **Cause:** Cloud sessions reach GitHub only over REST through the Claude GitHub app; the `gh` subcommands above use GraphQL. A write needs the Claude GitHub app installed on the account that owns the repository, here the organization PflanzenDex, with the matching permission (for comments: Issues, read and write); installed only on the personal account, writes to an organization repository fail with 403.
- **Fix:** Use `gh api repos/<owner>/<repo>/…` (REST) for every read and write in a routine (`.agents/routines/*.md`); install the app on the organization (github.com/apps/claude → Configure → PflanzenDex) with the permission a routine writes with.
- **Can it become a gate?** Partly: a check could refuse `gh pr list`, `gh issue list` and `gh issue comment` in `.agents/routines/`; not built (E-30, no incident yet).
- **Source:** First runs of the routines of issue 1753 (2026-11-09).

## PF-015 A new news fragment is missing from the web tests in an existing worktree

- **Symptom:** After adding `app/packages/web/src/news/unreleased/<issue>-<slug>.json`, the full web suite fails in `whats-new.test.ts` ("every fragment file of news/unreleased is a line of the list": expected n + 1, got n), although the fragment is valid and the test passes in CI.
- **Cause:** Vitest's file-system module cache (`app/node_modules/.vitest-cache`) keeps the result of the `import.meta.glob` over `news/unreleased` from a run before the file existed.
- **Fix:** Run `npx vitest run --clearCache` in `app/packages/web` after adding a fragment, before the full suite. CI starts without the cache and is not affected.
- **Can it become a gate?** No: it is local tool state, not repo content; the CI run is already correct.
- **Source:** PRs 1908, 2092, 2091 and 2093 (2026-11-13/14), each implementer hit it once.

## PF-016 `make claim` refuses because another issue or PR names the same story ID

- **Symptom:** `make claim` or `make worktree` refuses a fresh, unassigned issue: "PR #n references it" or "branch origin/… already carries dev-05", although nobody works on that issue.
- **Cause:** The claim key is the story ID in the issue title (`app/tools/workflow/claim/lib/claim-lib.mjs`). A second issue with the same ID, an open PR whose title or body names the ID or `#n`, or an origin branch with the same key counts as a claim on it.
- **Fix:** Retitle the issue with another requirement ID that fits the change. A title with an NFR id (or none) gives the key `issue-<n>`, which never collides.
- **Can it become a gate?** No: the refusal is the gate; the trap is choosing an ID that is already in flight.
- **Source:** Session memory audit 2026-11-14 (A04); issue 2107 hit it against PR 2108.

## PF-017 Editing a PR body starts an "edited" CI run that blocks the merge

- **Symptom:** After `gh pr edit` or `make pr-text`, `make merge` waits or refuses although the last push was green; a rerun of that run checks the old title again.
- **Cause:** The PR-title check runs on the `edited` event, and its `ci-status` blocks until it ends. `gh run rerun` replays the event payload of the original run, with the old title.
- **Fix:** Fix title and body in one edit (title at most 100 characters, no colon inside the scope parentheses), wait for that run, and push or edit again instead of rerunning an edit run.
- **Can it become a gate?** No: event and rerun behaviour belong to GitHub.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-018 A dispatched `ci.yml` on a PR head runs e2e and can block the merge

- **Symptom:** After `gh workflow run ci.yml --ref <PR branch>` for e2e proof, a red e2e job makes `make merge` refuse, although the PR's own run is green.
- **Cause:** A dispatch runs the full CI including e2e on the head commit, and its `ci-status` counts for that head.
- **Fix:** For e2e proof push an empty commit to a new branch `exp/issue-<n>-e2e-proof` (suffix `-k` for more) and dispatch on that branch.
- **Can it become a gate?** No: it is how check runs attach to a commit.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-019 CodeQL stays cancelled or without the actions analysis

- **Symptom:** The merge stays blocked by CodeQL: after `make pr` on a draft there is one cancelled and one skipped CodeQL run, and a rerun turns green without unblocking; or after a GitHub Actions outage runs "failed" with no jobs and CodeQL lacks the actions analysis.
- **Cause:** Not fully known: the draft-to-ready switch of `make pr` and its push start overlapping CodeQL runs, and the ruleset keeps reading the cancelled one; an outage drops one analysis of the required set.
- **Fix:** After a draft `make pr`, push an empty commit for a clean set of runs. After an outage, rerun CodeQL. See also PF-012.
- **Can it become a gate?** No: run scheduling belongs to GitHub.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-020 Two timed-out CI runs on one head keep `ci-status` red

- **Symptom:** A rerun of one timed-out run turns green, but `ci-status` still blocks the merge.
- **Cause:** The other run on the same head still carries its failed `ci-status`.
- **Fix:** Rerun both runs with `gh run rerun <id> --failed`, each only after its whole run has ended.
- **Can it become a gate?** No: GitHub behaviour.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-021 Auto-merge into `main` waits for the non-admin approval

- **Symptom:** Auto-merge on a release PR into `main` never fires, though `ci-status` is green and an admin owns the PR.
- **Cause:** Auto-merge does not use the admin bypass of the ruleset; it needs the one approval from a non-admin and a green `ci-status`.
- **Fix:** Get the non-admin approval, or let the admin merge by hand (release checklist).
- **Can it become a gate?** No: ruleset behaviour.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-022 `make merge … | tail` hides a failed merge

- **Symptom:** A chain like `make merge PR=<n> | tail -1 && cleanup` removes the worktree although the PR was not merged.
- **Cause:** The pipe returns the exit code of `tail`, not of `make merge`.
- **Fix:** Run `make merge` without a pipe, or check its own exit code (`set -o pipefail`), before any cleanup.
- **Can it become a gate?** No: it is the caller's shell.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-023 Migration data steps are silent no-ops under FORCE RLS

- **Symptom:** A migration that updates or backfills rows reports success, but on the test host nothing changed; locally and in CI the data is right.
- **Cause:** On the hosts migrations run as `pflanzendex_owner` (NOBYPASSRLS) under FORCE ROW LEVEL SECURITY, so `UPDATE`/`INSERT … SELECT` see no rows; `make migrate` and CI use the superuser and hide it.
- **Fix:** Write data steps so they still reach the rows under FORCE RLS as `pflanzendex_owner` (see how migration 0117 redid 0098, 0112 and 0116), and check the row count on the host after the migration.
- **Can it become a gate?** Yes, partly: CI could run migrations as `pflanzendex_owner`; could also be a step in the `db-migration` skill. Not built yet (E-30).
- **Source:** Issue 1809; session memory audit 2026-11-14 (A04).

## PF-024 Parallel PRs that shrink `one-screen-baseline.json` conflict

- **Symptom:** Every merge of `origin/dev` into a branch conflicts in `app/config/gates/baselines/one-screen-baseline.json`.
- **Cause:** Each PR removes its own entries and lowers `maxEntries`, so parallel PRs edit the same lines.
- **Fix:** Take dev's file, re-apply only this PR's removals, and set `maxEntries` to dev's value minus the own removals.
- **Can it become a gate?** No: the baseline gate already checks the result.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-025 "#1027" in a code comment trips the hex-colour check

- **Symptom:** The design-system check reports DS-27 (hard-coded colour) on a line without a colour.
- **Cause:** DS-27 matches `#` followed by hex digits, and an issue reference such as `#1027` in a comment looks like a colour.
- **Fix:** Write "issue 1027" in code comments. For CodeQL on HTML-comment regexes see PF-012.
- **Can it become a gate?** No: the check is right to stay strict.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-026 Storybook breaks while `make gates` stays green

- **Symptom:** A change to `app/packages/web/vite.config` or a build plugin passes `make gates`, but the Storybook build or `ds-snapshots-check` fails in CI.
- **Cause:** Storybook builds with the app's vite config, so the build plugins run there too, and `make gates` does not build Storybook.
- **Fix:** Run `make ds-snapshots-check` after touching the vite config or its plugins.
- **Can it become a gate?** Not assessed; `make ds-snapshots-check` is the existing check that builds it.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-027 Demo data is orphaned after a shared Keycloak re-import

- **Symptom:** After the shared Keycloak realm is re-imported, the demo users sign in to empty collections.
- **Cause:** The re-import gives the demo users new subjects, and the seeded data still points to the old ones.
- **Fix:** Reseed with `DEMO_SEED_SUBJECTS="test=<sub>,…"` and `DEMO_SEED_PROFILE=states` (`app/packages/api/perf/demo-seed/`).
- **Can it become a gate?** No: it is the state of a shared service.
- **Source:** Session memory audit 2026-11-14 (A04).

## PF-028 A test reads streamed output before every asserted line arrived

- **Symptom:** A tool test fails only in CI or under load: the output it asserts on holds the first line and misses the next one.
- **Cause:** The test waits until one string appears and then asserts on other lines. A child process that writes lines separately delivers them in separate chunks, so the later line can still be on its way.
- **Fix:** Wait (bounded, as `until` in `tools/lint/heavy-lock.test.mjs` does) until every line the test asserts on is in the output, then assert.
- **Can it become a gate?** No: whether two writes arrive together depends on the scheduler, not on the code shape.
- **Source:** Issue #2111, PR #2112 (CI run 43642600768 on PR #2105).

## PF-029 A whole-second threshold fires a few milliseconds after the start

- **Symptom:** A script that should stay silent for its first second (a wait line, a progress note) sometimes speaks at once, mostly under load, and the flake rarely reproduces on demand.
- **Cause:** `date +%s >= started + 1` counts whole seconds, so a call that starts late in a second passes the threshold after a few milliseconds. A condition that only means "not done yet" (no note, a dead owner's note) then reads as "someone else holds it".
- **Fix:** Measure the threshold in milliseconds (`$EPOCHREALTIME` in bash 5, as `tools/lint/heavy-lock.sh` does) and print only on positive evidence (the note names another live owner). Show the race in a test with a shim that delays the slow step (a `flock` on `PATH` that sleeps first), not with CPU load: load reproduced it in 0 of 100 runs.
- **Can it become a gate?** No: whether a time check is coarse depends on what it guards, which a pattern cannot tell.
- **Source:** Issue #2119, PR #2125 (first seen while measuring #2111 in PR #2112).

## PF-030 Two `history.back()` calls in a test do not reproduce a quick double Back

- **Symptom:** A history guard (the "Eingabe verwerfen?" question of a layer or a plant form) passes its double-Back test in jsdom, yet two quick Backs on a phone pass the layer without the question and the input is lost.
- **Cause:** jsdom renders and runs the effects between two separate `window.history.back()` calls, so the guard entry is back before the second Back. In a browser the second traversal can land before the effect, or React batches both POPs into one render that never shows the layer's own entry.
- **Fix:** Reproduce it with one traversal over both entries (`window.history.go(-2)` on a `BrowserRouter`) or with two `navigate(-1)` calls in one event, as `layer-sheet.test.tsx` does. Decide the hold in the render that lands below the layer, not in a later effect, and keep the layer's form mounted through it (a parent that renders the form only while the address names the layer loses it).
- **Can it become a gate?** No: whether a test covers the race depends on how it drives the history, which a pattern cannot tell.
- **Source:** Issue #2145, PR #2146 (first noted in the Handoff of PR #2140).

## PF-031 A web test acts on screen before the router committed the navigation that goes with it

- **Symptom:** A web test that presses Back or a button right after a question or view appears times out only under load (CI, a busy machine). The step it waits for never comes; unloaded it passes in milliseconds.
- **Cause:** The routers apply history changes in `startTransition` (`TransitionRouter`, `MemoryRouter`), while state such as an open question renders at normal priority. The question can be on screen while the history entry pushed with it is still pending. A step back taken then lands on the entry already committed, the location key does not change, and an effect keyed on it never runs again. A lazy part requested on a timer (the sheet asks for its code 1.5 s after it mounts) can also land in the middle of a test and stall it.
- **Fix:** Wait in the test for the committed location the next step needs (a probe in the router, as `Address` records `route.guarded` in `collection-area.test.tsx`), and load the lazy parts of the path in `beforeAll` (#444). To find such a race, log every committed location with a timestamp in the test router and compare a hung run with a passing one; CPU load (24 busy loops, five parallel runs) reproduces it. A test that chains several waits of 4 to 5 s each cannot fit into the default test budget of 5 s: one runner stall of about 4 s fails it before any assertion does. Give its `describe` a budget above the measured stalls (`describe(name, fn, 15_000)`, with the reason in a comment) and keep the wait timeouts (issue 1839).
- **Can it become a gate?** No: whether a step depends on a pending transition is a property of the flow, not of a code pattern.
- **Source:** Issue #2136, PR #2142; the product side of the race is filed as its own bug. The test budget: issue #1839, PR #2260.

## PF-032 `make ds-snapshots` rewrites baselines nobody changed

- **Symptom:** After `make ds-snapshots`, dozens of PNGs under `.storybook/snapshots` and `.storybook/page-snapshots` show as modified, including components and pages the change never touched (57 files in PR #2172: buttons, selects, the "Entdecken" and "Heute" pages).
- **Cause:** The update run writes every baseline anew; tiny rendering differences that stay inside the comparison threshold still produce a different file. The check run (`make ds-snapshots-check`) passes against the old files.
- **Fix:** After the rewrite, keep only the pictures the change explains; restore the rest with `git checkout -- <png>` and confirm with `make ds-snapshots-check` that the committed baselines still match. Name the kept pictures in the PR.
- **Can it become a gate?** No: whether a picture change is caused by the diff needs judgment; the check run already fails on a real difference.
- **Source:** Issue #2075, PR #2172.

## PF-033 The initial JavaScript sits just under its ceiling, so code in the entry fails only in CI

- **Symptom:** A change that adds a little code to the first paint (a frame drawn during the session check, a helper read before the first render) passes `make gates` and every unit test, and then `app-ui` fails in CI: "bundle budget (QG-U6, DS-08): initial JS is 141.3 kB gzip, allowed 140.0 kB".
- **Cause:** `make gates` does not build the web app; the budget runs in `make ci-ui` only. Dev stood at 139.9 kB of the fixed 140.0 kB ceiling (2026-11-16), so even a few hundred bytes in `app/main.tsx`, `app/frame/app/app.tsx` or a module the entry imports (the `account` index pulls more into it) break it. Moving the new code into a lazy chunk does not help on its own: the bundler re-splits the shared chunks, and the initial size grew to 141.6 kB.
- **Fix:** Before pushing a change to the entry, run `npm run build -w @pflanzendex/web && npm run bundle-budget` in `app/`, and compare with dev's number (build dev's `src` the same way). When the change needs room, either make room first in its own PR (code that the first paint does not use, in a lazy chunk) or ask the owner about the ceiling (ADR 0018); never edit `quality-limits.json` to pass. Look for one small name imported from a heavy module first: `pageTitle` imported from `navigation.tsx` put the whole navigation chunk (2.0 kB) into the start, and `clearPhotoCache` imported at sign-out put the photo hook (0.8 kB) there (issue 2215). The same holds for a feature index the start imports one name from: every name it re-exports joins the start group, even one only lazy pages use (the `todayTexts` message table and the `App` re-export of `app/flows`, together 0.9 kB, issue 2242); keep a message table with the component that reads it, not in an index. A per-module view of the initial chunks: build with `-- --sourcemap --outDir <dir>` and attribute the sourcemap bytes per source file. Before cutting code, count the chunks: the start once had 22 initial chunks, and their separate compression and cross-chunk imports cost 7.7 kB; since issue 2226 the `$initial` group in `vite.config.ts` keeps them in one, so a new start module no longer splits off a chunk of its own.
- **Can it become a gate?** It is one already (QG-U6 in CI); running it in `make gates` costs a full build on every push.
- **Source:** FX-08, PR #2182 (the app start of issue 1876 was taken out of the PR for it); issue 2226 (one start chunk); issue 2242 (re-exports of a feature index in the start).

## PF-034 A random fixture tag spells the label a bare isolation check looks for

- **Symptom:** A tenant-isolation test fails now and then with B's answer "containing" A's label: `expected '{"error":{"code":"specimen.not_found"…' not to contain 'anna'`, while the same head passes on the next run. The answer only held B's own name, "Bereich npfemdanna bernd – blau".
- **Cause:** The test tags its fixture names with a random string (a UUID with digits mapped to letters). The alphabet held every letter of "anna", so about one tag in ten thousand spelled it, and B's own names carry the tag. A bare `not.toContain("anna")` then fails on B's data, not on a leak.
- **Fix:** Build the tag from an alphabet that cannot spell any label the test checks for (no "n" and no "r" for "anna" and "bernd"), or check the tagged form (`${tag} anna`) and ids. Read the received body before suspecting a leak: the nearest names of a refusal come from the caller's own rows.
- **Can it become a gate?** No: which strings a test asserts on is judgment; the AI read tests now pin the alphabet in a test (US-KI-12).
- **Source:** Issue #2193, CI run 43782439237.

## PF-035 A check on leaving a field eats the tap on send, and a click test in jsdom never sees it

- **Symptom:** A form with an empty required field is sent by tap on a phone: the field turns red and shows its message, nothing is sent, and the focus stays on the send button instead of moving to the field. Enter in the field and every `userEvent.click` test work.
- **Cause:** The press first moves the focus from the field to the button (`mousedown`). The field's check on leaving (react-hook-form `mode: "onTouched"`) renders its message before the release, and a phone also closes its keyboard; the page moves under the finger, the release lands beside the button, and the browser sends no `click`. jsdom has no layout, so a click test cannot show the shift.
- **Fix:** Keep the focus in the field while the send button is pressed (`keepFieldFocus` in `shared/ui/form.context.ts`, wired in `FormRoot`; a send button outside a `<form>` prevents its own `mousedown`), and give the button the focus on the pointer click (`focusSend`, only for `detail > 0`: Enter's implicit click must leave the focus in the field). The send then checks every field and focuses the first wrong one, and a valid send keeps the focus on the busy button (US-QS-14). Pin it with a split press in the test (`user.pointer({ keys: "[MouseLeft>]" })`, assert focus and no message, then `"[/MouseLeft]"`), not with `click` alone.
- **Can it become a gate?** No: whether a press can shift the page depends on what the check renders; the shared `FormRoot` covers every form built on it.
- **Source:** Issue #2216 (recheck of FX-13 on four devices).

## PF-036 `hyphens: auto` lowers the min-content width, so a "longest word" minimum breaks the word anyway

- **Symptom:** A title that should keep its longest word whole (`min-w-min`, or a flex item's automatic minimum) breaks as "Samm-lung" at 200 % text and the action stays beside it instead of wrapping under it. Unit tests that check the classes pass; a real phone may pass too when its browser has no German hyphenation dictionary.
- **Cause:** The base layer sets `hyphens: auto` on every h1 (issue 1315). With hyphenation on, the browser counts each syllable as a possible line break, so the min-content width is the widest syllable, not the widest word.
- **Fix:** Set `hyphens: manual` (`hyphens-manual`) on every title whose minimum must be a whole word (`KEEP_WORD` in `page-header.tsx`); keep `hyphens: auto` only where a word wider than the column may break.
- **Can it become a gate?** Partly: the e2e check "US-QS-32 bar titles at 200 % text" in `reflow.spec.ts` reads the lines of each word of the bar title; other headings need the same thought when they get a word minimum.
- **Source:** Issue #2231 (recheck of FX-44 step 1).

## PF-037 A portal is not hidden with its subtree, so two mounted headers both draw into the top bar

- **Symptom:** The top bar shows the page title twice ("Heute Heute", two h1) for a moment after a cold start or a sign-in, while the page below looks right.
- **Cause:** A `PageHeader` below `md` portals its row into the shell's bar slot. Heute's intro keeps its tasks mounted in a hidden wrapper while it waits and renders its own fallback beside them. A hidden wrapper or a suspended subtree hides its own DOM, not the DOM it portalled elsewhere, so both headers draw in the bar.
- **Fix:** A shared slot has one owner: `AppBarSlot` keeps the claims in mount order, and only the first claim draws in the bar (`useBarClaim`). Any new portal target that several mounted components can fill needs the same rule.
- **Can it become a gate?** No: whether two claimants can be mounted at once depends on the page's Suspense structure. The claim-order test in `app-bar-slot.test.tsx` and the hand-over test in `start-frame/handover.test.tsx` pin this case.
- **Source:** Issue #2230 (recheck of FX-08 on four devices).

## PF-038 A layout read right after a text-size or viewport change races the app's ResizeObserver

- **Symptom:** An e2e layout test fails now and then on a phone size with 200 % text (Heute, issue 2281: the scrolling frame ends 28 px under the bottom bar, or the frame is not taller than the window), and passes when run again or watched in the trace.
- **Cause:** The test injects `html { font-size: 200% }` and reads boxes in the same task. The shell writes the bar's real height to `--bar-reserve` on `main` from a ResizeObserver, a few frames later (5 frames, 541 ms in one local run), and the lazy tiles load later still. Until then the frame still reserves the old bar height. A fixed wait of n frames only moves the race to a slower runner.
- **Fix:** Wait for the state the app writes, not for time or frames: `expect.poll` until `--bar-reserve` equals the height of `nav[data-bottom-bar]`, after the lazily loaded parts are visible (`settleOverview` in `e2e/tests/accessibility/display/today-layout.spec.ts`). Never poll the assertion under test.
- **Can it become a gate?** No: which value a test must wait for depends on the view. The helper is the pattern to copy.
- **Source:** Issue #2281, PR #2282.

## PF-039 A Docker bind mount from the system temp folder is empty on a Mac

- **Symptom:** A check that runs a container passes in CI but hangs or times out on a Mac: `make ds-snapshots-check` timed out on every story, and the container saw an empty catalog.
- **Cause:** Colima (and Docker Desktop by default) share only `$HOME` into their VM. `os.tmpdir()` on macOS is `/var/folders/…`, outside it, so `docker run -v <tmp>:/x` silently mounts an empty, root-owned folder instead of failing. GitHub runners use `/tmp`, which Docker sees, so CI stays green.
- **Fix:** Put every folder a container mounts under the repo, for example a `mkdtemp` under `app/.cache` (gitignored), never under `os.tmpdir()`. A script that rewrites files from a container run writes to a staging folder and swaps only after a passing run, so a failed run destroys nothing.
- **Can it become a gate?** Partly: the QG-U5 self-test (`ds-snapshots.selftest.mjs`) asserts that the catalog is built under `app/.cache` and that a failed update leaves the baselines as they were. A general rule ("no `os.tmpdir()` next to `docker`") is not worth a gate until a second script mounts folders (E-30).
- **Source:** Issue #2286, PR #2288.

## PF-040 The devbox phone is offline for Chrome, so the app measures its offline state

- **Symptom:** On the OnePlus of the devbox the app shows "Du bist offline" over every screen and that notice becomes the LCP element, although the API answers over `adb reverse`. Writes may take the offline path.
- **Cause:** The phone has Wi-Fi on but no connected network and no SIM. Chrome derives `navigator.onLine` from the device's network, not from reachable hosts, so it reports `false`, and the app shows its offline state (US-QS-30). With CDP, `Network.emulateNetworkConditions` with `offline: false` changes nothing as long as no throttling is set.
- **Fix:** Before measuring, set `Network.emulateNetworkConditions` with `offline: false, latency: 0, downloadThroughput: 1e9, uploadThroughput: 1e9` in the same CDP session (it ends with the session), and check that `navigator.onLine` is `true`. A throughput of `1e10` overflows and stalls every request. The script `docs/records/spikes/2026-11-20-real-phone-performance/scripts/measure/run.mjs` does both.
- **Can it become a gate?** No: phone measurements run by hand, and no gate drives the phone.
- **Source:** Issue #2299, record `docs/records/spikes/2026-11-20-real-phone-performance/README.md`.

## PF-041 A second `vite preview` on a taken port leaves the old build in place

- **Symptom:** An A/B measurement shows build B with the numbers of build A. The series meant for the second build run against the first one.
- **Cause:** A `vite preview` started through `npx` for build B found its port held by the still-running preview of build A. It logged "Port … is already in use" and stopped, and the old server went on answering on that port.
- **Fix:** Stop the previous preview by its own PID and wait until nothing listens on the port before you start the next one. Before each series, check that the page loads the entry chunk of the build you mean (its hashed `index-*.js` name). The trial runner of issue 2300 did both.
- **Can it become a gate?** No: A/B measurements on the phone run by hand, and no gate builds two variants.
- **Source:** Issue #2300, record `docs/records/spikes/2026-11-20-react-compiler/README.md` (two discarded sessions).

## PF-042 A symlinked temp path breaks entry-point guards and path comparisons on a Mac

- **Symptom:** A tool test passes in CI and fails on the devbox: an expected path is not found in the output, or a check script started from a temporary copy exits 0 without output.
- **Cause:** On macOS `os.tmpdir()` can be `/var/folders/…`, a symlink to `/private/var/folders/…` (a shell that skips `~/.zshrc` keeps the unresolved `TMPDIR`). Git and Node resolve the link: `git rev-parse` and `import.meta.url` give `/private/var/…`, while `process.argv[1]` and `os.tmpdir()` keep `/var/…`. A guard `process.argv[1] === fileURLToPath(import.meta.url)` is then false and the script skips `main()`, so a check passes silently. GitHub runners use `/tmp`, no symlink, so CI stays green.
- **Fix:** Start a script's `main()` through `isEntryPoint(import.meta.url)` (`app/tools/check/shared/entry-point.mjs`, which compares realpaths); package scripts that cannot import it compare `realpathSync(process.argv[1])`. A test that compares paths builds its temp folder from `realpathSync(os.tmpdir())`. A test that copies a script into a temp tree copies the helper with it.
- **Can it become a gate?** Not now (E-30): the shared helper removes the copies under `app/tools/` and `tools/`, and the symlink tests (`check-ci-drift.test.mjs`, `entry-point.test.mjs`) fail when the guard regresses.
- **Source:** Issue #2290, PR #2309.

## PF-043 A UI change that renames a text or heading turns only the nightly e2e red

- **Symptom:** `dev` is green on every PR, but the nightly e2e job fails for days with dozens of tests, and then is cancelled by its 25-minute job timeout, so the run lists no failures at all.
- **Cause:** PR CI runs Playwright only for release PRs and manual runs (E-15, `ci.yml` job `e2e`). A PR that turns a heading into a row, renames a page title or rewords an empty line or an error text still passes, and the e2e locators that name the old text break only at night. Each broken test then waits for its timeout and retries once, so a red suite needs far more than the green 15 minutes.
- **Fix:** In a PR that changes a visible text, a heading or a role in `app/packages/web`, grep `app/packages/e2e` for the old text and role and update the specs in the same PR; run the affected spec files under `make heavy-lock` or dispatch `nightly.yml` on the branch. After a nightly cancelled by the timeout, read the per-test `error-context.md` files of its `e2e-report` artifact: they hold the error and the accessibility snapshot.
- **Can it become a gate?** Not now (E-30): running e2e in every PR costs about 15 minutes of CI per UI PR, which E-15 declined. The nightly stays the check; this entry is the reminder.
- **Source:** Issue #1720, PR #2319 (renames from #2185, #2190, #2192, #2266 and #2312 broke 28 tests).

## PF-044 Arrow keys do not change a native select in headless Chromium on a Mac

- **Symptom:** A keyboard-only e2e test that picks an option with Home and ArrowDown passes on the Linux CI runner and fails on the devbox: the select keeps "Bitte wählen".
- **Cause:** On macOS, headless Chromium opens the select popup on ArrowDown and does not move the value; on Linux the arrows change the value directly.
- **Fix:** Pick an option by keyboard through type-ahead: focus the select and type the option's label (`chooseOption` in `app/packages/e2e/tests/accessibility/keyboard/keyboard.ts`), which works on both, and assert the value afterwards.
- **Can it become a gate?** No: it is a platform difference of the browser, and the helper already covers it.
- **Source:** Issue #1720, PR #2319.

## PF-045 A control that turns `disabled` while it saves drops the keyboard focus

- **Symptom:** A switch or select that saves at once announces "Gespeichert.", but the focus is on the page body afterwards; a second Space does nothing. A focus test right after the key press can still pass in jsdom.
- **Cause:** The browser moves the focus away from an element that becomes `disabled`, so `disabled={saving}` on the focused control sends it to BODY. jsdom does the same, but only on its next rendering tick (about 16 ms), so an immediate `document.activeElement` check races it.
- **Fix:** Mark a control that saves in place as busy with `aria-disabled={saving || undefined}` (look: `BUSY_LOOK` in `shared/lib/utils.ts`) and drop a press while busy in its handler or by the saver's busy guard; keep `disabled` for controls that do not hold the focus during the save. In the test, wait a rendering tick before the focus check and check again after the save resolves and after a second key press.
- **Can it become a gate?** No: whether a control holds the focus while it saves needs judgment; the tests of each such control pin it.
- **Source:** Issue #2317 (US-QS-32), PR #2356.

## PF-046 A ticket lead that starts its implementer in the background hands back before the work is done

- **Symptom:** The ticket lead reports to the orchestrator while its implementer still runs; the implementer's later commits go unreviewed, the PR stays a draft, or the work is lost when the session ends.
- **Cause:** `ticket-lead.md` said to start the implementer "in the background". A background subagent's result arrives as a later notification, and the lead's turn ended (and handed back) before it came.
- **Fix:** A ticket lead starts its implementer and every specialist with `run_in_background: false` and never hands back while a subagent of its own runs (`.claude/agents/ticket-lead.md`, step 1).
- **Can it become a gate?** No: whether a subagent still runs is not visible to a check after the hand-back; the agent definition carries the rule.
- **Source:** Three incidents on 2026-11-20 (issues #2322, #2318), issue #2363.

## PF-047 A repeat-guard key scope that names the request body brings back the content comparison and the double write

- **Symptom:** After a lost answer, a keeper edits a form and taps again, and the server writes a second record (a second plant, a second measurement). Or a silent background write succeeds and frees a held create key, and the next tap creates the record twice.
- **Cause:** The scope of a held key (`{target, action}` in `shared/data/write-action/repeat-key.ts`) was built from the body (`create:${JSON.stringify(input)}`). An edited body then counts as a new action with a fresh key, which is the content guess that `openKeys` made. Creates shared the `account` target with silent marks, so any success on `account` freed their keys.
- **Fix:** The action names the operation only: never body content, and only a discrete chosen value for a set-state write. Creates and appends carry `adds` and their own `new:<entity>` target, and keep the key on `idempotency.key_conflict`. Silent writes use a key per send and free nothing. Daily appends name the local day. The test next to `repeat-key.test.tsx` fails on `JSON.stringify` inside `entityKey(`/`accountKey(`.
- **Can it become a gate?** Partly: the grep test catches a body serialised inside the call, but not one built into a variable first. Which class a write belongs to needs judgment.
- **Source:** Issue #1432 (US-QS-03, US-QS-07), PR #1789: rounds 3 to 5 of the review.

## PF-048 A row with `overflow-hidden` in a flex column shrinks to a hairline

- **Symptom:** At 200 % text the rows of a fit-paged list are 2 to 30 px high and only the pager shows; at 100 % on a small window the rows are cut to a third, and the one-screen gate still passes because the cut rows fit.
- **Cause:** `overflow: hidden` (here `[&>li]:overflow-hidden` of `ROWS_OF_GROUP`) turns a flex item's automatic minimum height into 0, so the default `flex-shrink: 1` squeezes it below its content when the list is shorter than its rows. The fit measure then reads the squeezed row and never recovers.
- **Fix:** A row of a flex list that clips its content carries `shrink-0` (`ScrollEntries` sets it on every row and placeholder since PR #2367). When the room is shorter than one whole row, the frame scrolls or the layout gives the room back; never let the row shrink.
- **Can it become a gate?** Partly: a measurement that every row of a list is at least its `scrollHeight` could join the one-screen gate; until R1 a new gate needs a finding that asks for it (E-30).
- **Source:** Issues #2315 and #2316 (US-QS-32), PR #2367; earlier local fixes #2272 and #2293.
