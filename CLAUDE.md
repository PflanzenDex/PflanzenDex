# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`AGENTS.md`, imported above, holds the workflow, the gates you must not weaken and the definition of done; this file states each of its rules nowhere else. Details load where they apply: path-scoped rules in `.claude/rules/` (specs, domain, packages, CI), playbooks in `.agents/skills/`, agent definitions in `.claude/agents/`, guardrail hooks in `.claude/settings.json`.

## What this repository is

The specs of PflanzenDex, a multi-user, mobile-first plant-keeping PWA with a shared species catalog, social features and an AI assistant, and its app code (E-05). `docs/specs/product/` is the authoritative spec for new work; `docs/specs/prototype/` describes the single-user Obsidian vault it grew from. `app/` is the TypeScript monorepo (`core`, `api`, `web`; `docs/guides/reference/app.md`). Next to the specs, `docs/` holds the principles register, ADRs, runbooks and pitfalls (`docs/guides/principles/`, `docs/adr/`, `docs/guides/operations/`, `docs/guides/pitfalls/`). All tasks go through the root `Makefile`: `make help` lists them, `make ci` runs every gate. Start with `docs/specs/product/readme.md` (index, conventions, replacement table), then `00-product-overview.md` (principles, domain model, glossary) and `16-releases-and-decisions.md` (release cut R0–R6, decisions E-nn, non-goals).

## Language

- **English:** everything in the repo: specs, glossary, code identifiers (`account`, `specimen`, `withAccount`, …), database objects, error codes, scripts, workflows, docs, PR/issue templates, labels, branch names, commit messages, PR titles and descriptions (ADR `docs/adr/0004-english-repository.md`).
- **German:** only the text users see in the app UI (kept in message tables: `ERROR_TEXTS` for error codes, one `web/src/<feature>/<feature>.de.json` per feature read through `texts()`; enforced by the ESLint rule `ui-text/no-literal-text` with a shrinking baseline, FR-QG-26) and quoted terms of the vault prototype (`docs/specs/prototype/`, vault paths, original data keys). The app shows the product name as "PflanzenDéx" (owner decision, 2026-11-05); the repo and code name stay "PflanzenDex".
- Never mix languages within one file. When you touch a file that still contains German outside UI texts or quoted prototype terms, translate it completely. Dated records (`docs/records/spikes/`, `docs/records/test-logs/`) are English too; raw `.txt` logs stay as recorded. The migrations 0001 to 0120 (German history, then the English rename) were squashed into `0001_baseline.sql` (English, issue 2519, owner decision d-122); the old files are in git history only, and forward-only migrations apply from the baseline on.

## Principles

From `docs/specs/product/00-product-overview.md`; their recurring consequences are in `.claude/rules/domain.md`.

- **P-01:** the AI judges, the code computes and writes.
- **P-02:** one core, many interfaces: web, AI client and notifications share the domain logic.
- **P-03:** writes go only through validating operations; invalid input is rejected, not corrected.
- **P-04:** multi-tenant from day one: every user-related row belongs to an account.
- **P-05:** private by default: nothing leaves the account without explicit sharing.
- **P-06:** specs are executable: acceptance criteria become tests.
- **P-07:** the human delivers only what only the human can; the system computes everything derivable.
- **P-08:** no invented numbers: compare against the user's own history or citable sources (GBIF, Wikipedia), and show "unknown" when a value is unknown.
- **P-09:** every view says what to do next.
- **P-10:** nothing disappears silently.
- **P-11:** mobile first: photo, measuring, watering and moving happen next to the plant.
- **P-12:** the keeper chooses the features; everything outside the core can be switched off, and the data stays.

## Agent sessions and models

Each subagent's fixed rules are in `.claude/agents/<name>.md`; start it with `subagent_type: "<name>"`, and its brief holds only the ticket's facts (owner decisions 2026-11-14 and 2026-11-20, issues 2099, 2101, 2363).

- **Orchestrating session** (main session, Opus at effort medium): claims tickets and starts one `ticket-lead` per ticket; its rules are in `docs/guides/operations/parallel-work.md` ("The orchestrating session").
- `ticket-lead`: one claimed ticket from the implementer brief to the merge into `dev`.
- Taking over another contributor's pull request: skill `takeover-pr` (`pr-reviewer` verdict first, `ci-triager` on red CI; issue 2373).
- `implementer` (Haiku, effort xhigh, owner decision 2026-11-03): edits, commits and pushes in the claimed worktree; `scout`: read-only search and measurement.
- Read-only reviews: `pr-reviewer` (merge verdict), `security-reviewer` (tenant isolation, privacy, auth, AI interface), `design-judge` (style guide), `a11y-auditor` (keyboard and screen reader).
- `ci-triager` (red `ci-status`), `device-checker` (rechecks merged FX fixes on the devices).
- `illustrator` (SVG motifs, US-QS-31), `copywriter` (German wording proposals), `spec-writer` (spec text), `catalog-researcher` (catalog batch attributes).
- **Status panel:** the repo's mod `status-panel@pflanzendex` shows worktrees with PR and `ci-status`, the heavy lock, `owner-merge` PRs and your claim drafts; `/status-panel` opens it (install, opt-out and what it reads: `docs/guides/operations/status-panel.md`).
