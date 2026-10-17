# Test log: US-LIC-02 Know where there is still room (issue #66)

**Branch:** `feat/lic-02-wissen-wo-noch-platz` (PR #252)
**Environment:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54808 from `worktree-env.mjs`), API port 55308, web (Vite) port 55808, own Keycloak 26.8 (container `pflanzendex-kc-lic02`, port 55408, realm from `app/dev/keycloak` with a redirect address adapted at runtime and two imported test accounts, not in the repo); Chromium (headless) via Playwright; date 2026-10-03.
**Method:** tests and gates automatically, then manual operation (Playwright script) against the real Keycloak with the accounts `mara-lic2` and `ben-lic2`. The data were created through the API, the view was looked at in the browser. Screenshots desktop 1440×900 and mobile 375×812 in `lic-02/`.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ✅ Red tests before the implementation: `lic-02/red-core.txt` (12 of 12 red), `red-api.txt` (6 of 7 red, the test for 401 happened to run green because the route was already protected as `/specimens/:id`), `red-web.txt` (8 of 9 red).
- ✅ Green afterwards: core 12, API 7, web 161 tests (total).
- ✅ `make gates` (lint, types, boundaries AB-7 to AB-14, knip, format, spec, duplicates) exit code 0.
- ✅ `make coverage` (threshold ratchet ok), `make crap` (max. 21.8, limit 450), `make duplicates` (0 groups).
- ⏭️ `make ci` as a whole, Playwright E2E (`make e2e`) and Lighthouse were not run locally; CI takes care of that on the PR.

## 1. Criterion: count per zone 2 to 4 at specimen level, specimen before species, cutting light does not count

**Expected:** the count per zone 2 to 4; the zone of the specimen before that of the species; cutting light not counted.

**Observed:**

- ✅ With four specimens (window sill ×2, shelf, desert bench): Lampe 2: 2, Lampe 3: 1, Lampe 4: 1 (`02-tie-*.png`).
- ✅ A specimen at the location "Steckling-Ecke" (Lampe 1) is not counted and is listed under "Nicht mitgezählt: 1 unter Stecklingslicht" (`03-not-counted-*.png`).
- ✅ An archived specimen is not counted and is named ("1 archiviert").
- ✅ A specimen without location is assigned to Lampe 2 via the lux demand of the species (15,000 lux, level 2); the card shows "Lichtzone: unbekannt" for it. That is intended (zone of the species as fallback), but may irritate.
- ✅ Tests: core (count, specimen before species, fallback to species, cutting, archived, zone unknown), API against the real database.
- ⚠️ **Assumption:** archived specimens do not count (the spec says nothing about it). The status "cutting" counts as cutting light (FR-LIC-02).
- ⚠️ **Limit:** the specimen has no zone field of its own yet (BES-04/BES-09). "Specimen before species" works through the location and the status. The catalog field for soft-leaved C3 plants is missing, the derivation never assumes it.

## 2. Criterion: the display names the thinnest zone; with a tie all of them with a hint to the wishlist

**Observed:**

- ✅ Tie: "Lampe 3 und Lampe 4 sind gleich dünn besetzt (je 1 Exemplar)." with the action "Setze Arten für diese Zonen auf die Wunschliste."; both rows marked "dünnste Zone" (`02-tie-*.png`).
- ✅ Single thinnest zone: "Lampe 3 ist die dünnste Zone (1 Exemplar)." with "Hier ist noch Platz: …" (`04-thinnest-single-*.png`).
- ✅ Without zones: "Es gibt keine Lichtzone für erwachsene Pflanzen." with an action (P-09) (`01-without-zones-*.png`).
- ⚠️ **Limit:** the wishlist (WUN) does not exist yet; the hint only refers to it in the text, without a link.

## 3. Tenant

- ✅ The account `ben-lic2` sees after Mara's setup only the empty state without zones and no names or numbers of Mara (`05-foreign-account-*.png`).
- ✅ Tests: core (two accounts) and API (`an account sees only the distribution of its own specimens and zones`). There is no new table, hence no migration and no new entry in the tenant test of the tables.

## 4. Presentation

- ✅ Mobile (375 px) and desktop: no horizontal scroll (document width equals window width in all shots); console without errors and warnings.
- ⏭️ Dark mode, keyboard operation and screen reader were not checked by hand. The bar is `aria-hidden`, the number is in the text.

## Open points

- Own zone field on the specimen (BES-04/BES-09) and the link with the wishlist (WUN, FR-LIC-04).
- ADR 0003 O-4 (place of the derived light views) is open; the view lives provisionally in `collection`.
