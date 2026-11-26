# Report-only run of the official lint rules of the stack and squawk (US-QG-01)

As of: 2026-11-26 · Issue 2511 · Story: US-QG-01 (find errors early and locally) · Report only. No gate, config, baseline or dependency changes. The only committed output is this record.

## Summary

- **No check found a defect that a keeper would see.** The checks gave 2,000+ hits in tests and 300+ in product code. After triage, the hits are noise, style, or conflicts with a project rule. No bug issue was filed (the one real finding, a `useCallback` that never memoizes, has no effect a keeper can see: see the check 2 table).
- **Hooks (check 1):** 198 hits in 79 files, 168 in product code. 21 `exhaustive-deps` hits and 0 inline disables show that the repo does not use the classic rules today. Almost all hits are false positives of the React Compiler rules. They belong to the compiler that the owner decided not to enable (spike 2026-11-20). Proposal: do not gate the compiler rules; the owner decides whether to gate only `rules-of-hooks` and `exhaustive-deps` (0 and 21 product hits).
- **TanStack Query (check 2):** 1 hit. Proposal: gate with an empty baseline (cost 0.7 s).
- **Storybook (check 3):** 0 hits. Proposal: gate with an empty baseline, or drop (nothing to catch today).
- **squawk (check 4):** 1,088 hits in 116 files over 16 rules, 0 on a new-style migration that squawk is right about. 7 of the rules conflict with how the project applies migrations (one transaction per file, forward-only, never edited). Proposal: drop as a gate; at most run it on new migrations with a short rule list.
- **Information checks (check 5):** every plugin is noise-heavy as shipped. `no-floating-promises` on `e2e` has 0 hits. The rest: drop, or take single rules (see below).

## Method

- Machine: Mac Mini devbox, Node v26, ESLint 10.15.0 and TypeScript 6.0.3 (the versions of `app/package.json`), `origin/dev` at `1de52a43`.
- Plugins were installed in a scratch directory outside the repo. A temporary flat config there (parser `typescript-eslint`, JSX on, one plugin per run) was passed with `--no-config-lookup -c`. The repo's own rules were off, so the lint time added is the whole time of a run minus the time of a run with no rules (2.9 s over `packages/web/src`, 1,304 files; parse only). The runs held the heavy lock (`make heavy RUN="…"`).
- `Definition for rule … was not found` messages for the rules of the repo's own inline disables are dropped from all counts.
- "Product" means files that are no test and no story. A hit is **real** when a keeper, or an operator, could see the effect; **noise** when the rule is wrong for the code or the code is right; **conflict** when the rule disagrees with a project rule or an owner decision. Both sides of every conflict are named here and not settled (rules of the ticket).

| #   | Check                                                                                            | Version        |  Hits |      Files | Lint time added                                          |
| --- | ------------------------------------------------------------------------------------------------ | -------------- | ----: | ---------: | -------------------------------------------------------- |
| 1   | `eslint-plugin-react-hooks`, `configs.flat.recommended`                                          | 7.1.1          |   198 |         79 | +11.1 s (14.0 s in all)                                  |
| 2   | `@tanstack/eslint-plugin-query`, `flat/recommended`                                              | 5.108.4        |     1 |          1 | +0.7 s                                                   |
| 3   | `eslint-plugin-storybook`, `flat/recommended`                                                    | 10.6.9         |     0 |          0 | about 0 s (Storybook itself is 10.6.7)                   |
| 4   | `squawk-cli` over `app/packages/db/migrations`                                                   | 2.74.0         | 1,088 | 116 of 120 | 0.4 s (120 files in one call)                            |
| 5a  | `eslint-plugin-testing-library` (`flat/react`) and `eslint-plugin-jest-dom` (`flat/recommended`) | 7.16.3, 5.11.0 | 7,974 |        351 | +1.6 s                                                   |
| 5b  | `@vitest/eslint-plugin`, `recommended`, all packages                                             | 1.6.28         |   169 |        100 | 6.1 s over 2,597 files                                   |
| 5c  | `eslint-plugin-jsx-a11y`, `flatConfigs.recommended`                                              | 6.10.2         |    36 |         26 | +3.4 s                                                   |
| 5d  | `@typescript-eslint/no-floating-promises` on `packages/e2e`                                      | 8.74.0         |     0 |    0 of 66 | 1.2 s in all (type information from the project service) |

