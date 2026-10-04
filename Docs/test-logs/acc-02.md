# Test log: US-ACC-02 Profile and settings (issue #53)

**Branch:** `feat/acc-02-profil-und-einstellungen` (merged with `origin/dev` at 46020c6, which was already current)
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54647), API port 55147, web (Vite) port 55647, Keycloak 26.8 with the repo realm import in a throwaway container on port 55912 (redirect address of client `pflanzendex-web` adapted to port 55647 at runtime through the admin API, not in the repo). The shared test database (54329) and the shared sign-in service (18081) were not touched. Chromium via Playwright, locale de-DE, browser time zone `Asia/Tokyo` (deliberately not the Berlin default); date 2026-10-04.
**Method:** automated tests on all layers, `make ci`, then a manual run with a throwaway Playwright script (not checked in) against the real stack: accounts through the Keycloak admin API, everything else through the UI at 1440x900 and 375x812. Screenshots and raw measurements are in `acc-02/` (`observation.json`). Containers and servers were removed afterwards.

Legend: ✅ as expected · ⚠️ works, with a finding · ❌ error · ⏭️ not checked

## 0. Gates and red evidence

- ✅ `make ci` exit 0 (secrets, workflows, lint, types, boundaries, knip, specs, duplicates, format, docs, tests with coverage ratchet, CRAP, build).
- ⚠️ The tests were written together with the rework, not as a separate red run before it. Red evidence was produced afterwards by mutation: a time zone check that accepts anything turns 6 core tests red (`refuses the time zone ...`); an upsert that overwrites the display name from the token turns 3 API tests red (`a chosen display name survives the next sign-in`, ...). Both mutations were reverted.
- ⏭️ `make e2e` (shared suite) not run; no e2e test added.

## 1. Criterion: display name (free, not unique)

- ✅ By hand: the field starts with the name from the sign-in service ("Erika Testfrau"), saving "Erika Grünhand" persists across reload and across sign-out and sign-in again (the account page greets "Hallo, Erika Grünhand"; before the rework every sign-in overwrote it).
- ✅ Tests: core (`US-ACC-02 · display name`, two accounts may share a name), db (not unique), API (survives sign-in), web.
- ⚠️ Limit of 80 characters is an assumption (starting value). Clearing the name stores none; the next sign-in then takes the name from the sign-in service again.

## 2. Criterion: time zone, prefilled from the device, used by phases and due dates

- ✅ By hand: with the browser in `Asia/Tokyo` and no stored zone the field shows "Asia/Tokyo" with the hint "Vom Gerät übernommen. Speichere, um sie festzulegen." (`01-initial-*.png`). After saving `Pacific/Kiritimati` the hint is gone and the zone persists after reload.
- ✅ By hand: after saving, the treatments page requests `/treatments?timeZone=Pacific/Kiritimati` (profile zone, not the device zone); all eight date-dependent API clients use the same single source (`currentTimeZone()`). Test: `care/time-zone.test.ts`, `session.test.tsx` (zone applies right after sign-in).
- ✅ By hand: `Mars/Olympus` is refused, the page shows "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.", the field is marked (`aria-invalid`) and keeps the input (`03-invalid-zone-*.png`). Validation is against the time zone database in core; offsets like `+02:00` are refused (core test).
- ⏭️ Phases and due dates as computed values were checked only through the request parameter and unit tests, not by comparing a displayed date across zones.

## 3. Criterion: notifications per occasion

- ✅ By hand: six switches (Pflegephasen, Behandlungen, Messungen, Gießen, Tausch, Freunde), all on for a new account; switching Behandlungen and Tausch off survives reload (`04-switches-saved-*.png`). Unknown occasions or non-boolean values are refused, never dropped (core and API tests).
- ⚠️ Default "on" is an assumption (starting value). Time, quiet hours and pause belong to US-MON-08 and are not part of this story. No reminder is sent yet; the page says so.

## 4. Criterion: global switches "Everything private" and "No recommendations"

- ✅ By hand: both off for a new account, both saved and persisted after reload.
- ⚠️ They are stored only. Sharing (US-SOZ-04) and recommendations (US-EQU-11) do not exist yet, so the switches have no effect. Listed as missing in the spec status (🟨) and in the PR.

## 5. Tenant isolation (P-04)

- ✅ By hand: a second account sees its own defaults (private, all notifications on, device zone) and not the settings of the first (`07-other-account-*.png`).
- ✅ Tests with two accounts at all three levels: db (`ProfilePostgres`, direct statement on the foreign row changes 0 rows), core (foreign account ID in the input is ignored), API (HTTP, foreign ID in the body, row rule).

## 6. Layout and accessibility

- ✅ Desktop 1440x900 and mobile 375x812: no horizontal scroll, every input, checkbox row and button at least 48 px high (measured, `observation.json`).
- ✅ axe (wcag2a, wcag2aa, wcag21a, wcag21aa) on initial, invalid and saved states: no violations, both viewports.
- ⏭️ Keyboard-only run and screen reader not checked.

## Offene Punkte

- Effect of the two global switches (SOZ-04, EQU-11) and sending reminders with time, quiet hours and pause (MON-08).
- `make e2e` has no ACC-02 spec; the manual run above is not repeatable in CI.
- The profile API returns 403 `access.denied` while the data row does not exist yet (it is created by `GET /account`, which the web app calls first).
