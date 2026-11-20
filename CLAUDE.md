# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

The rules for agents (workflow, gates you must not weaken, definition of done) are in `AGENTS.md`, imported above. Playbooks for recurring tasks live in `.agents/skills/` (linked from `.claude/skills/`); path-scoped rules per package, specs and CI files are in `.claude/rules/` (loaded when matching files are touched); the hooks in `.claude/settings.json` enforce the guardrails.

## What this repository is

This repo holds the **specs** (English) and, as decided in E-05 (`docs/specs/product/16-releases-and-decisions.md`), will also hold the **app code under `/app`**. All documentation lives under `/docs`: the two spec sets below and, next to them, the process documentation (principles register, ADRs, runbooks, pitfalls: `docs/guides/principles/`, `docs/adr/`, `docs/guides/operations/`, `docs/guides/pitfalls/`). `app/` holds the TypeScript monorepo skeleton (`core`, `api`, `web`; see `docs/guides/reference/app.md`). All tasks go through the root `Makefile`: `make help` lists them, `make ci` runs every gate (lint, typecheck, architecture boundaries, format, tests, build). There are two spec sets:

| Folder                  | Describes                                                                                                                                                                                                                                                  | Status semantics                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `docs/specs/product/`   | **The product:** the PflanzenDex web app (multi-user, mobile-first PWA, shared species catalog, social, AI assistant). This is the authoritative spec for new work.                                                                                        | Everything ⬜ (planned). Each story also carries a "Prototype" column (✅/🟡 tried in the vault, or `new`). |
| `docs/specs/prototype/` | **The prototype:** the as-is state of a single-user Obsidian vault (`dataviewjs` dashboard, `scripts/pflanzen/`, `post-commit` hook). Its `11`–`13` are superseded by `docs/specs/product/` (see the replacement table in `docs/specs/product/readme.md`). | ✅/🟡/⬜ = implemented in the vault, derived from vault code.                                               |

The vault paths referenced in the prototype specs (`02-Areas/…`, `scripts/pflanzen/…`, `docs/superpowers/specs/…`) are **not in this repo**.

Start with `docs/specs/product/readme.md` (index, conventions, replacement table), then `docs/specs/product/00-product-overview.md` (principles P-01…P-12, domain model, glossary) and `16-releases-and-decisions.md` (release cut R0–R6, open decisions E-nn, non-goals).

## Language

- **English:** everything in the repo: specs, glossary, code identifiers (`account`, `specimen`, `withAccount`, …), database objects, error codes, scripts, workflows, docs, PR/issue templates, labels, branch names, commit messages, PR titles and descriptions (ADR `docs/adr/0004-english-repository.md`).
- **German:** only the text users see in the app UI (kept in message tables: `ERROR_TEXTS` for error codes, one `web/src/<feature>/<feature>.de.json` per feature read through `texts()`; enforced by the ESLint rule `ui-text/no-literal-text` with a shrinking baseline, FR-QG-26) and quoted terms of the vault prototype (`docs/specs/prototype/`, vault paths, original data keys). The app shows the product name as "PflanzenDéx" (owner decision, 2026-11-05); the repo and code name stay "PflanzenDex".
- Never mix languages within one file. When you touch a file that still contains German outside UI texts or quoted prototype terms, translate it completely. Dated records (`docs/records/spikes/`, `docs/records/test-logs/`) are English too; raw `.txt` logs stay as recorded. Applied migrations `0001`–`0011` stay as they are (German history); `0012_english_names.sql` renames everything.

## Spec conventions (keep when editing)

