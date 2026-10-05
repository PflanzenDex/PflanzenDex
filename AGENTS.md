# AGENTS.md

Rules for AI agents (Claude Code, Codex, Copilot, …) working in this repo. Humans follow the same rules (`CONTRIBUTING.md`). Product context, domain terms and spec conventions are in `CLAUDE.md` and `Docs/PRODUCT-SPECS/README.md`.

## Before you start

1. Find the story or requirement in `Docs/PRODUCT-SPECS/` (IDs `US-…`, `FR-…`). No spec entry, no code: propose the spec change first.
2. Path-scoped rules for each package, the specs and the CI files are in `.claude/rules/*.md` (Claude Code loads them when you touch matching files; read them if you use another tool).
3. Check `.agents/skills/` for a playbook that fits the task (`spec-to-tests`, `add-core-operation`, …) and follow it instead of improvising.
4. Before every story or enabler, claim it: `make claim ISSUE=<n>`. It refuses (exit 1) when the issue has an assignee, a PR references it or an origin branch carries its story ID; otherwise it assigns you, sets the board status, pushes the branch and opens a draft PR with a "Handoff" section. `make board` shows who works on what. Never start a story that someone else has claimed; ask them (US-DEV-08).
5. Work in your own worktree and branch from `dev`: `make worktree BRANCH=<branch printed by make claim>` (the claim check runs again; opt-out only with an explicit `SKIP_CLAIM_CHECK=1`). Keep the "Handoff" section of the draft PR current. Never work in a directory another session uses.

## While you work

- Architecture is checked by scripts, not by goodwill: `core` has no I/O (AB-1), API and web import `core` only through `@pflanzendex/core` (AB-2), web talks to the database only over HTTP (AB-6). Writes go through validating operations (P-03). Tenant isolation is tested for every table (P-04).
- Tests come from the acceptance criteria and carry the story ID in their name (P-06).
- The file layout is checked by `make layout` (at most 5 units per directory, kebab-case names, one folder per component, `app/layout.config.mjs`). A new violation fails the gate; the baseline `app/layout-baseline.json` only shrinks. Move files with the layout rules in mind instead of adding to a crowded directory (FR-QG-21).
- Domain errors carry a stable code `<domain>.<reason>` with a text in `ERROR_TEXTS` (FR-QG-11). Nothing is swallowed silently (P-10).
- Language: everything is English (specs, glossary, identifiers, docs, commits, PRs) except UI texts and quoted prototype terms, which stay German. Never mix within a file.

## Gates you must not weaken

Gate configs (workflows, rulesets, git hooks, `Makefile`, ESLint/knip/commitlint/release configs, check scripts, thresholds, exception lists, `.claude/`) define what "done" means. The Claude Code hooks in `.claude/settings.json` ask a human before you edit them. Never change them to turn a red run green. If a rule is wrong, say so and change it in its own PR with a reason (US-QG-07).

Blocked for agents (and pointless anyway, because CI and the rulesets repeat every check): `--no-verify`, force pushes, pushes to `dev` or `main`, calling `gh pr merge` directly, merging into `main`, changing `core.hooksPath`, editing rulesets or creating releases by hand.

## Before you say "done"

1. `make ci` (or at least `make gates` plus the tests you touched) and report the result honestly: pass or fail, with the failing output. Never "should work" (D-05). The Stop hook reminds you if code changed after the last run.
2. Update the spec status (⬜ → 🟨 → ✅) and the counters in `Docs/PRODUCT-SPECS/README.md` in the same PR.
3. Commit only when asked. Conventional Commits with an epic scope (`app/commitlint.config.js`). Open the PR against `dev` and fill in the template, including the "AI involvement" section; `make pr PR=<n>` pushes and marks it ready for review (US-DEV-10). The README statistics are regenerated once per release PR, not per PR.
4. Merge into `dev` with `make merge PR=<n>` once `ci-status` is green. It refuses unless the PR names a story that exists in `Docs/PRODUCT-SPECS/`, targets `dev`, and changes no gate file; then a human merges (ADR 0005). Releases into `main` stay with a human.
