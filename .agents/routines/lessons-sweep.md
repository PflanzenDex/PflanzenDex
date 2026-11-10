---
name: lessons-sweep
schedule: weekly, Monday 07:00 Europe/Berlin (cron `0 6 * * 1` UTC)
owner: konradhe14
rights: read the repository and its pull requests; write comments on the pinned issue "Retro: Issue flow" only (FR-DEV-08)
model: claude-sonnet-5-5
spec: US-DEV-03, US-DEV-05, FR-DEV-03, FR-DEV-08 (issue 1753)
---

# Routine: weekly lessons sweep

You are a scheduled cloud agent for the repository PflanzenDex/PflanzenDex. You read and report; you change nothing else. Cloud sessions have no GitHub GraphQL: use `gh api` (REST) for every GitHub read and write, never `gh pr list`, `gh issue list` or `gh issue comment`. Never push, never open a pull request, never edit or close an issue, never create an issue, never change a label.

1. Compute the cutoff dates first: `week=$(date -u -d '7 days ago' +%F)` and `month=$(date -u -d '28 days ago' +%F)`. Read the closed pull requests into `dev` one page at a time, newest update first, without `--paginate`: `gh api "repos/PflanzenDex/PflanzenDex/pulls?state=closed&base=dev&sort=updated&direction=desc&per_page=100&page=$n" --jq '.[] | {number, title, body, merged_at, updated_at, html_url}'` for n = 1, 2, …; append each page to a file and stop after the first page whose last entry has `updated_at` before `$month` (or a page with fewer than 100 entries). Keep only entries with `merged_at` set. Step 2 and 3 use the ones merged on or after `$week`; step 4 uses all merged on or after `$month`. Read the file with `jq`, it is large.
2. From each body take the section `## Lessons` (up to the next `## ` heading, HTML comments removed). Each line has the form `- <lesson> → gate <name> | skill <name> | PF-nnn | none (<why>)`, or the section is the single word `none`.
3. Check where each promoted lesson went, against the repository on `origin/dev` (run `git fetch origin dev` first; read files with `git show origin/dev:<path>`): a named skill exists under `.agents/skills/<name>/SKILL.md`, a `PF-nnn` exists in `docs/guides/pitfalls/README.md`, a named gate exists (a make target in `Makefile` or a check under `app/tools/check/`). List every destination that does not exist.
4. Find lessons marked `none` whose content recurs: the same trap in two or more pull requests of the last four weeks (read four weeks for this step). List them with their pull requests and propose a destination by the rule of `.agents/skills/recap-and-learnings/SKILL.md` (gate if checkable, skill step if it needs judgment, pitfall entry if it is a recurring trap).
5. Count: pull requests merged, pull requests with a Lessons section, lines per destination kind, `none` sections.
6. Comment once on the open issue titled "Retro: Issue flow" (label `report`; find it with `gh api 'repos/PflanzenDex/PflanzenDex/issues?labels=report&state=open'`, post with `gh api -X POST repos/PflanzenDex/PflanzenDex/issues/<n>/comments -F body=@<file>` after reading its comments), headed "Lessons sweep <week> (routine, US-DEV-03)", with the counts, the missing destinations and the recurring `none` lessons with proposals. If nothing is missing and nothing recurs, say so in one line. If a comment of this routine for the same week already exists, do nothing.
7. Print what you wrote.
