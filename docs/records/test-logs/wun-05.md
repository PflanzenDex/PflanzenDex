# Test log: US-WUN-05 Get from purchase to plant (issue #817)

> **TEMPLATE, NOT EXECUTED.** This is a checklist derived from the acceptance criteria in `docs/specs/product/07-wishlist.md`. No result has been recorded. Every item is ⏭️ until a person runs it by hand against the real app (skill `story-test-protocol`) and replaces the marker with what was observed. Never write ✅ for something only a test shows without saying so.

**Branch:** _to fill_
**Environment:** _to fill (OS, Node, ports from `.env.worktree`, browser, date, accounts used)_
**Method:** run `make ci` first (section 0), start the real stack (`make dev`, `make auth-up`), real login in the browser, screenshots at 1440x900 and 375x812 into a folder `wun-05/` named `NN-<state>-desktop.png` / `NN-<state>-mobil.png`. Check mobile: no horizontal scroll, tap targets at least 48 px. Quote UI texts as they appear (German).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ⏭️ `make ci` exit code and head commit:
- ⏭️ Tests covering the criteria (list test names with the story ID):

## Preparation

- ⏭️ Account with a bought wish whose name equals the Latin name of an approved catalog species, a bought wish without a catalog species, and an open wish.
- ⏭️ Do not invent a price or purchase date at any step.

## 1. Criterion: After "Bought", creating a specimen opens with the species preselected

- ⏭️ Click "Exemplar anlegen" for the wish matching a catalog species. Expected: the creation form opens with the species preselected (US-BES-02).
- ⏭️ Click "Exemplar anlegen" for the wish without a catalog species. Expected: the catalog search opens with the wish name typed in and says so (US-BES-01).
- ⏭️ Expected: while on this path a banner says the specimen is created for the wish and offers "Verknüpfung abbrechen"; click it and check no link is made.
- ⏭️ Start the path, then leave to an unrelated page and create another specimen. Expected: the link is dropped, the unrelated specimen is not linked.
- Observed: _to fill_

## 2. Criterion: The wishlist entry is linked to the specimen

- ⏭️ Create the specimen on the path. Expected: the bought list reads "Gekauft → Exemplar angelegt".
- ⏭️ Try to link a second specimen to the same wish and the same specimen to a second wish (API). Expected: `wish.already_linked`.
- ⏭️ Simulate a failing link after creation (e.g. stop the API between the two calls or block the route). Expected: the page names the failure with its German text, offers "Erneut verknüpfen", the specimen stays (P-10).
- Observed: _to fill_

## 3. Criterion: Price and purchase date go to the cost view only if recorded

- ⏭️ Expected: no price or purchase date is shown or invented where none was entered (P-08); record what the UI offers today and mark the cost view part as open if US-EQU-09 is not built.
- Observed: _to fill_

## 4. Criterion: `Discarded` can be set by an action

- ⏭️ Click "Verwerfen" on an open candidate. Expected: it asks first; after confirming the candidate leaves the list and is not deleted.
- ⏭️ Cancel the question once. Expected: nothing changes.
- Observed: _to fill_

## Open points

- _to fill after the run (follow-up work, known limits, environment-specific changes not in the repo)_
