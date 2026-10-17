# Contributing

Short version for humans and agents. The rules themselves live in the specs; this file only shows the path.

1. **Spec first.** Every change belongs to a story or requirement in `docs/specs/product/` (start with `README.md`). If it is missing, extend the spec first. Everything is written in English (specs, docs, code, commits, PRs); only the texts users see in the app are German.
2. **One task, one branch, one worktree** (E-13, US-DEV-08): `make worktree BRANCH=feat/pha-02-care-phase`. Branches start from `dev`.
3. **Tests from the acceptance criteria**, with the story ID in the test name (P-06).
4. **`make ci`** green locally before opening the PR. `make help` lists all targets.
5. **PR into `dev`** with a Conventional Commits title; `make pr` pushes and marks the draft PR ready for review (US-DEV-10) (`feat(pha): …`, `fix(bes): …`, `docs: …`); the squash turns it into the commit message. Fill in the template and update the spec status in the same PR.
6. **Merge** only with a green `ci-status`. PRs into `dev` need no approval; PRs into `main` need one (admins may merge their own); agents merge into `dev` with `make merge PR=<n>` (rulesets, ADR 0001 and 0005). No direct pushes to `dev` or `main`.
7. **Release:** PR `dev` → `main` as a merge commit; version and notes are generated automatically (US-DEV-06).

Gates, thresholds and exception lists are never loosened to turn a red run green. If a rule is wrong, change it in its own PR with a justification (US-QG-07).

Report security issues privately: see `SECURITY.md`.