## Check 1: react-hooks 7, `recommended`

Hits per rule (product / test and story):

| Rule                  | Product | Test, story | Sorted as                                   |
| --------------------- | ------: | ----------: | ------------------------------------------- |
| `refs`                |     118 |           4 | noise                                       |
| `exhaustive-deps`     |      21 |           0 | noise (20), conflict-free, see below        |
| `immutability`        |      14 |          11 | noise                                       |
| `set-state-in-effect` |      13 |           0 | style                                       |
| `globals`             |       0 |           9 | noise (tests set `globalThis` on purpose)   |
| `rules-of-hooks`      |       0 |           7 | noise (story `render` functions call hooks) |
| `use-memo`            |       1 |           0 | style                                       |

- **`refs` (118, product).** All say "Cannot access refs during render". The cases read are a ref object that a hook returns and the component hands to a `ref=` prop (`ref={f.box}` in `app/flows/add-plant/add-plant.tsx:93`, `ref={props.rootRef}` in `shared/lists/object-row/object-row.tsx`). React allows that. Other hits sit in `sheet-panel.tsx`, `title-row.tsx`, `form-notices.tsx`, `onboarding-wizard.tsx`. Noise: a limit of the compiler analysis, not a defect.
- **`exhaustive-deps` (21).** 15 are `keys` of `useRepeatKey()` (`shared/data/write-action/repeat-key.ts`): the hook returns a `useMemo` object, so it is stable; the rule cannot know. Examples: `use-archive.ts:41`, `use-notes.ts:47`, `match.tsx:37`. Others leave a value out on purpose: `route-focus.tsx:156` (`pathname` comes with `key`), `app.tsx:110` (`s.token` instead of `s`), `use-addressed-form.ts:57` (`kind` is a literal at each call site), `load-more.tsx:68` (refs), `plan-layer.tsx:81` (`planning.reset` instead of `planning`), `keeper-style.tsx:120`, `create-form.tsx:144`, `layer-sheet.guard.tsx:185`. None shows for a keeper today. The repo has 0 `eslint-disable … react-hooks` comments, so a gate would need a baseline of 21 or a fix of each.
- **`immutability` (14 product).** Hooks that write into ref objects or arguments by design (`layer-sheet.guard.tsx`, `use-form-address.ts`, `use-form-history.ts`) and a `useCallback` that calls itself later (`wish-to-specimen.ts:53`, "accessed before declared"). Noise.
- **`set-state-in-effect` (13).** The pattern "reset a state when a flag changes" (`wish-form.tsx:51`, `deletion-card.tsx:69`, `use-sheet-height.ts:114`), and the timer state machine of `useHeldLoader` (`delayed-skeleton.tsx:118`). The React docs call it a smell (one more render). It works and no keeper sees it. Style.
- **`rules-of-hooks` (7, stories).** `render` functions of stories call hooks (`load-more.stories.tsx:48`, `layer-sheet.states.stories.tsx:41`, …). Storybook allows that. Noise.
- **Real defects:** none.
- **Conflicts with a project rule:** the rules `refs`, `immutability`, `globals`, `set-state-in-effect` and `use-memo` are the rules of the React Compiler. The spike of 2026-11-20 (issue 2300) recorded the owner decision to evaluate and not to enable the compiler; its record already counts 146 findings in 55 files for these rules. Gating them means a lint wall for a tool the project does not use. The classic rules (`rules-of-hooks`, `exhaustive-deps`) have no conflict.
- **Proposal:** "drop" for the compiler rules. For the two classic rules the choice is "gate with a shrinking baseline" (21 `exhaustive-deps` product hits, 0 `rules-of-hooks` hits in product code) or "drop". The rules also need the story-file override for `rules-of-hooks`. Owner decision.

