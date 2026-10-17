# Test log: US-SOZ-11 Confirm the handover, update collection and Pokédex (issue #817)

> **TEMPLATE, NOT EXECUTED.** This is a checklist derived from the acceptance criteria in `docs/specs/product/10-social.md`. No result has been recorded. Every item is ⏭️ until a person runs it by hand against the real app (skill `story-test-protocol`) and replaces the marker with what was observed. Never write ✅ for something only a test shows without saying so.

**Branch:** _to fill_
**Environment:** _to fill (OS, Node, ports from `.env.worktree`, browser, date, accounts used)_
**Method:** run `make ci` first (section 0), start the real stack (`make dev`, `make auth-up`), real login in the browser, screenshots at 1440x900 and 375x812 into a folder `soz-11/` named `NN-<state>-desktop.png` / `NN-<state>-mobil.png`. Check mobile: no horizontal scroll, tap targets at least 48 px. Quote UI texts as they appear (German).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ⏭️ `make ci` exit code and head commit:
- ⏭️ Tests covering the criteria (list test names with the story ID):

## Preparation

- ⏭️ Accounts G and R with an accepted swap of a specimen (run once with type plant, once with cutting). R has a care profile with a growth location; run once more with R without a care profile.
- ⏭️ Give G a specimen with measurements and treatments.

## 1. Criterion: The handover counts only when both sides have confirmed

- ⏭️ G clicks "Übergabe bestätigen". Expected: card says who is awaited; nothing else changes (specimen not archived, R has no new specimen).
- ⏭️ G confirms again. Expected: nothing changes.
- ⏭️ R clicks "Erhalt bestätigen". Expected: swap becomes handed over.
- Observed: _to fill_

## 2. Criterion: Giver: specimen archived

- ⏭️ Expected: G's specimen is archived with reason "Getauscht mit <name>" or "Verschenkt an <name>"; missing from distribution, phases and Pokédex ownership if it was the only one of the species.
- Observed: _to fill_

## 3. Criterion: Recipient: new specimen

- ⏭️ Expected: new specimen of the same species under the naming rule, `Caught_At` = local handover date, `Share = private`.
- ⏭️ Type plant: status plant and location of the current phase; cutting/offshoot: status Cutting and cutting light. Without a care profile the location reads unknown (P-08), never the giver's.
- ⏭️ Name conflict: provide a marker that already exists. Expected: swap stays `accepted`, reason reported, no half state (FR-SOZ-05).
- Observed: _to fill_

## 4. Criterion: Pokédex

- ⏭️ Expected: R catches the species automatically and sees "Newly caught" (US-POK-12).
- Observed: _to fill_

## 5. Criterion: No history passed on

- ⏭️ Expected: R's specimen has no measurements, treatments or giver location.
- Observed: _to fill_

## 6. Criterion: History and feed

- ⏭️ Expected: both see the swap in "Tauschverlauf" (US-SOZ-13); record whether the feed event "Swapped" exists (spec criterion; not stated as built).
- Observed: _to fill_

## Open points

- _to fill after the run (follow-up work, known limits, environment-specific changes not in the repo)_
