# Playwright agent CLI and Storybook MCP (issue 2513)

As of: 2026-11-26 · Issue 2513 · Enabler (epic DEV) · Spike. Nothing in `.claude/`, `AGENTS.md`, `CLAUDE.md` or the agent definitions changes; no config, dependency or `.mcp.json` is committed. The decisions are the owner's (see "Owner decision needed").

## Summary

- **Playwright CLI works and gives a cheap look at one screen, but it is not cheaper for the device recheck.** One screen at one device costs about 4 calls. The full matrix of a recheck (3 devices, light and dark, 100 % and 200 % text, 2 screens = 24 states) is one script of 1.6 kB and one run of 29 s with the current way; with the CLI it is roughly 120 to 170 calls, each one an agent turn. The CLI is better for exploring an unknown page (a 3 kB accessibility snapshot per screen) than for the fixed matrix.
- **Storybook MCP works** (8 tools, `docs-list` finds 60 components, `docs-show` gives props and stories, `test-run` runs a story test with the a11y check), but it needs `storybook` 10.6.9 (the repo has 10.6.7), `@storybook/addon-vitest`, `@vitest/browser-playwright` and a vitest project config. The same tools also run as `npx storybook tools …` **without a dev server and without MCP**, which removes the 22 kB tool list from the context and the need for a `.mcp.json`.
- **Cloud session: not verified** (no cloud session here). The MCP endpoint is the Storybook dev server, so it needs the server in the same container; the CLI form needs none for `docs` and `test run`. Both need the Storybook packages and, for story tests, a Chromium in that container.
- Installers were run in a scratch directory only; what they write is listed below.

## 1. Playwright CLI

Version `@playwright/cli` 0.1.25, installed with `npm i` in a scratch directory (it brings `playwright-core` **1.66.0-alpha-2026-11-18**; the repo pins `playwright` 1.65.1).

### What `playwright-cli install --skills` would write

Run in an empty scratch directory (`git init`), it wrote:

- `.claude/skills/playwright-cli/SKILL.md` (16 kB, about 4 000 tokens) and `.claude/skills/playwright-cli/references/` (10 files: element attributes, playwright tests, PR attachments, request mocking, running code, session management, storage state, test generation, tracing, video recording);
- `.playwright/cli.config.json` (`browserName: chromium`, `channel: chromium`);
- a line `.playwright-cli/` in `.gitignore`.

While it runs, each session writes `.playwright-cli/` in the working directory (snapshots as `.yml`, console logs). `state-save` writes cookies and tokens to a file (checked: `AUTH_SESSION_ID` is in it), so the file is a credential. Its own skill says the output "may contain credentials".

### Measurement

Setup: this worktree, `make dev` (demo seed, profile `states`) under `make heavy`, account `test2`, Keycloak sign-in through the real page. Device: `--device "iPhone 15"` (393 px). Tokens are output bytes divided by 4; they leave out the model's own call text and the context that every extra turn re-reads. Machine time is the sum of the commands.

| Step                                                                                             | Calls |                      Output | Machine time |
| ------------------------------------------------------------------------------------------------ | ----: | --------------------------: | -----------: |
| Open, sign in (open, snapshot, click, 2 fills, click, snapshot)                                  |     8 |                      5.2 kB |         ~4 s |
| 2 screens (`/friends`, `/account`) x light and dark: goto, overflow `eval`, screenshot, snapshot |    19 | 15.6 kB (4 snapshots 13 kB) |          8 s |
| 200 % text (`run-code` with `addInitScript`), 2 screens                                          |    10 |                      2.0 kB |          5 s |
| Other width (`resize 424 920`), 1 screen                                                         |     3 |                      0.3 kB |         ~2 s |

One slice (one device, two screens, light, dark, 200 %) is about 40 calls, 23 kB of output (about 6 000 tokens) and 20 s of machine time. All screenshots were read with the Read tool as well (about 450 image tokens each at 393 px).

The current ways, same screens, same build:

| Way                                                                                                       | Calls | Output                | Time | What it covers                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ----: | --------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `make one-screen SCREEN=friends` (the gate, pinned container browser)                                     |     1 | 79 test lines, 3.4 kB | 44 s | Pass or fail at the gate sizes only; no 393/424/430 px, no screenshot. Used as a check, not as the device recheck.                                                             |
| Ad-hoc Playwright script as `device-checker` writes it (`recheck.mjs`, 1.6 kB, about 400 tokens to write) |     1 | 24 lines, 1.2 kB      | 29 s | All 24 states: iPhone 16 (393), OnePlus 15R (424), large (430) x light, dark x 100 %, 200 % x `friends`, `account`; overflow value and one PNG each. Overflow was 0 in all 24. |

