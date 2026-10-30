# Test log: US-SOZ-13 Swap history (issue #817)

> **TEMPLATE, NOT EXECUTED.** This is a checklist derived from the acceptance criteria in `docs/specs/product/10-social.md`. No result has been recorded. Every item is ⏭️ until a person runs it by hand against the real app (skill `story-test-protocol`) and replaces the marker with what was observed. Never write ✅ for something only a test shows without saying so.

**Branch:** _to fill_
**Environment:** _to fill (OS, Node, ports from `.env.worktree`, browser, date, accounts used)_
**Method:** run `make ci` first (section 0), start the real stack (`make dev`, `make auth-up`), real login in the browser, screenshots at 1440x900 and 375x812 into a folder `soz-13/` named `NN-<state>-desktop.png` / `NN-<state>-mobil.png`. Check mobile: no horizontal scroll, tap targets at least 48 px. Quote UI texts as they appear (German).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ⏭️ `make ci` exit code and head commit:
- ⏭️ Tests covering the criteria (list test names with the story ID):

## Preparation

- ⏭️ Accounts G and R with one handed-over swap, one declined, one canceled, one withdrawn, one still open. Then end the friendship and give the friend no display name in a further case.

## 1. Criterion: Completed and canceled processes with date, friend, given/received, status

- ⏭️ Open "Tauschverlauf". Expected: finished swaps newest first, each with local date (NFR-08), "Gegeben an <name>" or "Erhalten von <name>", species ("Art unbekannt" if unknown), type, mode, status in words, decline reason or cause of automatic end.
- ⏭️ Expected: the open request is not in the history.
- ⏭️ Check both sides' views and that a third account sees none of the rows (P-04).
- ⏭️ Handover near midnight in another time zone: record the shown date.
- Observed: _to fill_

## 2. Criterion: The history remains after ending the friendship

- ⏭️ End the friendship. Expected: entries unchanged with the stored display name; a friend without name reads "einem Freund".
- Observed: _to fill_

## 3. Criterion: A received specimen shows "from <display name>"

- ⏭️ Open R's specimen card. Expected: line "Erhalten von <name> am <date>"; note the date basis (spec assumption: UTC date of the handover instant) and compare with the history date.
- Observed: _to fill_

## 4. Criterion: Empty state

- ⏭️ New account. Expected: an empty history that says what to do next (P-09).
- Observed: _to fill_

## Open points

- _to fill after the run (follow-up work, known limits, environment-specific changes not in the repo)_
