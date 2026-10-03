# Pitfalls register

Known traps that cost time or caused defects (US-DEV-05). An entry is short and says whether it can become a gate; when it does, the rule moves to `Docs/principles/` and the entry links to it.

## Format

One heading per entry `## PF-<nnn> <title>`, then:

- **Symptom:** what you notice.
- **Cause:** why it happens.
- **Fix:** what to do instead.
- **Can it become a gate?** yes (how) / no (why), with the principle ID once it exists.
- **Source:** where the finding comes from (spec ID, PR, incident).

IDs are never renumbered.

## PF-001 Calendar dates shifted by UTC

- **Symptom:** A plant captured late in the evening shows the next or previous day as capture or measurement date.
- **Cause:** The prototype formatted dates with `toISOString().slice(0, 10)`, which converts to UTC before cutting the string.
- **Fix:** Use the local date in the time zone of the user profile for every calendar date (NFR-08); compute phases and reminders in that zone.
- **Can it become a gate?** Yes: a lint rule forbidding `toISOString().slice(0, 10)` for calendar dates plus a time zone test (QG-D4). Not implemented yet.
- **Source:** Defect B-01 of the prototype; `Docs/PRODUCT-SPECS/14-Cross-Cutting.md` (NFR-08), `Docs/PRODUCT-SPECS/18-Architecture-and-Quality-Gates.md` (QG-D4).

## PF-002 Duplicate spec file numbers from parallel sessions

- **Symptom:** Two spec files carry the same number, or the same ID is defined in two places; references become ambiguous.
- **Cause:** Parallel sessions (worktrees) each pick the next free number independently.
- **Fix:** Check the next free number against `origin/dev` right before creating a file; resolve duplicates in the PR that merges second.
- **Can it become a gate?** Already is: `app/scripts/check-specs.mjs` in `make gates` (principle PRIN-008).
- **Source:** US-DEV-08 in `Docs/PRODUCT-SPECS/19-Development-Process-and-Automation.md`.

## PF-003 Definition of Done and CI disagree on a number

- **Symptom:** The DoD asks for coverage of at least 70 %, CI enforces 75 %; people pass the DoD and fail CI, or the reverse.
- **Cause:** The threshold was written down in two places and changed in one.
- **Fix:** State each threshold once, in the gate configuration; documents refer to it instead of repeating the number (FR-QG-18).
- **Can it become a gate?** Yes: a script that fails when the DoD contains a number differing from the configuration. Not implemented yet.
- **Source:** Finding from the Tombola project, recorded in FR-QG-18 in `Docs/PRODUCT-SPECS/18-Architecture-and-Quality-Gates.md`.
