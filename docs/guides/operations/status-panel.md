# Status panel for Claude Code sessions (US-DEV-08)

A Claude Code mod (a plugin with a hooks module) that shows, live, what the leads and the machine are doing, so nobody has to ask whether the state is current (issue 2376, owner decisions 2026-11-20). It ships in this repository and loads for every contributor who opens the repo in Claude Code.

## What it shows

Refreshed every 45 s, and at once with `/status-panel`:

1. **Worktrees:** each worktree under `<main checkout>/.worktrees/` with its PR number (`draft` when it is one) and the newest `ci-status` of the PR head: `✓` success, `✗` failure, `…` pending, `-` none yet or no PR. "no worktrees" when there are none.
2. **Heavy lock:** `free`, or `held by <target> (<worktree>) for <n> min`, flagged over 20 min. A note whose owner pid is dead counts as free, as in `tools/lint/heavy-lock.sh`.
3. **owner-merge:** open PRs labelled `owner-merge`, which wait for the owner.
4. **My open claim drafts:** open draft PRs whose branch names an issue assigned to you (what `make claim` opens).

It shows as a side panel where the surface has room (a terminal from 144 columns, the desktop app), as a one-line summary in the status line (`wt 14 (1✓ 1✗ 0…) · lock free · owner-merge 0 · drafts 11`), and as the full list in the answer to `/status-panel`, also on surfaces that place no panel (the mobile app over Remote Control).

## What it reads

Only local state and read-only `gh` calls; it writes nothing and never reads `.env` or other secrets.

| Part         | Source                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repo root    | `git rev-parse --git-common-dir` from the session's folder (works from any worktree); no fixed paths                                             |
| Worktrees    | `git worktree list --porcelain`, the entries under `<root>/.worktrees/`                                                                          |
| Heavy lock   | `<git common dir>/heavy-job.owner`, the note `heavy-lock.sh` writes (owner pid, directory, target, start time), and `kill -0 <pid>` (or `ps -p`) |
| PRs, CI      | `gh pr list --state open --json number,title,headRefName,isDraft,labels,statusCheckRollup`                                                       |
| Claim drafts | `gh api user` for your login, then `gh issue list --assignee <login>`                                                                            |

Without `gh`, or with `gh` signed out, it shows the worktrees and the lock and says "local parts only". It needs only `git`, `gh`, `kill` or `ps`, so it runs the same on macOS and on Linux (GNU tools).

## Install

Nothing to do: `.claude/settings.json` declares the marketplace `pflanzendex` (this repository on GitHub, branch `dev`, read through `.claude-plugin/marketplace.json`) and enables `status-panel@pflanzendex`. Claude Code offers to install it the first time you open the trusted repo; accept, or run:

```bash
claude plugin marketplace add PflanzenDex/PflanzenDex   # once, if Claude Code did not offer it
claude plugin install status-panel@pflanzendex
```

A session that was already running needs `/reload-plugins` or a restart. Updates arrive with `claude plugin marketplace update pflanzendex` and `/reload-plugins`.

The source is `.claude/mods/status-panel/` (`hooks/register.tsx`, `types/index.d.ts`, `tests/panel.test.tsx`). After a change: `claude plugin validate .claude/mods/status-panel` and `claude plugin test .claude/mods/status-panel`. To try a change before it is on `dev`, start a session with `claude --plugin-dir .claude/mods/status-panel`.

## Opt out

Switch it off for yourself in this repo, without touching the shared settings:

```bash
claude plugin disable status-panel@pflanzendex --scope local
```

That writes `"enabledPlugins": { "status-panel@pflanzendex": false }` to `.claude/settings.local.json` (not committed). `claude plugin enable status-panel@pflanzendex --scope local` turns it back on.
