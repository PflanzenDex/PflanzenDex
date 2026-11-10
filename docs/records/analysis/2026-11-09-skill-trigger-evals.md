# Skill trigger evals (2026-11-09)

Purpose: check that each of the 15 skills in `.agents/skills/` loads on the tasks it is written for and stays quiet on a near miss, and that an agent following the three most used skills reaches the done criteria (issue 1752, US-DEV-04). `make skills-check` validates the form of a skill; nothing measured whether its description makes a model pick it.

## Method

- Tool: `claude plugin eval` (Claude Code 2.1.318). The skills were copied into a scratch plugin (`.claude-plugin/plugin.json` named `pdx`, `skills/` = `.agents/skills/`), so they appear as `pdx:<name>` in the Skill tool, as they do through `.claude/skills/` in a session.
- Cases: per skill three prompts that must load it (`pos1`–`pos3`) and one near miss that must not (`neg`), 60 cases. Prompts below.
- Grader: `tool_used` on `Skill` with `input_match: "<skill name>"`, `min: 1` for a positive case, `min: 0, max: 0` for a near miss. Trap: `min` defaults to 1 even when `max: 0` is set, so a near miss without `min: 0` can never pass ("expected 1..0"); the first run had that bug for the near misses.
- Run settings: `--ablation none` (with ablation a `tool_used: Skill` grader is reported but not scored), `max_turns: 4`, tools `Read, Glob, Grep, Skill`, no repository files in the sandbox. Appended system prompt: "You work in the PflanzenDex repository: a TypeScript monorepo (app/packages/core without I/O, api, web, db with Postgres migrations), product specs in docs/specs/product/. AGENTS.md says: check .agents/skills/ for a playbook that fits the task and follow it instead of improvising. Those playbooks are the pdx:\* skills of the Skill tool. The repository files are not available in this session; decide how you would start."
- Models: Haiku (the implementer, 3 runs per case) and Opus (the orchestrator, 2 runs per case).
- The four turns measure the first moves. A skill that loads in turn 5 counts as a miss here, although a real session has no such cap.

Case template (`evals/<skill>--<kind>/case.yaml`):

```yaml
schema_version: "1.0"
name: db-migration--pos1
tags: [db-migration, pos]
execution:
  prompt: "Add a column repotted_on to the specimen table."
  max_turns: 4
  allowed_tools: [Read, Glob, Grep, Skill]
  append_system_prompt: "<the system prompt above>"
runs: 3
graders:
  - type: tool_used
    name: fires # a near miss: name stays-quiet, min: 0, max: 0
    tool: Skill
    input_match: "db-migration"
    min: 1
```

Command: `claude plugin eval <plugin dir> --ablation none --trust-plugin --no-publish --model haiku -j 4 --threshold 0 --json <out>.json`.

## Prompts

