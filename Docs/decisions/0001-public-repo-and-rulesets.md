# 0001 · Public repo with rulesets instead of a private repo without branch protection

- **Status:** accepted (2026-10-03)
- **Changes:** E-13 (`Docs/PRODUCT-SPECS/18-Architecture-and-Quality-Gates.md`), FR-QG-02, US-QG-02
- **Affects:** license, security features, Actions minutes

## Context

E-13 had decided that the repo stays private on the organization's Free plan. On that plan the GitHub API answers branch protection and ruleset requests with `403 Upgrade to GitHub Pro or make this repository public`. The rules from E-13 ("neither `main` nor `dev` gets direct commits", "merge only with a green `ci-status`") were therefore intentions, not barriers. Spec 18 puts it this way: a rule that only lives in a document is a wish. In an AI-first repo where agents push branches and open pull requests that is not enough: an agent must never be able to merge into `dev` or `main` on its own.

Options considered: the Team plan (about 4 USD per user and month), making the repo public, and staying on Free with a watchdog workflow (which only reports and prevents nothing).

## Decision

The repo is **public**. Rulesets live as code in `.github/rulesets/` and are applied with `scripts/rulesets-apply.sh`; `--check` reports drift between the files and GitHub.

Each protected branch has two rulesets, so that the hard rules never have exceptions while the review rule can:

| Ruleset | Target | Rules | Bypass |
|---|---|---|---|
| `main-protection` | `main` | required check `ci-status`; CodeQL code scanning results (no new high or higher security alerts, no errors); no force push, no deletion | none |
| `main-review` | `main` | PR only; 1 approval from a human who is not the last pusher; stale approvals dismissed on new pushes; unresolved review threads block; code-owner review; merge commit only (E-13) | repository admins, **only when merging a PR** |
| `dev-protection` | `dev` | like `main-protection` | none |
| `dev-review` | `dev` | like `main-review`, but squash (feature branches) and merge commit (only for the back-merge `main` → `dev` after a release or hotfix) | repository admins, only when merging a PR |
| `release-tags` | tags `v*` | tags are immutable (no move, no delete); creating them stays possible for the release workflow | none |

**Self-merge (amended 2026-10-03):** repository admins may merge their own PRs without an approval ("bypass rules" when merging, or `gh pr merge --admin`). The bypass mode is `pull_request`: it never allows direct pushes, and `ci-status` stays mandatory because it lives in the `*-protection` rulesets without bypass. Non-admins still need an approval. Agents never merge (`AGENTS.md`, Claude Code hook).

**Agent configuration:** `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.agents/`, `.githooks/` and `.github/rulesets/` have code owners (`.github/CODEOWNERS`); with code-owner review required, a non-admin's change to what agents read or may do needs an owner's approval.

Settings that come free with a public repo: secret scanning with push protection, Dependabot alerts, private vulnerability reporting (`SECURITY.md`), CodeQL (as a workflow once there is code on `dev` to analyze), and unlimited Actions minutes on standard runners. Branches are deleted after merge, rebase merge is off, and squash and merge commits take the PR title, which therefore has to follow Conventional Commits (QG-C1).

**License:** no open-source license. `LICENSE` makes it explicit: source visible, all rights reserved. This keeps the business-case options (E-08) open.

## Consequences

- Specs, roadmap, business case and commit metadata (author names and email addresses) are public. Before the switch, gitleaks scanned the full history of all branches with no findings. New commits should use the GitHub `noreply` address.
- Non-admin PRs need a second human. Admins may merge their own PRs after a green `ci-status`; this trades review for speed in a small team and is recorded here so it can be revisited when the team grows.
- An agent running under an admin's account could technically use the admin bypass. It is stopped by `AGENTS.md` and the Claude Code hook that denies `gh pr merge`, not by GitHub. If that ever proves insufficient, run agents under a non-admin bot account.
- Renovate PRs need an approval (or an admin merge) too; auto-merge only fires after it (FR-QG-15).
- semantic-release does not commit back to `main` (the ruleset would block it); version and notes come from the tag and the GitHub release (US-DEV-06).
- The GitHub project (roadmap board) stays private; its visibility is independent of the repo.
