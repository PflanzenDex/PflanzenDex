# 0008 · The file layout is formalized and checked by a script

- **Status:** accepted (2026-10-05, project owner)
- **Replaces:** the proposal FR-QG-04 (`Docs/PRODUCT-SPECS/18-Architecture-and-Quality-Gates.md`)
- **Adds:** US-QG-09, FR-QG-21 to FR-QG-23, gate QG-C4 reworked
- **Refines:** ADR 0003 (module roots and the kernel), FR-QG-17 (baseline ratchet)

## Context

The module cut is checked (`app/modules.config.mjs`, AB-7 to AB-14), the file layout is not. A measurement on 2026-10-05 showed 77 of 111 tracked directories with more than 5 entries (`Docs/test-logs` 70, `app/scripts` 59, `web/src/collection` 49, `core/src/collection` 48, `web/src/components/ui` 40), 22 entries in `app/`, two `scripts/` folders, loose component files in `web/src` and mixed naming (`Docs/PRODUCT-SPECS` next to `Docs/decisions`, PascalCase pages next to kebab-case files). A rule that nobody checks is a wish (chapter 18), and the proposal FR-QG-04 was never built.

## Decision

- **One configuration, one script.** `app/layout.config.mjs` describes the layout, `app/scripts/check-layout.mjs` checks it (QG-C4, `make layout`, part of `make gates`, pre-push and CI). Rules LY-1 to LY-6 are in FR-QG-21.
- **Fan-out limit 5 per directory** (a unit is a group of files with the same name stem), with declared collections (name pattern instead of a limit) and module roots (modules from `modules.config.mjs`, up to 10 feature directories each). Entries starting with `.` are ignored.
- **kebab-case everywhere**, one directory per component, barrels per module only (not per component), a whitelist for the repo root.
- **Baseline ratchet** (FR-QG-22): values only shrink, stale entries fail, new keys against `dev` fail. The first PR creates the baseline from the measured state, so the gate is green on day one and stops further growth.
- **Target layout** (FR-QG-23): `docs/` (lower case), `tools/`, `app/config`, `app/gates`, `web/src/{app,shared,<modules>}`. Test logs stay in the repo as a collection `docs/records/test-logs/<story-id>/`.
- **Migration** in small PRs with the helper `make layout-fix` (dry run first, import rewrite, `git mv`). Gate files (check, Makefile, workflows, hooks, thresholds) are changed in their own PRs that a human merges (ADR 0005).

## Alternatives considered

- **A ready-made tool** (ls-lint, eslint-plugin-project-structure): good for name patterns, but no fan-out limit, no baseline ratchet and no autofix that moves files and rewrites imports. That logic had to be built anyway, and the rules would live in two systems.
- **Hybrid** (tool for names, script for fan-out and baseline): the same two-system problem; a new directory needs two configurations.
- **Fixed limit without collections:** would force artificial grouping of migrations, ADRs and test logs, where the number carries no meaning.

## Consequences

- Moves are large but mechanical: about 77 directories are over the limit today. The baseline makes that visible and the ratchet makes it shrink.
- Open pull requests that touch moved files conflict. Moves therefore wait for a module while another claim touches it (`make board`); the `web` moves wait until the DS-48 pull requests are merged.
- The rename `Docs/` to `docs/` changes links in `CLAUDE.md`, `AGENTS.md`, skills, rules and check scripts; `check-links` and `check-specs` guard it.
- Numbers (5 per directory, 10 feature directories per module) are starting values, not measured (assumption); changing them is a gate change.
- A side finding: `make claim` derives its key from the epic and number, so `US-QG-09` and `FR-QG-09` collide. The issue for this decision therefore carries `FR-QG-21` in its title. Fixing the claim logic is a separate task.