| Skill                   | Case | Prompt                                                                                                                                                                     |
| ----------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessibility-check`   | pos1 | Add a sort toggle (by name, by last watering) to the specimen list view in the web app.                                                                                    |
| `accessibility-check`   | pos2 | Build the new 'Add measurement' dialog in app/packages/web.                                                                                                                |
| `accessibility-check`   | pos3 | The swipe deck on the discover page needs a control that works without swiping. Add it.                                                                                    |
| `accessibility-check`   | neg  | Fix the off-by-one in the core function that computes the next watering date.                                                                                              |
| `add-core-operation`    | pos1 | Keepers must be able to archive a specimen they gave away. Add that write to the domain.                                                                                   |
| `add-core-operation`    | pos2 | Implement moving a specimen to another light zone, including its API route.                                                                                                |
| `add-core-operation`    | pos3 | Let a keeper delete one of their wishlist entries.                                                                                                                         |
| `add-core-operation`    | neg  | Show the number of caught species in the dashboard header.                                                                                                                 |
| `add-epic-feature`      | pos1 | Start work on story US-SOZ-04 and take it all the way to a pull request.                                                                                                   |
| `add-epic-feature`      | pos2 | Implement the next open story of the WUN epic end to end.                                                                                                                  |
| `add-epic-feature`      | pos3 | Pick up issue #1690, a feature for the BES epic, and build it.                                                                                                             |
| `add-epic-feature`      | neg  | Bump vitest to the latest patch version.                                                                                                                                   |
| `catalog-batch`         | pos1 | Add these 30 aroid species to the shared species catalog: Monstera adansonii, Philodendron gloriosum, Anthurium clarinervium and 27 more from the list in my next message. |
| `catalog-batch`         | pos2 | As operator, load the next batch of Hoya species into the catalog.                                                                                                         |
| `catalog-batch`         | pos3 | The catalog needs 25 more succulents; prepare and load them.                                                                                                               |
| `catalog-batch`         | neg  | A keeper reports that the species page of Monstera deliciosa shows the wrong family. Fix that one entry.                                                                   |
| `date-and-timezone`     | pos1 | Reminders fire one day early for keepers in New Zealand. Fix the due date calculation.                                                                                     |
| `date-and-timezone`     | pos2 | Show 'watered today' or 'watered yesterday' on the specimen card.                                                                                                          |
| `date-and-timezone`     | pos3 | Record the date a species was caught when a keeper adds their first specimen of it.                                                                                        |
| `date-and-timezone`     | neg  | Show the pot diameter in centimeters with one decimal in the specimen detail view.                                                                                         |
| `db-migration`          | pos1 | Add a column repotted_on to the specimen table.                                                                                                                            |
| `db-migration`          | pos2 | The growth chart is slow. Add an index on measurement (specimen_id, measured_at).                                                                                          |
| `db-migration`          | pos3 | Create a new table for soil recipes (SUB epic).                                                                                                                            |
| `db-migration`          | neg  | The growth chart is slow. Change the API query so it fetches only the last 90 days of measurements.                                                                        |
| `error-code`            | pos1 | When a keeper adds a specimen to a light zone that is already full, the operation should fail with a clear message.                                                        |
| `error-code`            | pos2 | The photo upload route returns a generic 500 when the file is too large. Give that case its own failure the keeper understands.                                            |
| `error-code`            | pos3 | Sending a friend request to yourself should be refused with a message in the app.                                                                                          |
| `error-code`            | neg  | Log a warning in the nightly catalog job when Wikidata times out.                                                                                                          |
| `ki-tool-contract`      | pos1 | Expose the 'log watering' operation to the AI assistant as an MCP tool.                                                                                                    |
| `ki-tool-contract`      | pos2 | Add an optional note argument to the AI tool that records a measurement.                                                                                                   |
| `ki-tool-contract`      | pos3 | Withdraw the delete-specimen tool from the AI interface.                                                                                                                   |
| `ki-tool-contract`      | neg  | Make the AI assistant's chat answers shorter by changing its system prompt.                                                                                                |
| `photo-pipeline`        | pos1 | Let keepers attach a photo to a specimen.                                                                                                                                  |
| `photo-pipeline`        | pos2 | Thumbnails are stored as JPEG. Switch them to WebP.                                                                                                                        |
| `photo-pipeline`        | pos3 | Make sure GPS data is removed from photos that keepers upload with a measurement.                                                                                          |
| `photo-pipeline`        | neg  | Rename the 'Fotos' tab label in the specimen detail view to 'Bilder'.                                                                                                      |
| `privacy-whitelist`     | pos1 | Friends should see the location name of my specimens on my profile.                                                                                                        |
| `privacy-whitelist`     | pos2 | Add the specimen's age to the swap offer card that friends see.                                                                                                            |
| `privacy-whitelist`     | pos3 | Build the feed entry that tells my friends I caught a new species.                                                                                                         |
| `privacy-whitelist`     | neg  | Add the specimen's age to my own specimen detail view.                                                                                                                     |
| `recap-and-learnings`   | pos1 | That ticket is merged, but CI failed three times on a port clash before it went green. Wrap it up.                                                                         |
| `recap-and-learnings`   | pos2 | Last night's incident (the nightly backup failed without anyone noticing) is resolved. What do we take away from it?                                                       |
| `recap-and-learnings`   | pos3 | The review is done; it found that we derived a date from UTC again. Make sure that does not happen next time.                                                              |
| `recap-and-learnings`   | neg  | Write the user-facing release notes for R1.                                                                                                                                |
| `release-checklist`     | pos1 | Cut release R1: bring dev into main.                                                                                                                                       |
| `release-checklist`     | pos2 | Hotfix: login on production is broken and the fix has to reach main today.                                                                                                 |
| `release-checklist`     | pos3 | Prepare the R2 release pull request.                                                                                                                                       |
| `release-checklist`     | neg  | Merge PR 1783 into dev once its CI is green.                                                                                                                               |
| `spec-to-tests`         | pos1 | Start story US-WAC-06: write the failing tests from its acceptance criteria first.                                                                                         |
| `spec-to-tests`         | pos2 | Turn the Given/When/Then criteria of FR-SOZ-03 into tests.                                                                                                                 |
| `spec-to-tests`         | pos3 | I'm starting US-WUN-02. Begin with the tests.                                                                                                                              |
| `spec-to-tests`         | neg  | Fix the flaky e2e test in the login spec that times out on CI.                                                                                                             |
| `story-test-protocol`   | pos1 | US-ACC-01 is implemented. Before we mark it done, check the real login flow in a browser at phone width.                                                                   |
| `story-test-protocol`   | pos2 | Write the test protocol with screenshots for the new onboarding flow.                                                                                                      |
| `story-test-protocol`   | pos3 | The automated tests pass for the swipe deck, but nobody has tried it on a phone. Check it by hand before we close the story.                                               |
| `story-test-protocol`   | neg  | Add a unit test for the derived care phase calculation.                                                                                                                    |
| `tenant-isolation-test` | pos1 | Add a table for a keeper's private notes on a specimen.                                                                                                                    |
| `tenant-isolation-test` | pos2 | The new equipment table holds each keeper's lamps. Prove that nobody can read another keeper's lamps.                                                                      |
| `tenant-isolation-test` | pos3 | Add an operation that lists a keeper's wishes.                                                                                                                             |
| `tenant-isolation-test` | neg  | Add a column for the GBIF key to the shared species catalog table.                                                                                                         |

## Results

Hits are runs in which the skill loaded within four turns. "Before" uses the descriptions on `dev` (`0883e81c`), "after" the descriptions of this PR; both with the same cases and system prompt.

| Skill                   | Haiku before | Haiku after | Opus  |
| ----------------------- | ------------ | ----------- | ----- |
| `accessibility-check`   | 0/9          | 6/9         | 6/6   |
| `add-core-operation`    | 8/9          | 9/9         | 6/6   |
| `add-epic-feature`      | 3/9          | 8/9         | 6/6   |
| `catalog-batch`         | 9/9          | 9/9         | 6/6   |
| `date-and-timezone`     | 9/9          | 9/9         | 6/6   |
| `db-migration`          | 7/9          | 9/9         | 6/6   |
| `error-code`            | 2/9          | 8/9         | 6/6   |
| `ki-tool-contract`      | 9/9          | 9/9         | 6/6   |
| `photo-pipeline`        | 9/9          | 8/9         | 5/6   |
| `privacy-whitelist`     | 8/9          | 9/9         | 5/6   |
| `recap-and-learnings`   | 9/9          | 9/9         | 6/6   |
| `release-checklist`     | 9/9          | 9/9         | 6/6   |
| `spec-to-tests`         | 9/9          | 9/9         | 6/6   |
| `story-test-protocol`   | 9/9          | 9/9         | 6/6   |
| `tenant-isolation-test` | 6/9          | 8/9         | 6/6   |
| **Positive, total**     | 106/135      | 128/135     | 88/90 |
| **Near misses quiet**   | 45/45        | 45/45       | 30/30 |

- Opus: eleven skills come from one run with their final descriptions and the system prompt without its sentence on the Skill tool (Opus used the Skill tool anyway); the four skills changed after that run (`accessibility-check`, `add-core-operation`, `error-code`, `tenant-isolation-test`) were run again with the final descriptions and system prompt (24/24). Its misses (`photo-pipeline` 5/6, `privacy-whitelist` 5/6, and before the rerun `accessibility-check` and `tenant-isolation-test`) all loaded `add-epic-feature` first for a prompt that reads like a whole feature ("Let keepers attach a photo to a specimen"); `add-epic-feature` step 15 then names the specific skill. That is the intended route, not a defect.
- Haiku's remaining misses are first-move variance: in the missed runs it searched the files with Glob before loading the skill, and every prompt loaded its skill in at least one of three runs. `accessibility-check` stays the weakest (6/9): Haiku looks for the view before it loads the check.
- Without any skill loaded (control run, scratch plugin with no skills), 0/135 positives and 45/45 near misses pass, so the grader counts only real Skill calls.
- The first Haiku run told the model to "check .agents/skills/" without naming the Skill tool; it searched the empty sandbox with Glob and ran out of turns. Measuring a skill needs the eval setup to say how skills are reached, as `.claude/skills/` does in a real session.

## Description changes

| Skill                   | Change                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessibility-check`   | Names the concrete things built in web (view, dialog, list, form, button, toggle, gesture, flow) and says to load it before the UI code, also next to another skill.                                 |
| `add-core-operation`    | Says what a write looks like to the keeper (create, change, move, archive, delete a specimen, wish, measurement, zone). `error(...)` in step 4 is `appError(...)` (the helper in `kernel/error.ts`). |
| `add-epic-feature`      | Covers "implement a whole story, issue or feature end to end" with examples, and says it calls `spec-to-tests` and the other skills on the way.                                                      |
| `date-and-timezone`     | Names the caught date in English next to `Gefangen_Am`, and "today" or "yesterday" labels.                                                                                                           |
| `db-migration`          | Says it applies also when `tenant-isolation-test` applies to the same table.                                                                                                                         |
| `error-code`            | Describes the trigger as a refusal or failure the keeper sees, including a case that ends as a generic error today. `error(...)` in step 4 is `appError(...)`.                                       |
| `privacy-whitelist`     | Adds the profile friends see.                                                                                                                                                                        |
| `recap-and-learnings`   | Adds "merged, resolved, wrapped up" and examples (red CI runs, rework, a repeated mistake).                                                                                                          |
| `tenant-isolation-test` | Gives examples of user-owned data and says to load it next to `db-migration` or `add-core-operation`, not after them; names `account_id` instead of the old `konto_id`.                              |

