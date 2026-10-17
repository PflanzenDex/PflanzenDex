# Test log: US-BES-11 Correct the catch date of a specimen (issue #817)

> **TEMPLATE, NOT EXECUTED.** This is a checklist derived from the acceptance criteria in `docs/specs/product/02-collection.md`. No result has been recorded. Every item is ⏭️ until a person runs it by hand against the real app (skill `story-test-protocol`) and replaces the marker with what was observed. Never write ✅ for something only a test shows without saying so.

**Branch:** _to fill_
**Environment:** _to fill (OS, Node, ports from `.env.worktree`, browser, date, accounts used)_
**Method:** run `make ci` first (section 0), start the real stack (`make dev`, `make auth-up`), real login in the browser, screenshots at 1440x900 and 375x812 into a folder `bes-11/` named `NN-<state>-desktop.png` / `NN-<state>-mobil.png`. Check mobile: no horizontal scroll, tap targets at least 48 px. Quote UI texts as they appear (German).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ⏭️ `make ci` exit code and head commit:
- ⏭️ Tests covering the criteria (list test names with the story ID):

## Preparation

- ⏭️ Account with an active specimen with a catch date, one with unknown date, one archived specimen (API only: the section "Archiv" has no entry point), a second account. Set the profile time zone to one far from UTC and test near local midnight.

## 1. Criterion: Valid date is stored, nothing else changes

- ⏭️ Tab "Bestand", card, "Fangdatum". Expected: form preset to the stored date ("Bisher: …") or today when unknown, limited to today.
- ⏭️ Save a past date and today. Expected: message names the specimen and the new date; name, marker, location, status and history unchanged.
- Observed: _to fill_

## 2. Criterion: Date in the future

- ⏭️ Enter tomorrow (local) by keyboard or API. Expected: nothing written, field marked with the German text of `specimen.caught_in_future`.
- Observed: _to fill_

## 3. Criterion: Not a calendar date or before 1900-01-01

- ⏭️ Try 1899-12-31, 2026-02-31, a date with time. Expected: `input.invalid` on the field, nothing written.
- Observed: _to fill_

## 4. Criterion: Archived specimen

- ⏭️ Via API correct an archived specimen. Expected: stored. A date after the archiving date: `specimen.caught_after_archived`, archive data unchanged.
- Observed: _to fill_

## 5. Criterion: Foreign or unknown specimen

- ⏭️ As the second account and with a random id. Expected: identical `specimen.not_found` (404).
- Observed: _to fill_

## 6. Criterion: Pokédex derived

- ⏭️ Open the Pokédex. Expected: catch date of the species equals the earliest across active and archived specimens; nothing stored separately.
- Observed: _to fill_

## 7. Criterion: Feedback

- ⏭️ Expected: the view says what changed (P-09); mobile 375x812 check.
- Observed: _to fill_

## Open points

- _to fill after the run (follow-up work, known limits, environment-specific changes not in the repo)_