The CLI for the same 24 states needs a new session per device, scheme and text size (12 contexts) or `state-load` plus `run-code` each time: about 120 calls with a saved state, about 170 with a sign-in each time (estimate, not run in full). At 5 to 10 s of agent time per call that is 10 to 20 minutes against about 1 minute for the script, and every call re-reads the whole context.

What the CLI does better:

- A snapshot (accessibility tree with refs, 3.1 to 3.5 kB per screen) is a cheap text view for `design-judge` and `a11y-auditor`; the script gives only a PNG.
- Opening an unknown flow (a sheet, a dialog) by `click <ref>` needs no script.
- `--device` presets, `set-color-scheme`, `resize`, `requests`, `console`, `tracing-start`, `video-start` are one word each.

What it does worse here:

- No preset for 424 or 430 px; `resize` works but the preset flags (touch, scale) stay those of the iPhone.
- 200 % text has no command; it needs `run-code` with `addInitScript` and a reload (it worked: root font 32 px).
- It brings its own Playwright (alpha 1.66) next to the pinned 1.65.1; `make playwright-version` pins the one of the gates (ADR 0010). Its browser is the host Chromium, not the pinned gate container.

## 2. Storybook MCP and `npx storybook skills`

Run in this worktree with `npm i --no-save` (nothing in `package.json` or the lockfile changed), `main.ts` edited and reverted, and a temporary `vitest.config.ts` and `.storybook/vitest.setup.ts` removed afterwards. Dev server through `make heavy`, stopped after use.

### What adoption needs

- `storybook`, `@storybook/react-vite`, `@storybook/addon-a11y`, `@storybook/addon-docs` from 10.6.7 to 10.6.9 (`@storybook/addon-mcp` 10.6.9 has the peer `storybook ^10.6.9`).
- New dev dependencies `@storybook/addon-mcp`, `@storybook/addon-vitest`, `@vitest/browser-playwright` (and `@vitest/browser`), all pinned.
- `.storybook/main.ts`: two more addons. `addon-mcp` switches `features.componentsManifest` on by itself.
- A vitest project with the `storybookTest` plugin and a browser (`vitest.config.ts`), and `.storybook/vitest.setup.ts` (`setProjectAnnotations`). The repo has no `vitest.config.ts`; its test block is in `vite.config.ts`.
- `.mcp.json` only for the MCP form: `http://localhost:6006/mcp`.
- Gate files touched on adoption: `package.json`/lockfile (dependency pins), knip config, `.storybook/` and the vitest config if the owner counts them as gate configs, and `.claude/` for any agent change.

### Measurement (MCP over HTTP, Storybook 10.6.9 dev server)

| Call                                                                                | Result                                                                                                                                                                  |                                                               Output |               Time |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------: | -----------------: |
| `initialize`                                                                        | instructions text                                                                                                                                                       |                                                               2.0 kB |              24 ms |
| `tools/list`                                                                        | 8 tools: `stories-preview`, `get-storybook-story-instructions`, `stories-changed`, `stories-find-by-component`, `test-run`, `docs-list`, `docs-show`, `docs-show-story` | 21.9 kB (about 5 500 tokens, resident while the server is connected) |               4 ms |
| `docs-list`                                                                         | 60 components with id and first sentence (German product names such as Freunde, Heute, Konto among them)                                                                |                                          6.3 kB (about 1 600 tokens) |              0.7 s |
| `docs-show` x 3 (`lists-objectrow`, `data-display-tabs`, `shared-segmentedcontrol`) | description, first 3 stories with code, other story ids, props with doc comments                                                                                        |                                                     3.9, 2.8, 2.8 kB |         0.6 s each |
| `test-run` one story (`lists-objectrow--one-line-name`)                             | 1st call: failed (`Failed to fetch dynamically imported module`, Vite re-optimising); 2nd: failed after 60 s (vitest error); 3rd: **passed**, 0.15 kB                   |                                                        0.1 to 0.6 kB | 2.7 s, 60 s, 0.6 s |

The first two `test-run` calls were cold-start failures; a lead would see two red results before the first green one.

### The same tools without MCP

`npx storybook tools <toolset> <tool>` (found in 10.6.9) runs the tools from the CLI. `docs list`, `docs show`, `docs show-story`, `stories changed`, `stories find-by-component` and `test run` are marked `[local]` and need no dev server; `stories preview` and `review create` need one. Measured with the dev server stopped:

