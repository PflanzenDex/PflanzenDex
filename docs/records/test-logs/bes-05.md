# Test log: US-BES-05 Compare species by difficulty (issue #61)

**Branch:** `feat/bes-05-arten-nach-schwierigkeit` (PR #284, from `origin/dev` at `400e6f4`)
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54745), API port 55245, web (Vite) port 55745, own throwaway Keycloak 26.8 (port 18868, realm import from `app/dev/keycloak` with the redirect address changed to the web port and e-mail verification switched off; none of this is in the repo); Chromium (headless) via Playwright (Europe/Berlin, de-DE); date 2026-10-04. The shared database (54329) and shared Keycloak (18081) were not touched.
**Method:** red tests first (`red-core.txt`, `red-api.txt`, `red-web.txt`, each with exit code 1), implementation, `make ci`, then a Playwright script (not checked in) against the real stack: two accounts created through the Keycloak admin API, real login in the browser, species and specimens created through the API with the user's token, views at 1440x900 and 375x812, axe-core 4 (WCAG 2 A/AA, 2.1 A/AA) injected into the page. Screenshots, axe results, raw observations (`observation.json`) and the script output (`run-output.txt`) are in `bes-05/`. The API ran with the own database URL; the own database holds the accounts of the runs.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ✅ Red runs saved before the implementation: core (module missing), API (4 of 5 fail; only "requires authentication" passes because the unknown route answers 401), web (new tab and page missing).
- ✅ `make ci` exit code 0 (result of the final run is in the PR Handoff).
- ⏭️ `make e2e` and Lighthouse were not run locally; CI covers them. No e2e spec was added for this story.

## 1. Criterion: one row per species with at least one active specimen, sorted by difficulty

**Observed (real browser):**

- ✅ Four species with active specimens gave four rows; "Kannenpflanze" has two specimens and appears once.
- ✅ A species whose only specimen was archived ("Geigenfeige") is not listed (`archived-species-listed: false`).
- ✅ Order Leicht, Leicht, Mittel, Schwer; within one difficulty by botanical name (Aloe vera before Dracaena trifasciata).
- ✅ Difficulty 1/2/3 shows as "Leicht" / "Mittel" / "Schwer".

## 2. Criterion: columns

- ✅ Header cells: Art, Botanischer Name, Lichtzone, Gießregel, Substrat, Schnitt, Erfolgskriterium, Schwierigkeit.
- ✅ The light zone comes from the lux demand (Aloe 60,000 lux, standard level 3: "Lampe 3"; 15,000 and 20,000 lux: "Lampe 2").
- ✅ Values the catalog does not have (watering hint, substrate, pruning of two species) read "unbekannt" (P-08).
- ✅ After deleting all light zones of the account the zone column says "unbekannt" for every row (`03-zone-unknown-*.png`).
- ⚠️ **Limit:** the watering rule is the catalog's watering hint; the keeper's own interval from the care profile (US-BES-09) is not shown. The zone is the derived zone, not the zone of a location or a deviation in the keeper's profile. Noted in the spec.
- ⚠️ **Limit:** the catalog has no soft-leaved C3 field yet (US-LIC-01), so the zone derivation never assumes one.

## 3. Empty state and next step (P-09)

- ✅ A new account sees "Noch keine Art mit aktivem Exemplar: Lege im Bestand ein Exemplar an, dann erscheint seine Art hier." (`01-empty-*.png`).
- ⚠️ The empty state has text only, no button to the collection (the generic tab views get no navigation callback); the tab "Bestand" is one tap away.

## 4. Tenant isolation

- ✅ The second account `ben` sees the empty state and none of the species of `mara` (`04-other-account-desktop.png`, 0 rows).
- ✅ Two-account tests in core and API.

## 5. Layout: mobile 375x812 and desktop 1440x900

- ⚠️ **Finding, fixed:** the first run showed the whole page 736 px wide on a phone because the eight-column table stretched the grid item `.frame`. Fixed with `min-width: 0` on the frame; the table now scrolls inside its own frame (page `scrollWidth` 375 at 375 px, table 805 px inside a 307 px frame).
- ⚠️ **Finding, fixed:** in the 720 px column of the other views the last two columns, including the sort criterion "Schwierigkeit", were cut off. The view now gets a wider frame (`.frame:has(.difficulty-page)`, up to 1200 px); at 1440 px all eight columns are visible without scrolling.
- ⚠️ **Side effect:** with the wider frame the navigation tabs wrap differently on this tab (the last row stretches); the tabs do not change on the other views. Cosmetic, not changed.
- ✅ No horizontal page scroll at either size (`observation.json`, `*-scroll`).
- ✅ No visible button, link, input or select under 44 px height on the phone (`mobil-small-targets: []`).
- ⚠️ On the phone the user scrolls the table sideways; a hint ("Die Tabelle lässt sich seitlich scrollen.") appears below 760 px. The scroll frame is a focusable region; keyboard scrolling was not tried by hand.

## 6. Accessibility (axe)

- ✅ axe-core: 0 violations on the empty state (desktop) and on the overview with data (desktop and phone) in the last run. A first run reported `scrollable-region-focusable` for the scroll frame; fixed with `tabindex="0"`, role and label.
- ⏭️ Not run on the unknown-zone and other-account states. A manual screen reader test was not done.

## Open points

- The keeper's own watering interval (care profile) and zone deviation are not part of the table.
- Dark mode was not looked at.
