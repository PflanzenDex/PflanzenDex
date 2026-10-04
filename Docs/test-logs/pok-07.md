# Test log: US-POK-07 Catch date and photo honest (issue #93)

**Branch:** `feat/pok-07-fangdatum-und-foto-ehrlich` (first run from `origin/dev` at `b78a9b6`; `dev` at `1376dd2`, with ACC-02, was merged afterwards and the review fix below runs on that base)
**Environment:** Linux, Docker; PostgreSQL 16 in its own container (port 54453 from `worktree-env.mjs`), API port 54953, web (Vite) port 55453, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18853 (the shared sign-in service on 18081 and the shared test database on 54329 were not touched). The realm is a copy with the redirect address changed to `http://localhost:55453`; the accounts `anna` and `ben` were created through the admin API (email confirmed). Chromium through Playwright (time zone Europe/Berlin, locale de-DE); date 2026-10-04.
**Method:** unit and API tests first, then implementation, `make ci`, then operation by hand (Playwright script, not checked in) against the real Keycloak, API and database. Species and specimens were created through the API with the token read from the signed-in browser session. The dates were then shaped with SQL on the own throwaway database, because no screen or operation sets `caught_at`, archives into the past or changes the creation moment. The Pokédex view was operated in the browser. Screenshots desktop 1440×900 and mobile 375×812 and the raw observations (card texts, axe, horizontal scroll) are in `pok-07/` (`observation.json`). The throwaway Keycloak, servers and database container were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but something stands out · ❌ error · ⏭️ not checked

**What this is about:** each caught species card now shows its catch date, derived live (P-01, nothing stored): the earliest date across all active and archived specimens of the species. Per specimen the source order is `caught_at` (exact), else the local date of the creation moment (shown as "≈"), else "Datum unbekannt". `specimenCatchDate` and `earliest` (core, `catch-date.ts`) compute it, `GET /pokedex/ownership?timeZone=…` serves it (the web sends `currentTimeZone()`: profile zone, device zone as fallback), the tab "Pokédex" shows it.

**Not part of this change (spec status 🟨):** the photo criterion. The latest measurement photo needs measurement photos (WAC-05, no photo column exists) and the Wikipedia image needs the taxonomy build (POK-03, no catalog tree yet). No photo is shown and nothing is invented (P-08).

---

## 0. Red runs and gates

- ✅ Core tests (`catch-date.test.ts`, extended `ownership.test.ts`) were run before the implementation and were red (11 of 28 failed). The terminal output was not saved to a file.
- ⏭️ No saved red run for the API and web tests; the new API test "without a valid time zone: 400" and the web tests could only fail before the change (the route ignored the parameter, the page showed no date), but this was not run separately.
- ✅ `make ci` on this branch: exit 0 with its own test database (port 54453): secrets, workflows, lint, types, boundaries, unused code, format, docs, tests with coverage ratchet, CRAP (max 21.8), build. The first run failed on the file-length rule in `collection/test-helpers.ts` (201 lines, limit 200); fixed by merging two import lines, second run green.

## 1. Criterion: earliest date across active and archived specimens

**Expected:** the catch date of a species is the earliest date across all active and archived specimens of the keeper.

**Observed:**

- ✅ By hand: species `Citrus limon` with one active specimen (`caught_at` 2026-06-01) and one archived specimen (`caught_at` 2025-02-03, reason "abgegeben") shows "gefangen 03.02.2025", with "1 Exemplar" (the archived one does not count as specimen, `01-caught-dates-*.png`).
- ✅ Species `Ficus lyrata` with only an archived specimen is not on the page (archived does not catch, POK-06 unchanged).
- ✅ Unit tests: earliest of several, across cultivar chips, archived counts for the date, archived-only species has no card, earlier approximate beats later exact, unknown never hides a known date, foreign specimens never influence the date.
- ✅ API test with real PostgreSQL: same constellation through `GET /pokedex/ownership`.

## 2. Criterion: source order `Caught_At` → creation date "≈" → unknown, never guessed

**Expected:** exact date from `Caught_At`; without it the creation date with "≈"; without both "unknown".

**Observed:**

