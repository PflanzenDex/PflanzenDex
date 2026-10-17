# Test log: US-WUN-03 Record a purchase (issue #817)

> **TEMPLATE, NOT EXECUTED.** This is a checklist derived from the acceptance criteria in `docs/specs/product/07-wishlist.md`. No result has been recorded. Every item is ⏭️ until a person runs it by hand against the real app (skill `story-test-protocol`) and replaces the marker with what was observed. Never write ✅ for something only a test shows without saying so.

**Branch:** _to fill_
**Environment:** _to fill (OS, Node, ports from `.env.worktree`, browser, date, accounts used)_
**Method:** run `make ci` first (section 0), start the real stack (`make dev`, `make auth-up`), real login in the browser, screenshots at 1440x900 and 375x812 into a folder `wun-03/` named `NN-<state>-desktop.png` / `NN-<state>-mobil.png`. Check mobile: no horizontal scroll, tap targets at least 48 px. Quote UI texts as they appear (German).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ⏭️ `make ci` exit code and head commit:
- ⏭️ Tests covering the criteria (list test names with the story ID):

## Preparation

- ⏭️ One account with at least two open wishes and one discarded wish; a second account for the isolation check.

## 1. Criterion: "Bought" sets `Status: Bought` and hides the candidate, but it stays in the history

- ⏭️ Open the tab "Wunschliste". Expected: every open candidate has the action "Gekauft".
- ⏭️ Click "Gekauft" on one candidate. Expected: the candidate leaves the list; the confirmation says what happened and what to do next ("Exemplar anlegen").
- ⏭️ Expected: the wish appears in the section "Gekauft" below the list by name; reload the page and check it is still there (nothing disappears silently, P-10).
- ⏭️ Repeat the action for the already bought wish (second tab or double click). Expected: nothing changes, answer "already bought", no error.
- ⏭️ Try to buy the discarded wish (API call if the UI offers no action). Expected: refusal `wish.not_open` with German text, wish stays discarded.
- ⏭️ As the second account request the first account's wish id. Expected: same answer as for an unknown wish (`wish.not_found`, P-04).
- Observed: _to fill_

## 2. Criterion: The guided path to the plant follows (US-WUN-05)

- ⏭️ After "Gekauft" the confirmation offers "Exemplar anlegen" (details in the log of US-WUN-05).
- Observed: _to fill_

## 3. Criterion: Mobile and accessibility

- ⏭️ 375x812: no horizontal scroll, "Gekauft" tap target at least 48 px; keyboard operation and visible focus.
- Observed: _to fill_

## Open points

- _to fill after the run (follow-up work, known limits, environment-specific changes not in the repo)_