| Command                                                                                                       |                                                                    Output |                         Time |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------: | ---------------------------: |
| `npx storybook tools docs list`                                                                               |                                                                    6.3 kB |                        1.5 s |
| `npx storybook tools docs show --id lists-objectrow`                                                          |                                                                    3.7 kB |                        1.5 s |
| `npx storybook tools test run --input '{"stories":[{"storyId":"lists-objectrow--one-line-name"}]}'` (2nd run) | 3.3 kB, mostly a Vite config warning from my temporary `vitest.config.ts` | 3.1 s (4.7 s the first time) |

With this form there is no tool list in the context and no `.mcp.json`; an agent runs it from Bash.

### Skills (`npx storybook skills`)

`npx storybook skills [id]` only prints (nothing is written): `stories` (the workflow), `write-story`, `setup`. `--all` prints 30.9 kB (523 lines, about 7 700 tokens). The `setup` skill is for projects without stories and does not apply (this one has 60 documented components).

### Cloud session

Not tested: this session is the devbox. From the code: the MCP endpoint is served by the Storybook dev server (`/mcp` on the dev port), so an agent in a cloud container must start `storybook dev` in that container first (Vite, about the memory of the app dev server); `.mcp.json` would point at `localhost` of that container. The CLI form needs no server for `docs` and `test run`. Story tests need a Chromium (`@vitest/browser-playwright`), so the container needs the Playwright browser download host in its allowlist. Checking this needs a cloud session with `make worktree`, `make setup` and the adopted dependencies; it cannot be done before adoption, because the packages are not installed.

### Is #2510 (`make components`) still needed if this is adopted?

Partly. `docs list` / `docs show` cover name, path-independent id, story ids, description and props, so the "brief gets the list of existing components" part of #2510 is covered, with no code of ours. They do **not** cover: the path of the component file, the inventory line in `design-system.md`, and a warning for a component **without a story** (a component without a story is not in the manifest at all, which is the case that makes agents build it twice). The `reference-check` gate and `docs/guides/reference/design-system.md` stay either way. Proposal: shrink #2510 to the warning list (component without story or inventory line) and let the brief use `npx storybook tools docs list`; or close it if the owner accepts that only components with stories count.

## 3. Conflicts with project rules

Listed side by side; none is settled here.

| #   | Tool says                                                                                                                          | Project rule                                                                                                                                                                                                                                            | Where                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | `stories` and `test run` skills: "never run a package.json test script", story tests only through `storybook tools test run`.      | Gates run through `make` (`make gates`, `make ci`, `make heavy`); `AGENTS.md` "Before you say done". A story test run is no gate.                                                                                                                       | `npx storybook skills --all`  |
| 2   | "ALWAYS write a Storybook story for any component written."                                                                        | Stories live next to the component (TE-18, ADR 0007 decision 2); the list of components without a story is part of #2510. No rule says "every component".                                                                                               | skill `write-story`           |
| 3   | `docs-show` examples print imports twice: `from '@pflanzendex/web'` and `from '@/shared/...'`.                                     | AB-2: API and web import `core` only through `@pflanzendex/core`; the `@/` alias is the web's own. The barrel `@pflanzendex/web` is a Storybook artefact.                                                                                               | `docs-show` output            |
| 4   | Story code with literal German text (`title="Clip"`, `meta="Efeutute · Zone 2"`) is shown as the usage example.                    | German UI text lives in `<feature>.de.json` read through `texts()`; ESLint `ui-text/no-literal-text` (FR-QG-26). Stories may carry fixtures; an agent copying the example into a view would break the rule.                                             | `docs-show` output            |
| 5   | Skill `setup`: "Discover with Glob/Grep/Read, never `ls`, `find`, `cat`, `grep` via shell"; "do not use `npx`".                    | Agents here run with Bash only (no Grep tool in `ticket-lead` sessions); the hook refuses recursive `grep` (issue 2354); commands go through `make`. Does not apply when `setup` is not used.                                                           | skill `setup`                 |
| 6   | Skill `stories`: end every answer with a review section from `storybook tools review create` (a heading with an emoji and a link). | Ticket leads report in at most 8 lines and the PR body follows `.github/pull_request_template.md`. `review create` needs a running Storybook.                                                                                                           | skill `stories`               |
| 7   | "Run `test run` after EVERY component or story change"; "never report completion while story tests are failing".                   | The one-screen, a11y-routes and `ds-snapshots` gates already run the stories in CI; `smoke.test.tsx` runs through `vitest` (jsdom). A second runner (browser mode) exists next to it.                                                                   | skill `write-story`           |
| 8   | Test naming: stories and play functions are named by scenario ("Error state after failed submit").                                 | Tests carry the story ID (`US-…`, P-06, `AGENTS.md`). A story id such as `lists-objectrow--one-line-name` is not a story ID of the spec; names in the catalog already mix both.                                                                         | skill `write-story`           |
| 9   | "Fix a11y violations automatically (ARIA, labels, headings, keyboard)"; ask first for contrast, sizes, spacing.                    | Style guide and tokens decide colour, size and spacing (`style-guide.md`, `design-judge`); the `a11y-auditor` files findings as P1 bugs and never edits code. The split "ask first for visual" matches; "fix automatically" does not match the auditor. | skill `write-story`           |
| 10  | No placement rule found: the tools only read; the skills that create files name no folders. Not a conflict so far.                 | Layout gate: one folder per component, at most 5 units per directory.                                                                                                                                                                                   | skills `write-story`, `setup` |
| 11  | Playwright CLI skill: `allowed-tools: Bash(playwright-cli:*)`, `playwright-cli install --skills` writes `.claude/skills/`.         | `.claude/` is a gate path; the hook asks a human on the first edit (US-QG-07); no installer may write there (ticket rules). `.playwright-cli/` output is gitignored only by the installer's own line.                                                   | install                       |
| 12  | Playwright CLI brings `playwright-core` 1.66.0-alpha.                                                                              | `playwright` is pinned at 1.65.1 and `make playwright-version` ties the gate container to it (ADR 0010).                                                                                                                                                | `npm ls` in scratch           |
| 13  | Playwright CLI default browser: host Chromium (`channel: chromium`).                                                               | The UI gates run the pinned Playwright container for stable numbers (US-QG-01, issue 2429); the device-checker uses the emulated devices on the host (informational).                                                                                   | `cli.config.json`             |
| 14  | Agent form factors: `device-checker` has tools `Bash, Read, Glob, Grep, ArtifactData, ToolSearch` (no MCP).                        | An MCP server in `.mcp.json` would be a new tool surface for every agent; `.claude/agents/*.md` list tools explicitly.                                                                                                                                  | `.claude/agents/`             |
| 15  | MCP `test-run` and `stories-preview` write to `node_modules/.cache/storybook` and start a Vitest browser run.                      | `make heavy` takes the machine lock for browsers and builds; an agent calling MCP does not take it. A `make`-wrapped command would.                                                                                                                     | observed                      |

