# Test log: US-SOZ-10 Answer a swap request (issue #817)

> **TEMPLATE, NOT EXECUTED.** This is a checklist derived from the acceptance criteria in `docs/specs/product/10-social.md`. No result has been recorded. Every item is ⏭️ until a person runs it by hand against the real app (skill `story-test-protocol`) and replaces the marker with what was observed. Never write ✅ for something only a test shows without saying so.

**Branch:** _to fill_
**Environment:** _to fill (OS, Node, ports from `.env.worktree`, browser, date, accounts used)_
**Method:** run `make ci` first (section 0), start the real stack (`make dev`, `make auth-up`), real login in the browser, screenshots at 1440x900 and 375x812 into a folder `soz-10/` named `NN-<state>-desktop.png` / `NN-<state>-mobil.png`. Check mobile: no horizontal scroll, tap targets at least 48 px. Quote UI texts as they appear (German).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ⏭️ `make ci` exit code and head commit:
- ⏭️ Tests covering the criteria (list test names with the story ID):

## Preparation

- ⏭️ Accounts R (requester), G (giver), R2 (second requester for the same offer). Open requests from R and R2 on one offer of G, a second offer with one request.

## 1. Criterion: Actions: Accept, Decline (optional reason), Propose something else

- ⏭️ As G open "Anfragen" > "Anfragen an dich". Expected: each request shows state in words and counter-offer.
- ⏭️ Decline with a reason (200 characters and 201 characters). Expected: R sees state and reason; 201 is refused.
- ⏭️ Decline without reason. Expected: works.
- ⏭️ "Propose something else" with free text. Expected: request stays open, R sees "Vorschlag von <name>".
- Observed: _to fill_

## 2. Criterion: Accepting sets the offer to `reserved`; other requests declined automatically

- ⏭️ Accept R's request. Expected: the offer leaves the exchange list; R2's request ends with "Schon vergeben".
- Observed: _to fill_

## 3. Criterion: Withdrawing before the handover

- ⏭️ G withdraws the acceptance (cancel). Expected: offer is `open` again, R sees the change.
- ⏭️ R withdraws an accepted request. Expected: same.
- ⏭️ R withdraws a plain request. Expected: state `withdrawn`.
- Observed: _to fill_

## 4. Criterion: States only move forward

- ⏭️ Repeat an action that already holds (double click). Expected: nothing changes.
- ⏭️ Answer a finished request (API). Expected: `swap.wrong_state`; the other side's action: `swap.not_allowed`; foreign id: `swap.not_found`.
- ⏭️ End the friendship while a request is open. Expected: request ends with "Ihr seid nicht mehr befreundet".
- ⏭️ Withdraw the offer with open requests. Expected: they end with "Das Angebot wurde zurückgezogen".
- Observed: _to fill_

## Open points

- _to fill after the run (follow-up work, known limits, environment-specific changes not in the repo)_