## Check 2: TanStack Query, `flat/recommended`

| Rule                               | Hits | File                               | Sorted as                    |
| ---------------------------------- | ---: | ---------------------------------- | ---------------------------- |
| `@tanstack/query/no-unstable-deps` |    1 | `shared/request/use-request.ts:82` | real, no effect for a keeper |

- `const retry = useCallback(() => void q.refetch(), [q])`: `q` (the result of `useQuery`) is a new object in every render, so the `useCallback` never returns the same function. A consumer that memoizes on `retry` re-renders anyway. The result is the same as without the `useCallback`; no screen, no request and no text changes for a keeper. It is a defect of the code, not of the product, so no bug issue was filed (a bug of priority P1 by the table would not fit it). A one-line follow-up fits the ticket of the gate.
- Rules that found nothing: `exhaustive-deps` (query keys), `no-rest-destructuring`, `stable-query-client`, `no-void-query-fn`, `infinite-query-property-order`, `mutation-property-order`.
- **Conflicts with a project rule:** none.
- **Proposal:** gate with an empty baseline (after the one fix). Cost 0.7 s.

## Check 3: Storybook, `flat/recommended`

- 67 story files and `.storybook/` linted (10 rules active on a story file, checked with `--print-config`). 0 hits. The rule for `.storybook/main.ts` (`no-uninstalled-addons`) is not reached by the flat config in the dot folder and needs its own `files` entry.
- **Conflicts with a project rule:** none found. Not checked: the story conventions of `docs/guides/reference/design-system.md` (another ticket edits it); a rule such as `storybook/prefer-pascal-case` or `default-exports` would need a check against them before a gate.
- **Proposal:** "gate with an empty baseline" is free and catches a later wrong import or title, but nothing in this run asks for it under E-30; "drop" until a story defect shows up.

## Check 4: squawk on the migrations

Version 2.74.0, default rules, the 120 files of `app/packages/db/migrations`, no config. 1,088 hits in 116 files. The applied migrations (all of them) count as information; none is edited.

| Rule                                                    |       Hits |                        Files | Sorted as                                                                                                                            |
| ------------------------------------------------------- | ---------: | ---------------------------: | ------------------------------------------------------------------------------------------------------------------------------------ |
| `prefer-robust-stmts`                                   |        473 |                          103 | conflict: `IF NOT EXISTS` on a migration that runs once                                                                              |
| `require-lock-timeout`, `require-statement-timeout`     |  116 + 116 |                          116 | conflict (runner owns the transaction)                                                                                               |
| `require-concurrent-index-creation`                     |         86 |                           43 | conflict: impossible in a transaction; most are indexes on a table created in the same file                                          |
| `renaming-column`, `renaming-object`, `renaming-table`  | 76, 74, 11 | 1 (`0012_english_names.sql`) | noise: the one rename migration of the project (ADR 0004)                                                                            |
| `constraint-missing-not-valid`                          |         52 |                           27 | noise: `check` on a new column of a small table                                                                                      |
| `ban-drop-constraint`                                   |         23 |                            8 | noise: part of an expand step                                                                                                        |
| `prefer-bigint-over-int`, `prefer-bigint-over-smallint` |      18, 7 |                           14 | noise: small bounded values (counts, ranks)                                                                                          |
| `adding-foreign-key-constraint`                         |         12 |                           11 | noise: tables of one keeper's size                                                                                                   |
| `ban-drop-not-null`                                     |         10 |                            6 | noise: the documented expand step (`0116_catalog_soft_leaf_unknown.sql`)                                                             |
| `ban-drop-function`                                     |          9 |                            2 | noise: `drop function` and `create function` in one transaction (`0120_swap_handover_recipient_name.sql`) keeps the old call working |
| `disallowed-unique-constraint`                          |          4 |                            4 | noise                                                                                                                                |
| `ban-drop-default`                                      |          1 |                            1 | noise                                                                                                                                |