## End-to-end replays

The three most used skills were run once each on a small story that is already on `dev`, replayed by a Haiku implementer in a throwaway worktree at the commit before the story's PR, with the playbooks of this PR copied over. No claim, push or PR; the implementer was told not to read the later solution. The reverts of the stories on today's `dev` all conflicted, hence the parent commit.

| Skill under test     | Story (merged PR)        | Skills the agent loaded, in order                                                                                       | Tests first                                                                     | Gates                                                                                                                              | Diff against the merged PR                                                                                                                                                                                          |
| -------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec-to-tests`      | US-BES-04 (#1105, #1103) | `add-epic-feature`, `spec-to-tests`; afterwards `error-code`, `add-core-operation`, `date-and-timezone` as a check      | yes: criterion, red tests in core, db, api, web, then the code (3 commits)      | green except the two replay artifacts below                                                                                        | 13 of the 15 files; it left out the repot form (the refusal shows through the existing field message) and the news fragment (no fragment folder at that commit)                                                     |
| `add-core-operation` | US-MON-09 (#1665, #1605) | `add-epic-feature`, `spec-to-tests`, `add-core-operation`, `db-migration`, `tenant-isolation-test`, `date-and-timezone` | yes: spec, red tests (core, db, api, web), then the code (3 commits)            | green except the two replay artifacts below; core 2235, db 750, api 1478, web 3198 tests pass                                      | 31 files against 30: same migration, operation, adapter, routes and label page action; its own folder layout; it left out a story-named test in the account data export (the generic export test covered the table) |
| `add-epic-feature`   | US-EQU-09 (#772, #128)   | `add-epic-feature`, `spec-to-tests`                                                                                     | yes: status and decision, red tests (core, API, web), then the code (4 commits) | green except the replay artifact below; the API suite has 12 failures in `swap/handover` that fail the same way on the base commit | 16 files against 14: the merged PR derived the costs in core and showed them from the existing equipment list; the replay added an API route for them. Same criteria covered                                        |

Notes on the replays:

- The Skill tool served the playbooks of the main checkout (`dev`), not the copies in the replay worktree, so the three replays followed the playbooks as they are on `dev` before this PR. The fixes below come from what the agents ran into.
- Replay artifacts, not defects: `make skills-check` fails in a worktree whose uncommitted playbook copies name paths that the old commit does not have; `make reference-check`, the crap and the duplicate gates compare against `origin/dev`, which is newer than the replayed commit (`REFERENCE_BASE=HEAD make reference-check` passed). The replay of US-EQU-09 sat at a commit of 2026-10-14, so several playbook steps named tools that came later (news fragments, `spec-status.mjs`, `make reference-check`).
- Each replay took a Haiku implementer 13 to 64 minutes and 230 000 to 390 000 tokens.

Playbook fixes from the replays (checked against `dev`):

| Finding                                                                                                                                                                                                                           | Fix                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `add-core-operation` and `error-code` step 4 name `error(...)`; the helper is `appError(...)` (296 uses in core, none of `error(`).                                                                                               | Both name `appError(...)`.                                                                        |
| `add-core-operation` step 2 names `kernel/validation.ts` (now `kernel/input/validation.ts`) and says unknown fields are rejected; `shape()` drops them at runtime, only the JSON Schema published for the MCP tools refuses them. | Path and behavior corrected.                                                                      |
| `add-core-operation` step 1 says to name the operation "in German"; names are English (ADR 0004).                                                                                                                                 | "in English".                                                                                     |
| Gates that bit the replay of US-MON-09 and are not in the playbook: 60 lines per function, the constants gate (FR-QG-12), knip on an unused export.                                                                               | One sentence under the check of `add-core-operation`.                                             |
| The merged US-MON-09 has a story test that the account data export carries the new table; the replay did not write one (the generic export test covered the table).                                                               | `tenant-isolation-test` step 9: the export reads its tables from the catalog; add the story test. |

Observation, not changed here (gate file, E-30): `npm run test` and `npm run coverage` in `app/package.json` chain the tool tests after the workspace tests with `&&`, so a red workspace test hides the tool tests locally. CI runs them in their own job (`ci-tests-tools`).

## Cost

Nine eval runs, 1 136 graded agent runs in all: Haiku USD 2.91 (five full runs, one partial, one control run without skills), Opus USD 14.75 (one full run with two runs per case, one partial). The Opus run with all 60 cases cost USD 11.43; rerun Opus only for the skills whose description changed.

## How to run again

Copy `.agents/skills/` into `<dir>/skills/`, add `<dir>/.claude-plugin/plugin.json` (`{"name":"pdx","version":"0.0.1","description":"…"}`), write one `evals/<skill>--<kind>/case.yaml` per row of the prompt table with the template above, then run the command from "Method". Rerun when a description changes, at least for that skill (`--tag <skill>`).
