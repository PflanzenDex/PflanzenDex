# 0001 · Public repo with rulesets instead of a private repo without branch protection

- **Status:** accepted (2026-10-03)
- **Changes:** E-13 (`Docs/PRODUKT-SPECS/18-Architektur-und-Quality-Gates.md`), FR-QG-02, US-QG-02
- **Affects:** license, security features, Actions minutes

## Context

E-13 had decided that the repo stays private on the organization's Free plan. On that plan the GitHub API answers branch protection and ruleset requests with `403 Upgrade to GitHub Pro or make this repository public`. The rules from E-13 ("neither `main` nor `dev` gets direct commits", "merge only with a green `ci-status`") were therefore intentions, not barriers. Spec 18 puts it this way: a rule that only lives in a document is a wish. In an AI-first repo where agents push branches and open pull requests that is not enough: an agent must never be able to merge into `dev` or `main` on its own.

Options considered: the Team plan (about 4 USD per user and month), making the repo public, and staying on Free with a watchdog workflow (which only reports and prevents nothing).

## Decision

The repo is **public**. Rulesets live as code in `.github/rulesets/` and are applied with `scripts/rulesets-apply.sh`; `--check` reports drift between the files and GitHub.

| Ruleset | Target | Rules |
|---|---|---|
| `main-protection` | `main` | PR only; 1 approval from a human who is not the last pusher; stale approvals are dismissed on new pushes; unresolved review threads block; required check `ci-status`; merge commit only (E-13); no force push, no deletion |
| `dev-protection` | `dev` | like `main`, but squash (feature branches) and merge commit (only for the back-merge `main` → `dev` after a release or hotfix) |
| `release-tags` | tags `v*` | tags are immutable (no move, no delete); creating them stays possible for the release workflow |

No bypass actors. An emergency change means editing a ruleset on purpose (visible in the audit log), not going around it.

Settings that come free with a public repo: secret scanning with push protection, Dependabot alerts, private vulnerability reporting (`SECURITY.md`), CodeQL (as a workflow once there is code on `dev` to analyze), and unlimited Actions minutes on standard runners. Branches are deleted after merge, rebase merge is off, and squash and merge commits take the PR title, which therefore has to follow Conventional Commits (QG-C1).

**License:** no open-source license. `LICENSE` makes it explicit: source visible, all rights reserved. This keeps the business-case options (E-08) open.

## Consequences

- Specs, roadmap, business case and commit metadata (author names and email addresses) are public. Before the switch, gitleaks scanned the full history of all branches with no findings. New commits should use the GitHub `noreply` address.
- Every PR needs a second human. PRs opened by an agent count as the work of the human who started the agent, so someone else has to approve them.
- Renovate PRs need an approval too; auto-merge only fires after it (FR-QG-15).
- semantic-release does not commit back to `main` (the ruleset would block it); version and notes come from the tag and the GitHub release (US-DEV-06).
- The GitHub project (roadmap board) stays private; its visibility is independent of the repo.
