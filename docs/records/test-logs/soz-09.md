# Test log: US-SOZ-09 See offers from friends and request them (issue #817)

> **TEMPLATE, NOT EXECUTED.** This is a checklist derived from the acceptance criteria in `docs/specs/product/10-social.md`. No result has been recorded. Every item is ⏭️ until a person runs it by hand against the real app (skill `story-test-protocol`) and replaces the marker with what was observed. Never write ✅ for something only a test shows without saying so.

**Branch:** _to fill_
**Environment:** _to fill (OS, Node, ports from `.env.worktree`, browser, date, accounts used)_
**Method:** run `make ci` first (section 0), start the real stack (`make dev`, `make auth-up`), real login in the browser, screenshots at 1440x900 and 375x812 into a folder `soz-09/` named `NN-<state>-desktop.png` / `NN-<state>-mobil.png`. Check mobile: no horizontal scroll, tap targets at least 48 px. Quote UI texts as they appear (German).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ⏭️ `make ci` exit code and head commit:
- ⏭️ Tests covering the criteria (list test names with the story ID):

## Preparation

- ⏭️ Three accounts: requester (R), friend giver (G) with several open offers of different type and mode (species approved and not approved), a non-friend (S). Friendships confirmed between R and G only.
- ⏭️ G has one offer with a specimen whose species is on R's wishlist and one with a species R already caught.

## 1. Criterion: Open offers of all friends with species, type, mode, health details, photo, chip "you lack it"

- ⏭️ As R open "Tauschbörse". Expected: "Angebote von Freunden" lists G's open offers with species (German and Latin name, "Art unbekannt" if not approved), giver name, type, mode, note, health details (reason and date only, never agent or note), dormancy hint.
- ⏭️ Expected: chip "Fehlt dir" only on species R has not caught.
- ⏭️ As S and as G open the page. Expected: S sees no offers; G does not see own offers in the list.
- ⏭️ G switches "Everything private" on. Expected: G's offers vanish for R.
- Observed: _to fill_

## 2. Criterion: Filters

- ⏭️ Filter by type, then by "you lack it". Expected: list changes accordingly and an empty result says what to do next (P-09).
- ⏭️ Light-zone filter: record whether it exists (spec lists it; not stated as built).
- Observed: _to fill_

## 3. Criterion: "Request" creates a swap; counter-offer for mode `swap`

- ⏭️ Click "Anfragen" on a mode `swap` offer, attach one own specimen with `Share = friends`. Expected: request created, offer shows it.
- ⏭️ Request without attaching, with free text. Expected: return stays open as text.
- ⏭️ Try to attach a private specimen (API). Expected: refused.
- Observed: _to fill_

## 4. Criterion: Only one open request per offer; own offers cannot be requested

- ⏭️ Request the same offer a second time. Expected: refused with German text, no second swap.
- ⏭️ Request an own offer (API). Expected: refused.
- Observed: _to fill_

## 5. Criterion: Wishlist hint

- ⏭️ Expected: "Steht auf deiner Wunschliste" on the matching offer; confirm in the network log that G never receives R's wishlist (FR-WUN-07).
- Observed: _to fill_

## Open points

- _to fill after the run (follow-up work, known limits, environment-specific changes not in the repo)_