- Over the last 20 migrations (0100 to 0120): 40 `prefer-robust-stmts`, 19 `require-lock-timeout`, 19 `require-statement-timeout`, 13 `require-concurrent-index-creation`, 5 `constraint-missing-not-valid`, 2 `ban-drop-constraint`, 2 `prefer-bigint-over-int`, 1 each `ban-drop-default` and `ban-drop-not-null`.
- **Real defects:** none. One of the timeouts could matter: `migrate()` sets no `lock_timeout`, so a migration waits for a lock as long as the other transaction runs. It is one change in the runner (`app/packages/db/src/kernel/migrate.ts`), not a rule for each file. Not a defect today: the one keeper and one app instance.
- **Conflicts with a project rule** (both sides, not settled):
  - `require-concurrent-index-creation`: squawk wants `create index concurrently`. Skill `db-migration` and `migrate.ts`: each migration runs in its own transaction, where `concurrently` is refused by PostgreSQL.
  - `prefer-robust-stmts`: squawk wants `if not exists` and `if exists`. The runner applies a file once and checks its checksum; a new table that already exists is an error the project wants to see (P-10).
  - `require-lock-timeout`, `require-statement-timeout`: squawk wants `set lock_timeout` in each file. The project has no such line in any file; a runner-level setting would be the single place.
  - `renaming-*`: `0012_english_names.sql` (ADR 0004) renames everything on purpose; `db-migration` says "no rename in one step" for later migrations. The rules agree with the skill for new files.
- **Proposal:** "drop" as a gate over the history. If a gate is wanted, run squawk on new migration files only (`git diff --name-only origin/dev`) with `--exclude` for the four conflicting rules; the remaining rules (`ban-drop-column`, `adding-not-nullable-field`, `ban-char-field`, …) found nothing. Owner decision.

## Check 5: information only

### 5a testing-library and jest-dom

7,974 hits, 7,960 in tests, 351 files. Product code: 14 (`testing-library/*` in a test helper outside a `.test.` file name). By rule, the largest: `jest-dom/prefer-in-document` 3,114, `testing-library/no-node-access` 1,885, `jest-dom/prefer-to-have-text-content` 864, `jest-dom/prefer-to-have-attribute` 568, `jest-dom/prefer-to-have-class` 335, `testing-library/no-manual-cleanup` 333, `jest-dom/prefer-focus` 317, `testing-library/no-container` 243, `testing-library/render-result-naming-convention` 163.

- Noise and style: the tests use `expect(x).toBeTruthy()` and `getAttribute(…)` on purpose; the project does not load `@testing-library/jest-dom` matchers (no `toBeInTheDocument`).
- `no-manual-cleanup` (333): the tests call `cleanup()` themselves.
- `await-async-events` (2, `wishlist-page.test.tsx:686`): a false positive, the variable is named `save`.
- Others (`no-unnecessary-act` 8, `prefer-find-by` 12): style.
- **Real defects:** none.
- **Conflicts with a project rule:** adopting the jest-dom rules requires a new dependency and a new matcher setup in the test files; the tests are named with story IDs and use plain `expect`. No project rule forbids it; it would be a rewrite of about 7,000 lines.
- **Proposal:** drop.

### 5b @vitest/eslint-plugin, `recommended`

169 hits over all packages (1 product, 168 tests), 100 files.

