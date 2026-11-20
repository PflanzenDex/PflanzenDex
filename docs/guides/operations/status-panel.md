# Status panel for the orchestrating session (US-DEV-08)

A Claude Code mod on the devbox (`ai-homelab.local`) that shows the orchestrating session, live, what the leads and the machine are doing, so the owner does not have to ask whether the state is current (issue 2376, owner decision 2026-11-20).

## What it shows

Refreshed every 45 s, and at once with `/status-panel`:

1. **Worktrees:** each `.worktrees/*` with its PR number (`draft` when it is one) and the newest `ci-status` of the PR head: `✓` success, `✗` failure, `…` pending, `-` none yet or no PR.
2. **Heavy lock:** `free`, or `held by <target> (<worktree>) for <n> min`, flagged red over 20 min. Read from `.git/heavy-job.owner` (the note `tools/lint/heavy-lock.sh` writes: owner pid, directory, target, start time); a note whose owner pid is dead counts as free, as in the script.
3. **owner-merge:** open PRs labelled `owner-merge`, which wait for the owner.
4. **Open claim drafts:** open draft PRs whose branch names an issue assigned to `konradhe14` (what `make claim` opens).

It reads only local files (`git worktree list`, the lock note) and runs read-only `gh pr list` and `gh issue list`. It never reads `.env` or secrets and writes nothing.

## How to open it

- **Side panel:** opens on its own at session start where the surface has room (a terminal from 144 columns, the desktop app); otherwise type `/status-panel`.
- **Status line:** a one-line summary under the prompt, for example `wt 14 (1✓ 1✗ 0…) · lock free · owner-merge 0 · drafts 11`.
- **`/status-panel`:** refreshes now and answers with the full list, also on surfaces that place no panel (the mobile app over Remote Control).

A session that was already running when the mod was installed needs `/reload-plugins` or a restart.

## Where it lives

The mod is installed for the user `homelab`, not in this repository (a file under `.claude/` would be a gate file):

- Source: `~/devbox/mods/pflanzendex-status/` (`hooks/register.tsx`, `types/index.d.ts`, `tests/panel.test.tsx`).
- Marketplace `devbox-mods` at `~/devbox/mods/` (a local folder), installed with `claude plugin install pflanzendex-status@devbox-mods --scope user`. Claude Code reads it from that folder: after an edit, `/reload-plugins` is enough.
- Check after a change: `claude plugin validate ~/devbox/mods/pflanzendex-status` and `claude plugin test ~/devbox/mods/pflanzendex-status`.
- Off: `claude plugin disable pflanzendex-status@devbox-mods`.