- **New features go into `docs/specs/product/`.** Only touch `docs/specs/prototype/` to correct the description of the vault's actual state.
- Product IDs: `US-<EPIC>-nn`, `FR-<EPIC>-nn`, `DM-<EPIC>-nn`, `NFR-nn`, decisions `E-nn`. Stories taken over from the prototype **keep their prototype ID** so the two can be compared. IDs are never renumbered.
- Product epics: ACC, BES, LIC, PHA, WAC, BEH, WUN, POK, MON, SOZ, EQU, KI, QS, ENT (`17-discover.md`, swipe suggestions from the catalog into the wishlist), ACH (`20-achievements.md`, achievements and rewards for care and growth), TAU (`21-swipe-matching.md`, swipe matching of friends' swap offers against the wishlist), ONB (`22-introduction-and-unlocking.md`, playful introduction and staged unlocking of functions), VAR (`23-variegated-cultivars.md`, variegated cultivars as catalog entries with trade names, facts, prices and reversion warnings), SUB (`24-substrate.md`, components, soil recipes and supports), DEAL (`25-shop-offers-and-sale-alerts.md`, shop offers and sale alerts for wishes).
- The rest of the conventions (technology-neutral specs, Given/When/Then, glossary terms, assumptions, the steps for a new epic): `.claude/rules/specs.md`.

## Git workflow (E-13)

- `main` holds the finished, released product; `dev` holds the current development state. Neither gets direct commits.
- Merging and the `owner-merge` label: AGENTS.md, "Before you say done" 3–4 (ADR 0001, 0005). Squash into `dev`, merge commit from `dev` into `main`, so the PR title must be a Conventional Commit.
- Every change lives on a dedicated short-lived branch (one task, one worktree) and enters `dev` through a pull request. `dev` collects changes until a release; then `dev` goes into `main` through a pull request.
- Commit messages follow Conventional Commits (type and scope from the epics, e.g. `feat(soz)`), `docs:` for documentation. Allowed types and scopes live in `app/config/project/commitlint.config.js`; the PR title is checked the same way because the squash merge turns it into the commit message. Spec status and counters in `docs/specs/product/readme.md` change in the same PR as the code.
- `make setup` activates the Git hooks in `.githooks/`: `commit-msg` (commitlint), `pre-commit` (Prettier and ESLint on staged files), `pre-push` (`make gates`). Never bypass them with `--no-verify`. CI repeats every check anyway.
- `Closes #n` closes the issue only when its PR reaches `main`, the default branch; the board status follows the PR (`project-status.yml`). A PR for a partial step uses `Refs #n` instead.
- The product epic MIG (import from the vault) was dropped; its IDs stay reserved.

## Agent sessions and models

Three roles share the work (owner decision 2026-11-14, issue 2099):

- **Orchestrating session** (**Opus at effort medium**): picks and claims tickets (`make claim`, `make worktree`), sets the PR title and starts one ticket lead per ticket. One lead runs one implementer; the orchestrator adds implementers by the machine's resources (CPU, free RAM, running heavy jobs), and heavy work (UI gates, e2e, Lighthouse, `make ci`) waits on `make heavy-lock` (owner decision 2026-11-14). No hard cap on open PRs; with three open PRs that are all drafts, finish them before claiming more. It takes the owner's decisions and relays them to the leads, and spot-checks each lead's report against the merged head on `dev`. It works a batch of tickets this way; at a natural break (a batch is done, or the context grows long) it suggests `/clear` to the owner, once every open PR's Handoff carries the state, open questions and owner decisions (owner decision 2026-11-09, issue 1747).
- **Ticket lead** (`subagent_type: "ticket-lead"`, Opus; its fixed rules are in `.claude/agents/ticket-lead.md`, so the orchestrator's brief holds only the ticket facts, issue 2101): owns one ticket from the brief to the merge. It briefs the implementer, checks the pushed head and the diff, runs `/code-review` before `make pr` (skill `add-epic-feature`, step 12) and triages each finding, sends the rework, writes the PR body including "Lessons", runs `make pr`, waits for `ci-status`, runs `make merge`, cleans up, and reports to the orchestrator in at most 8 lines. It stops and reports instead of going on for a PR that changes a gate file and for a decision that belongs to the owner. When the orchestrator works a ticket itself, it takes this role. Every PR fills its "Lessons" section; `make pr` refuses it when it is missing, empty or malformed.
- **Implementer and scout:** agent types in `.claude/agents/` next to `ticket-lead`: `implementer` (model `haiku`, effort `xhigh`, owner decision 2026-11-03; edits, commits and pushes) and `scout` (read-only search and measurement). Start them with `subagent_type: "implementer"` or `"scout"`. Their definitions hold the fixed rules (worktree `cd`, no `.env`, commit scope, gate plan, commit and push only), so a brief holds only what is specific to the ticket: worktree, scope, files, done criteria, measurements, story ID, and the gate files it may touch. An implementer writes its full report to a file and replies briefly.
- **Illustrator:** agent type `illustrator` (model `fable`, the most capable model; owner decision 2026-11-20, issue 2361) designs and draws the illustrations (the US-QS-31 motifs, the drawn placeholder of SG-PHOTO-02) as SVG and returns them with a contact sheet in light, dark and forced colours. Drawing is spatial and aesthetic judgment over few, long-lived files, so it gets the strongest model; wiring a motif into its view, its tests and the gates stay with the `implementer`. The ticket lead reviews the contact sheet against US-QS-31 and SG-ILLU before the wiring starts.
- Start an implementer in the worktree that `make worktree` made: name that path in the brief, and never pass `isolation: "worktree"` when the claimed worktree exists (the agent then works outside its claim). A subagent's report can be wrong ("done" with the work unpushed, "every page checked" without the loop): the ticket lead checks `git log origin/<branch>`, the diff and the head's check runs itself.
- Every commit an implementer makes ends with the trailer `Implementer: <model>`; the orchestrator and the ticket lead set none. The issue flow retro (US-DEV-11) reads that trailer to count implementer rework.

## Priority of tickets

Every open story or enabler on the project board "PflanzenDex Roadmap" needs the field **Priority** (P0 critical, P1 high, P2 normal, P3 low). Set it when you create the ticket; `make claim` and `make board` warn (they never block) when it is missing, `make status-check` lists all gaps. Create tickets with `make issue` (AGENTS.md, "Before you start" 6). Rule of thumb (starting values, the owner may overrule per ticket):

| Priority | Which tickets                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------- |
| P0       | Release R0 with label `blocker` or `kritischer-pfad`; labels `security`, `nightly`                            |
| P1       | Everything else in R0 and R1; bugs                                                                            |
| P2       | R2 and R3; tickets without a release (epics only; chores and process tickets get R2 by the `make issue` rule) |
| P3       | R4, R5, R6 and stage 2                                                                                        |

The status needs no manual care: the workflow `project-status.yml` sets it from the PRs (`Closes #n` in the PR body is the link; merged into `dev` = On dev, released = Done).

## Principles that shape every requirement

From `docs/specs/product/00-product-overview.md`:

- **P-01:** the AI judges, the code computes and writes.
- **P-03:** writes go only through validating operations.
- **P-04/P-05:** multi-tenant from day one, and private by default.
- **P-08:** no invented numbers. Compare against the user's own history or citable sources (GBIF, Wikipedia), and show "unknown" when a value is unknown.
- **P-09:** every view says what to do next.
- **P-10:** nothing disappears silently.
- **P-12:** the keeper chooses the features; everything outside the core can be switched off, and the data stays.

Recurring consequences:

- No comparisons against species averages.
- Etiolated growth never counts as success.
- Leaderboards and rankings between friends are excluded.
- Affiliate recommendations appear only for a derived need and are always labeled (EQU).

## Domain big picture

- **Species vs. specimen:** a species lives once in a shared catalog. A specimen is one pot owned by a user. A specimen field overrides the same field on its species.
- **Light zone / location:** light zones and locations are entities. Zone 1 is cutting light; zones 2–4 are for adult plants.
- **Derived data:** Pokédex ownership ("caught"), care phases, growth trends and zone distribution are derived live and never stored.
- **Pokédex catalog:** built by a background job (OpenTree → Wikidata → Wikipedia → GBIF). The prototype's `build_pokedex.py` (73 tests) and `pokedex-core.js` (66 tests) are reuse candidates (E-01).