- `valid-expect` 79: "Expect takes at most 1 argument". The tests pass a message as second argument (`expect(v, "why")`), which Vitest allows. False positive of the default option.
- `expect-expect` 59 (57 web): tests that assert through a helper (`expectOneLoadingStatus`, `expectTitleInBar`). A rule option (`assertFunctionNames`) fits; noise as shipped.
- `no-conditional-expect` 21, `no-standalone-expect` 7 (`reads.test.ts:351`, `discover.test.ts:317`): asserts in helper functions. Style.
- `valid-title` 1 (`s3-store.test.ts:57`), `no-commented-out-tests` 1, `prefer-called-exactly-once-with` 1, one unused `eslint-disable`.
- **Real defects:** none found. The one commented-out test is information for its owner.
- **Conflicts with a project rule:** test titles carry a story ID (`P-06`); the plugin's title rules (`valid-title`, `prefer-lowercase-title`) are not in `recommended` and would conflict if added.
- **Proposal:** drop.

### 5c jsx-a11y, `recommended`

36 hits (30 product), 26 files. The project has its own gates for accessibility (`make a11y-routes`, the checks in `accessibility-check`).

- `label-has-associated-control` 20: wrapped labels around a custom control (`rhythm-pauses.tsx:77`, `clients-section.tsx:65`). The label is associated by its wrapper; the rule does not know the custom component. Noise.
- `no-autofocus` 6: the sheet and layers move the focus on purpose (`sheet-panel.tsx:142`). Conflict: SG-SHEET and the focus rules of the style guide want the focus in the sheet; the rule forbids `autoFocus`.
- `no-noninteractive-tabindex` 4: scroll regions made keyboard-reachable on purpose (`scroll-region.tsx:18`). Conflict with accessibility (a keyboard user must reach a scroll region).
- `interactive-supports-focus` 2, `no-static-element-interactions` 2, `no-noninteractive-element-interactions` 2: the key handler of the deck (`deck-view.tsx:160`), the menu (`menu.tsx:102`) and tabs roving focus (`tabs.tsx:151`). The element handles keys for children (bubbling). Noise.
- **Real defects:** none. The literal German text found in `rhythm-pauses.tsx:77` is a known baseline entry of `ui-text/no-literal-text`.
- **Proposal:** drop.

### 5d no-floating-promises on e2e

0 hits in the 66 files of `packages/e2e` (`.ts`, the type-aware rule through the project service, 1.2 s in all). Nothing is left un-awaited in the e2e tests. Real defects: none. Conflicts: none. Proposal: gate with an empty baseline only if the owner wants it for the cost of one rule; the repo has no incident that asks for it (E-30), so "drop" until one does.

## Decisions for the owner

1. **Which checks go forward to a gate PR.** The record proposes: TanStack Query with an empty baseline (after one line is fixed); Storybook: drop until a defect shows up (or the same, free); hooks: only `rules-of-hooks` and `exhaustive-deps`, with a baseline of 21, or drop; squawk: drop as a gate over the history, optionally on new migrations with four rules excluded; the rest of check 5: drop, apart from `no-floating-promises` (0 hits, free, no incident: drop or empty baseline).
2. **Rules that conflict with a project rule: switch the rule off, or change the project rule.** The record proposes to switch off: the React Compiler rules (owner decision of 2026-11-19, not enabled), `no-autofocus` and `no-noninteractive-tabindex` (focus rules of the style guide and the keyboard path), `require-concurrent-index-creation` and `prefer-robust-stmts` (one transaction per migration, P-10). No project rule changes.
3. **A lock timeout for the migration runner** (`migrate.ts`). Not a rule of the tool; a runner change that `require-lock-timeout` points at. A gate-file question (`migrate.ts` is not a gate file, but the migration tests are). The owner says whether a ticket is wanted.

## Raw data

The raw JSON of each run stayed in the session scratchpad; the counts above come from it. To repeat a run: install the plugin in a scratch directory, put one plugin in a flat config with `typescript-eslint` as the parser, and run the repo's `eslint` with `--no-config-lookup -c <config> -f json packages/web/src` under `make heavy RUN="…"`; for squawk: `squawk app/packages/db/migrations/*.sql`.