- ✅ By hand: a specimen created through the app without edits shows today's date, "gefangen 04.10.2026" (`Echeveria elegans`; the creation sets `caught_at` to the local today, US-BES-04).
- ✅ By hand: `Aloe vera` with `caught_at` empty and creation moment 2026-08-15 22:30 UTC shows "gefangen ≈ 16.08.2026": the local date in Europe/Berlin, not the UTC date (NFR-08). Unit and API tests also check `UTC` and `America/Los_Angeles` (15.08.2026) for the same instant.
- ✅ Unit test: without `caught_at` and with an unreadable or missing creation moment the result is `{ date: null, source: "unknown" }`.
- ⏭️ "Datum unbekannt" by hand: the database column `created_at` is `not null`, so a real specimen always has at least the creation date; the state occurs only in unit and web tests ("Datum unbekannt", no made-up date).
- ✅ The time zone is the profile zone (US-ACC-02, `currentTimeZone()`), with the device zone as fallback; see section 7 for the hand run with a profile zone that differs from the device zone. Exact dates (`caught_at`) are calendar dates and do not move.
- ⚠️ Spec wording is "creation date of the specimen"; the implementation uses the creation moment converted to the local calendar date. Assumption, stated here.

## 3. Criterion: photo = latest measurement photo, otherwise Wikipedia image

**Observed:**

- ⏭️ Not implemented, not tested. Neither source exists yet (see above). The cards show no photo and no placeholder claim. Recorded in the spec status and the PR handoff.

## 4. Tenant isolation (P-04, P-05)

**Observed:**

- ✅ Account `ben` sees "Noch keine Art gefangen. Lege ein Exemplar mit bestimmter Art an, dann zählt es." and none of the species or dates of `anna` (`02-other-account-empty-*.png`, `observation.json`).
- ✅ Two-account tests in core (an older foreign specimen of the same species does not change the date) and API (own date of the second account). The route adds no table, so no new generic tenant test.

## 5. Layout and accessibility

- ✅ Mobile (375×812) and desktop (1440×900): no horizontal scroll (`observation.json`, `horizontalScroll: false`). The cards stack on the phone.
- ✅ axe (WCAG 2.1 A/AA) on the Pokédex view with three caught species and on the empty view of the second account, desktop and mobile: no violations.
- ⏭️ Tap target sizes, dark scheme, keyboard and screen reader not checked in this run (the page has no new controls).
- ⏭️ Loading and error states only through the web tests.

## 6. Open points


- Photo (both sources) waits for WAC-05 and POK-03; US-POK-07 stays 🟨 until then.
- The chip wording "gefangen ≈ 16.08.2026" puts the card text in the page; the full collector card (number, tree order, chip styling) is POK-01.
- Environment: the first Keycloak start imported a stale `realm.json` that another session had left in the shared scratchpad folder; it was restarted with an own folder. Not a product finding.

## 7. Review fix: profile time zone (second Playwright run)

After the review, `ownership-api.ts` uses `currentTimeZone()` (profile zone, device fallback) instead of the device zone. The red run of the new web tests is in `pok-07/red-web-profile-zone.txt` (1 failed: the request still carried the device zone). Base of this run: branch head after merging `dev` at `1376dd2` (ACC-02). The `make ci` run before that merge is superseded by the run after the merge and this fix. Same stack as above (own database 54453, API 54953, web 55453, throwaway Keycloak 18853; fresh database, new account `anna`, same species and date shaping as in section 1). Browser (device) zone Europe/Berlin; profile zone set through the settings page ("Einstellungen", field "Zeitzone", "Speichern") to `Pacific/Honolulu`. Raw data: `pok-07/observation-profile-zone.json`, screenshots `pok-07/03-profile-zone-desktop.png` and `-mobile.png` (taken after the reload with the profile zone set).

- ✅ Before saving a profile zone the page requests `timeZone=Europe/Berlin` (device fallback) and `Aloe vera` (creation moment 2026-08-15 22:30 UTC) reads "gefangen ≈ 16.08.2026".
- ✅ After saving `Pacific/Honolulu` in the settings, opening the Pokédex requests `timeZone=Pacific/Honolulu` and the same card reads "gefangen ≈ 15.08.2026" (local date in Honolulu). After a reload (profile loaded from the server) it still reads 15.08.2026.
- ✅ Exact dates do not move ("gefangen 03.02.2025", "gefangen 04.10.2026"), same on desktop and mobile; no horizontal scroll; axe: no violations.
- ⚠️ The database of this run held leftover specimens of an aborted first script run (another account); the observations are those of the second account only.
- ⏭️ Dark scheme, tap targets and keyboard not re-checked.
