# 0002 · Releases from tags, without a commit back to main

- **Status:** accepted (2026-10-03)
- **Refines:** US-DEV-06 ("result of a release", "version visible"), FR-QG-14, FR-DEV-05
- **Depends on:** ADR 0001 (rulesets on `main`)

## Context

US-DEV-06 lists git tag, `CHANGELOG.md` and release notes as the result of a release, and asks for a single source of the version "without writing into versioned files". A `CHANGELOG.md` in the repo would need the release workflow to commit to `main`. The `main-protection` ruleset blocks direct pushes without exception, and rulesets cannot exempt `github-actions`. On top of that, the spec wants `0.x` until parity (R1), which semantic-release does not support out of the box (it starts at 1.0.0).

## Decision

- **Tool:** semantic-release (`app/release.config.js`): one package, one release line, branch `main` only.
- **Trigger:** `.github/workflows/release.yml` via `workflow_run` on "CI", only on `success` for a `push` to `main`. If `main` has moved on in the meantime, semantic-release stops without releasing.
- **Result:** tag `vX.Y.Z` (immutable through the `release-tags` ruleset) and a GitHub release with notes grouped into Features, Bug fixes, Performance and Reverts. **No** `CHANGELOG.md` and no version field in `package.json`. The GitHub releases are the change log; builds take the version from `git describe`.
- **0.x:** the starting point is tag `v0.0.0` on the state of `main` before the first release (`ecf6780`). Breaking changes bump the minor version (`BEFORE_1_0` in the config). 1.0.0 happens deliberately, through a PR that removes that rule (first release for outside users, stage 2).
- **No release for:** `docs`, `chore` (including `chore(deps)` for tooling), `ci`, `test`, `refactor`, `build`, `style`. Runtime dependency updates (`fix(deps)`) produce a patch.
- **Preview:** `make release-dry-run` (the branch must exist on `origin`).

## Consequences

- The user-facing change log in the app (QG-U3, FR-DEV-06) does not come from `CHANGELOG.md` but from its own translation files (German first). It gets its own PR.
- The back-merge `main` → `dev` is still needed after every release (E-13), because `main` holds the merge commits of the release PRs. Version commits cannot cause conflicts because there are none.
- A manually created `v*` tag is possible (creation is allowed) but immutable and visible in the audit log. An automated check (FR-DEV-05) is still missing.
