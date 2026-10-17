# Test log: US-PHA-03 Confirm the move with a tap (issue #72)

**Branch:** `feat/pha-03-umstellung-per-tipp` (from `origin/dev` at 0532f9f, after US-BES-08 and US-WAC-01)
**Environment:** WSL2/Linux, Node 25, Docker; PostgreSQL 16 in its own container (port 54756 from `worktree-env.mjs`), API port 55256, web (Vite) port 55756, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 55856 (the shared sign-in service on 18081 was not touched). The realm is a copy with an adapted redirect address; it lives outside the repo. Chromium via Playwright (time zone Europe/Berlin, locale de-DE); date 2026-10-04.
**Method:** tests first (red runs in `pha-03/red-*.txt`), then implementation, `make ci`, then manual operation (Playwright script, not checked in) against the real stack. Species, locations and specimens were created through the API with the token of the account, the screens through the UI. Screenshots desktop 1440x900 and mobile 375x812 in `pha-03/`, raw measurements (texts, API responses, axe, target sizes) in `pha-03/observation.json`. Containers, servers and temporary files were removed afterwards.

**Important for reading this log:** the care profile (US-BES-09) does not exist, so the running product has no source for "target location per phase". For the manual run the API was started with a **stub source** (the account's locations named "Kühler Flur" in dormancy and "Wohnzimmer" in the growth phase), written for this run and not part of the product. Without the stub, the real default is "unknown": see section 5.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Red runs and gates

- ✅ `red-core.txt` 20 of 34 red, `red-db.txt` 6 of 6, `red-api.txt` 14 of 15, `red-web.txt` 12 of 17. The skeletons compiled (typecheck green), the operations answered `system.unexpected`, the store method threw "not implemented", the pages had no buttons.
- ⚠️ In `red-web.txt` the 5 green tests are the two small API client tests per file: the two client functions were written with the skeleton, so only the page tests were red for them. One page test (reload after a refusal) was added after the red run.
- ✅ `make ci` exit code 0 (secrets, workflows, lint, types, boundaries AB-7 to AB-14, knip, spec/principles/skills, duplicates, format, docs, tests with coverage ratchet, CRAP, build). Only "threshold could rise" hints, thresholds untouched. Tests: core 340, db 126, api 146, web 223.
- ⏭️ `make e2e` (the shared Playwright suite) was not run and no e2e test was added: the shared suite needs the fixed ports 5173/18081 and the real API without a care profile, where the flow cannot be completed. The manual run below replaces it for this story.

## 1. Criterion: "Jetzt umgestellt" sets the location to the target location (selected, never typed) and updates the row immediately

- ✅ Tap on one row (`02-nach-einzel-tipp-*.png`): the page says "„Opuntia ruhend – Kaktus“ steht jetzt am Standort „Kühler Flur“.", the row now shows Standort = Soll-Standort and loses its button; the database value was checked through the API (`kaktusNow: true`).
- ✅ The target comes from the server (port `PhaseLocationSource`), not from the request: core test "the location is never taken from the input, extra fields are dropped"; the request body carries only IDs of specimens and the time zone.
- ✅ The phase is the one of the **local** date: core test with `2026-10-31T23:30Z` (dormancy in Berlin, growth in UTC), API test with the same instant. By hand the browser time zone was Europe/Berlin; the growth phase of 2026-10-04 and the dormancy phase of the species with 10-01..04-30 were both confirmed.
- ✅ List and confirmation share the derivation (`phaseRows`): a core test shows the list afterwards with `locationId == targetLocationId`.
- ✅ BES-08 consistency: a specimen without location has the hint `location_missing`; after the switch (core and API tests) it is gone and only `location_without_zone` remains for the new location (by hand: hints page, `05-*.png`).
- ⚠️ Locations have no light zone in this run, so the hints page also lists "steht am Standort …, der noch keine Lichtzone hat" for every specimen that was moved. That is the existing BES-08 hint working, not a fault of this story.

## 2. Criterion: idempotent, a double tap creates no duplicate

- ✅ Double click on the button: exactly one `POST /care-phases/confirm` left the browser (`doubleTapPosts: 1`; the button is blocked while the request runs, web test "a double tap sends one request").
- ✅ Same `Idempotency-Key` twice: stored answer replayed, the store is not written again (core and API tests).
- ✅ New key, same specimen: `changed: false`, nothing written (core, API; by hand `repeat` in `observation.json`).
- ✅ There is no move history, so there is no entry to duplicate; the location is the only stored fact (documented in the spec).

## 3. Criterion: several specimens with the same target in one step

- ✅ Button "Alle 2 nach Wohnzimmer umstellen" appears only for two or more specimens with the same target (`01-*.png`); one tap sent both IDs in one request and the page said "2 Exemplare stehen jetzt am Standort „Wohnzimmer“." (`03-*.png`); both rows in the database were at the target.
- ✅ All or nothing (core, API, db tests): a cutting, an archived or foreign specimen, a species without dormancy period or an unknown target stops the whole step, names the specimen (`data.specimenId`) and writes nothing; a location of another account violates the composite foreign key and rolls back.
- ⏭️ Specimens with different targets in one call are possible through the API (each to its own target; core test), but the page offers groups per target only.

## 4. The plain location change that BES-08 named as its main gap

- ✅ Hints page: for "hat noch keinen Standort" a choice among the account's own locations and the button "Standort setzen" (`04-*.png`); the button is disabled until a location is chosen; after the tap "„Efeutute – Grün“ steht jetzt am Standort „Wohnzimmer“." and the hint is gone (`05-*.png`). The hint "Standort ohne Lichtzone" keeps its link to "Standorte und Licht".
- ✅ Without any location the hint says to create one first and links to "Standorte und Licht" (web test).
- ✅ Cuttings can be placed and stay cuttings under cutting light (core and API tests, BES-04 rules); the cutting shows in the hints like a plant, as before.
- ✅ Archived specimens keep their location: `specimen.archived` (core, db, API).

## 5. Without a care profile (the real default)

- ✅ Account without any target (`09-ohne-soll-standort-*.png`): the row shows "Soll-Standort: unbekannt", **no** button; `POST /care-phases/confirm` answers 409 `care.target_unknown` with the text "Für dieses Exemplar ist noch kein Soll-Standort bekannt. Weise den Standort stattdessen selbst zu."; the specimen stays where it was (`stillAt: true`).
- ⚠️ **Limit:** until US-BES-09 implements the port, the running product has no target location, so in production "Jetzt umgestellt" never appears. The story therefore stays 🟨 and the changelog entry says so.

## 6. Refusals stay visible, stale lists heal (P-10)

- ✅ A specimen archived behind the open page's back, then "Jetzt umgestellt": the alert "Dieses Exemplar ist archiviert. Stelle es zuerst wieder her, dann kannst du damit arbeiten." stays, the list is loaded again and the archived row is gone (3 rows left), `07-*.png`. First manual run showed the stale row still listed; the hook now reloads after a refusal too (web test "after a refusal the list is loaded again").
- ✅ Without sign-in the tap sends nothing and asks to sign in (web test).

## 7. Tenant isolation (P-04)

- ✅ Core, db and API tests with two accounts. By hand: Ben's phase list is empty (`08-*.png`), his `POST /care-phases/confirm` and `POST /specimens/:id/location` for Mara's specimen answer 404 `specimen.not_found`, Mara's specimen stays at its target; Ben setting his own specimen to Mara's location gets 404 `location.not_found`. No new table or migration, so no new tenant fixture was needed (the location column and the composite foreign key `specimen_location` already exist).

## 8. Layout and accessibility (rough)

- ✅ Mobile 375 px: no horizontal scrolling (`scrollWidth` 375), no button or select below 44 px height on the hints page (`smallTargets: []`); axe (WCAG 2.1 AA) on the phase list and the hints page, desktop and mobile: no violations.
- ⏭️ Dark scheme, keyboard-only use and screen reader not checked.

## Open points

- Target location per phase: care profile (US-BES-09) must implement `PhaseLocationSource`; then the same source can feed `TargetLocationSource` for new specimens (FR-PHA-05).
- Deviations first (US-PHA-02, issue #71, not built): the list is still sorted by name; the deviation is visible per row by its button.
- No move history; FR-PHA-06 (reminder on the day of the phase change) is untouched.
- Editing a specimen's location outside the hint (BES-03) has no screen.
