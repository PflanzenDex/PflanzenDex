# Test log: US-LIC-03 Know how close the plant belongs to the lamp

**Branch:** `feat/lic-03-wissen-wie-nah-die` (PR #277)
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54402), API port 54902, web (Vite) port 55402, own throwaway Keycloak 26.8 (port 55412, realm from `app/dev/keycloak` with the redirect address changed to the web port, e-mail verification switched off and two imported test accounts `mara-lic3` and `ben-lic3`; none of this is in the repo); Chromium (headless) via Playwright; date 2026-10-04.
**Method:** automated tests and gates first, then a Playwright script against the real stack: real Keycloak login, data created through the API with the user's token, views looked at in the browser at 1440×900 and 375×812, axe-core 4 (WCAG 2 A/AA tags) injected into the page. Screenshots, axe results and the script output are in `lic-03/` (`run-output.txt`, `axe-*.json`).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ✅ `make ci` exit code 0 on this branch (lint, types, boundaries, knip, specs, duplicates, format, docs, coverage ratchet, CRAP, build).
- ⏭️ No red-run log for the tests exists. The tests were written together with the implementation, and the fixes after the review were not run red first.
- ⏭️ Playwright E2E (`make e2e`) and Lighthouse were not run locally; CI covers them.

## 1. Criterion: one row per species with at least one active specimen, sorted descending by demand

**Expected:** one row per species, archived specimens do not count, highest demand first.

**Observed:**

- ✅ Seven species with active specimens (110,000 down to 3,999 lux) gave seven rows, in descending order (`02-overview-*.png`, `run-output.txt`).
- ✅ A species whose only specimen was archived ("Hotel archived", 70,000 lux) is not listed.
- ✅ The sort order and the single row per species are also covered by core tests (`light-overview.test.ts`) and the API test; the web test only checks that the delivered order is kept.
- ⚠️ "Set lux demand" is always true: the catalog field `lightDemandLux` is mandatory (1 to 200,000), so a species without demand cannot exist and no such row case is tested.

## 2. Criterion: position mapping by lux demand

**Observed (real values in the browser):**

- ✅ 110,000 and 50,000: "direkt unter der Lampe"; 49,999 and 15,000: "sehr nah (~10 cm)"; 8,000: "nah (~20–30 cm)"; 4,000: "mittlerer Abstand (~40 cm)"; 3,999: "darf weiter weg stehen".
- ✅ The boundaries 49,999, 14,999, 7,999 and 3,999, and NaN, negative and infinite input are covered by unit tests.
- ⚠️ **Assumption:** the cm values come from the spec table (prototype); they are not measured here.

## 3. Criterion: columns plant, zone, lux demand (locale-formatted), position; thresholds adjustable

**Observed:**

- ✅ Columns "Art", "Lichtzone", "Lux-Bedarf", "Position"; lux demand with the German separator ("110.000", "50.000", "3.999").
- ✅ With the default zones the zones are Lampe 2 to Lampe 4 (derived from the lux demand, standard level and the account's zones).
- ✅ After deleting all light zones of the account the zone column says "unbekannt" for every row (`03-zone-unknown-*.png`); nothing is invented (P-08).
- ❌ **Not implemented:** the thresholds are not adjustable. They are fixed defaults in `core` (account setting, related FR-LIC-05, is missing). This is why the story stays 🟨.
- ⚠️ **Limit:** the catalog has no field for soft-leaved C3 plants yet (open under US-LIC-01), so the zone derivation never assumes one.

## 4. Empty state and next step (P-09)

- ✅ A new account sees "Noch keine Arten mit aktivem Exemplar und gesetztem Lux-Bedarf. Lege ein Exemplar an oder aktualisiere den Lux-Bedarf einer Art." and the button "Zum Bestand" (`01-empty-*.png`).
- ✅ The button switches to the tab "Bestand" (that tab got `aria-current=page`). The app has no routes, the address stays `/`. Also covered by an App test.

## 5. Tenant isolation

- ✅ The second account `ben-lic3` sees the empty state, not the species of `mara-lic3` (`04-other-account-*.png`).
- ✅ Two-account tests in core and API.

## 6. Mobile 375×812 and desktop 1440×900

- ⚠️ **Finding, fixed:** in the first run the table had no styling on a phone: no border, no space to the card below, columns squeezed. A second attempt with `overflow-wrap: anywhere` broke "Lampe 4" and "110.000" in the middle of the word. The final CSS for `table.light-overview` (border, padding, numbers on one line) was checked in the last run (`02-overview-mobil.png`).
- ✅ No horizontal scroll in any screenshot (scrollWidth equals clientWidth at both sizes), see `run-output.txt`.
- ✅ No visible button, link, input or select under 48 px height on the checked pages (`run-output.txt`).
- ⚠️ Text columns wrap onto several lines on a phone (position texts up to three lines). Readable, but the table is tall.

## 7. Accessibility (axe)

- ✅ axe-core: 0 violations (WCAG 2 A/AA) on the empty state and on the overview with data (`axe-01-empty.json`, `axe-02-overview.json`). Not run on the unknown-zone and other-account states. Automated checks do not replace a manual screen reader test (⏭️ not done).

## Open points

- Adjustable thresholds (account setting, FR-LIC-05) are missing; the status stays 🟨.
- The zone shown is the zone of the species derived from its lux demand, not the location of a specimen.
- Environment note: the first script run wrote its data into the shared test database because the API was started without the worktree database URL. Only the rows of that run were removed again by targeted delete; the empty account of `ben-lic3` may still exist there.
