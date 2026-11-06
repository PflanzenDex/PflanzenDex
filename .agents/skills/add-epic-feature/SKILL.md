---
name: add-epic-feature
description: Use when a feature or change for an existing product epic (ACC to ONB in docs/specs/product/) starts: from its story to the claim, the failing tests, the code, the gates and the spec status, in one PR (FR-QG-03, US-DEV-05).
---

# Add a feature for an epic

A story is done when its acceptance criteria are tests that carry its ID, `make ci` is green, and the spec says so in the same PR (US-DEV-05). This playbook sets the order; the parts have their own skills.

1. Spec first. Find the story in `docs/specs/product/` (heading `### US-<EPIC>-nn · …`) and read its Given/When/Then criteria and the `FR-`/`DM-` rows it names. No spec entry, no code (`AGENTS.md`, step 1). If the behavior is missing, propose the spec change in its own `docs:` PR first. Check the open decisions it depends on (`E-nn` in `docs/specs/product/16-releases-and-decisions.md`); a blocking one stops the story (Definition of Ready, US-DEV-05).
2. Issue. If none exists, create it with `make issue TYPE=story EPIC=<CODE> PRIORITY=<P0-P3> TITLE="…" BODY=<file.md>`. The allowed codes are in `app/config/project/issue-taxonomy.json`. Do not use `gh issue create`.
3. Claim. Run `make claim ISSUE=<n>`; it refuses when someone else holds the story. Then run `make worktree BRANCH=<branch that make claim printed>` and work only in that worktree, branched from `dev`.
4. Status. Set the story heading to 🟨 while you work. A requirement row (`FR-…`) you change follows the same states.
5. Tests first, with the `spec-to-tests` skill: one `describe("US-<EPIC>-nn …")`, one `it` per criterion. Run them and see them fail for the right reason before you write the code.
6. Code, by layer. Use the skill that matches the change: a write → `add-core-operation`; a new table with user data → `db-migration` and `tenant-isolation-test`; a user-visible failure → `error-code`; calendar dates → `date-and-timezone`; a friend or partner output → `privacy-whitelist`; an AI tool → `ki-tool-contract`; a photo → `photo-pipeline`; a view or control → `accessibility-check`. Follow the path rules in `.claude/rules/` for each package you touch. Changes to gate files (workflows, `Makefile`, hooks, `app/tools/check/`) are not part of a feature; they need the owner (US-QG-07).
7. Gates. `make gates` is the fast set: lint, types, layout, boundaries, unused code, specs, reference, skills and format. The pre-push hook runs it.
8. Reference docs. Name the new API routes and core operations in `docs/guides/reference/app.md` under the story's section, and each new shared UI component in the component inventory (section 4.4) of `docs/guides/reference/design-system.md`. `make reference-check` fails otherwise (US-QG-10).
9. User-facing text. German UI texts go into the feature's `.de.json` file (rule `ui-text/no-literal-text`). A `feat:` or `fix:` adds one new fragment file `app/packages/web/src/news/unreleased/<issue>-<slug>.json` with `{"line": "<German text>"}` (QG-U3, US-DEV-06); it never edits `news.de.json`, the release moves the lines there.
10. Spec status and counters. When every criterion is met and its tests pass, set the story to ✅ in the same PR, then regenerate the counters with `node app/tools/dev/agent/spec-status.mjs` (the default is `--write`; it rewrites the table in `docs/specs/product/readme.md`, and a PR changes only the row of its own epic).
11. PR. The title is a Conventional Commit with the epic scope, for example `feat(soz): …` (allowed scopes in `app/config/project/commitlint.config.js`). The body has `Closes #<n>`, the story ID and the "AI involvement" section. `make pr PR=<n>` marks it ready. `make merge PR=<n>` merges into `dev` only when `ci-status` is green (ADR 0005).

## Check

```bash
make spec-check
make ci
```

Expected: `make spec-check` reports no stale counter table and no story marked ✅ without a test that names its ID. `make ci` ends with exit 0 and every gate and test green. `make ci` starts the database first, so it needs Docker.
