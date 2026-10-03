# 0005 · Agents merge into `dev` without a second reviewer

- **Status:** accepted (2026-10-03)
- **Amends:** ADR 0001 (required approval on `dev`; "agents never merge")
- **Refines:** US-DEV-02 (hooks), US-QG-07 (agents may not weaken gates)

## Context

ADR 0001 required one human approval on `dev` and kept agents from merging. In a team of one this made every PR wait for the owner, even when the spec was written, the tests came from it and `ci-status` was green. The project owner decided that no human has to be in the loop for such PRs.

## Decision

- **`dev-review`:** `required_approving_review_count` is 0. A PR is still required, `ci-status` and CodeQL stay mandatory (`dev-protection`), and code-owner review still applies to agent configuration (`CODEOWNERS`), so changes to what agents may do keep an owner.
- **`main` unchanged:** `main-review` keeps its approval; a release is a human decision.
- **Agents merge through one door:** `make merge PR=<n>` (`app/scripts/merge-pr.mjs`). The hook still denies a direct `gh pr merge`. The script merges (squash, branch deleted) only if the PR is open, not a draft, targets `dev`, has a green `ci-status`, names a story or requirement that exists in `Docs/PRODUCT-SPECS/` ("the spec is written"), and changes no gate file (workflows, rulesets, hooks, thresholds, `.claude/`, the merge script itself). Otherwise it lists what failed and a human merges.

## Consequences

- A PR with a green `ci-status` and a known story reaches `dev` without a second look; the quality bar is the gates and the tests, not a reviewer. Weak gates now matter more, and every gate change still needs a human.
- The conditions are checked by a script, not by GitHub: an agent running under an admin account could still call the API directly. The hook and `AGENTS.md` stop that; if it proves insufficient, run agents under a bot account that has no bypass.
- Apply the ruleset change on GitHub after the merge (`scripts/rulesets-apply.sh`); the file in the repo alone changes nothing.