## 4. Proposal

Each point is a proposal for the owner, not a decision.

- **Playwright CLI: keep for manual use (do not adopt in an agent definition).** It does not make the fixed device matrix cheaper (about 120 to 170 calls against one script), it pulls an alpha Playwright next to the pinned one, and its installer writes into `.claude/`. It is useful for a human or a one-off look at an unknown flow. If the owner wants it in `device-checker` or `design-judge` for the snapshot only, use `npm exec` from a scratch directory and never `install --skills`.
- **Storybook: adopt the CLI form (`npx storybook tools docs list|show`, `test run`), not the MCP form.** Same results, no tool list of 22 kB in the context, no `.mcp.json`, no dev server for `docs` and `test run`. How: one PR for the dependency bump to 10.6.9, the three new dev dependencies, the two addons, the vitest project and setup file (gate-file plan needed), then `docs list` in the `ticket-lead` brief step and `test run` in the `implementer` brief for story changes. Conflicts 1 to 3 and 7 need an owner answer first; the skills (`npx storybook skills`) should not be installed or copied, only linked from the brief when needed.
- **Storybook MCP form: drop for now**, and revisit when the cloud session question can be tested.
- **#2510:** shrink to the warning list (component without story or without inventory line) and let the brief use `docs list`; or close it.

## Owner decision needed

1. Playwright CLI: adopt, keep manual, or drop.
2. Storybook tools: adopt as CLI, adopt as MCP, keep manual, or drop; and whether the dependency bump may come as a gate-plan PR.
3. Each conflict in section 3: how to resolve it (especially 1 to 4, 7, 8, 11 and 12).
4. #2510: shrink, keep, or close.

## Not verified

- A cloud session (see above).
- The full 24-state matrix with the CLI (estimated from the slice above).
- `review create`, `stories preview` and `stories changed` (they need the dev server or git state; not run).
- `a11y` output of `test run` (the one story passed; no violation report was produced).
- Real phone: none attached; all runs were on the emulated devices.

## Cleanup

Dev servers, Storybook and Playwright sessions were stopped by PID or `close-all`; the browser session of the CLI was closed. `git status` of the worktree is clean apart from this record; `npm ci` restored `node_modules` after the temporary `--no-save` installs. The scratch directories (CLI install, MCP client script, measuring script) stay in the session scratchpad and are not part of the repo. The local Keycloak realm got the redirect origin of this worktree's dev port (as `make e2e-origin` does for the e2e port).
