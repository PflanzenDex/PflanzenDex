# Working in parallel without collisions (US-DEV-08)

Background: two sessions working in the same folder once produced duplicate spec file numbers. Hence the rule: one task, one branch, one working directory.

## Start a new task

```bash
make worktree BRANCH=feat/<task>
```

This calls `scripts/worktree-new.sh`: it fetches `origin/dev`, creates the branch and a worktree under `.worktrees/<branch>/` (slashes become dashes) and writes `.env.worktree`. Then change into that directory and run `make setup` there. Two sessions never write into the same directory; `.worktrees/` and `.env.worktree` are ignored by git.

## Own ports and database per worktree

`app/scripts/worktree-env.mjs` derives these deterministically from the branch name:

| Variable | Meaning |
|---|---|
| `PFLANZENDEX_TEST_DB_PORT` | test database port (starting range 54400 to 54899) |
| `PFLANZENDEX_TEST_DB_NAME` | database name `pflanzendex_<branch>_<hash>` |
| `PFLANZENDEX_DEV_API_PORT` / `PFLANZENDEX_DEV_WEB_PORT` | dev servers (ranges 54900 to 55899) |

The ranges are an assumption (starting values). With 500 slots per service collisions are rare but possible (hash). The fixed port 54329 is reserved for the main checkout. To use the variables, load them with `set -a; . ./.env.worktree; set +a`.

## Owners and number assignment

- `.github/CODEOWNERS` names an owner per folder; changes to it require review.
- `make gates` includes `check-specs`: duplicate file numbers in `Docs/PRODUKT-SPECS/` and IDs defined twice (`US-/FR-/DM-/E-`) fail the run. Whoever adds a number checks the highest free number on the current `origin/dev`; on a conflict the later PR rebases and renumbers (IDs of existing entries are never renumbered).

## Rules for agents

- Do not commit without being asked; do not change other people's files without a task.
- Touch shared files (Makefile, `package.json`) as little as possible; put your own logic into your own scripts.
- Report before writing if a file has changed since it was read.

## Open

A test lock for shared resources (pattern `with-test-lock.cjs`) only makes sense now that the test database (TE-02, PR #186) exists. Until then, unique ports and database names per worktree prevent collisions (the alternative the criterion allows). TE-02 and TE-03 have to read these variables instead of fixed ports.
