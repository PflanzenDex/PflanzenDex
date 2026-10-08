# Test log: US-BEH-01 Plan treatment dates (issue #80)

**Branch:** `feat/beh-01-behandlungstermine-planen` (from `origin/dev` at 2be2d3d)
**Environment:** WSL2/Linux, Docker; PostgreSQL 16 in its own container (port 54700 from `worktree-env.mjs`), API port 55200, web (Vite) port 55700, Keycloak 26.8 with the repo realm import (redirect address adapted to 55700) in its own throwaway container on port 55800. The shared test database (54329) and the shared sign-in service (18081) were not touched. Chromium via Playwright (Europe/Berlin, de-DE).
**Method:** tests first (red runs in `beh-01/red-*.txt`), implementation, `make ci`, then a manual run with a throwaway Playwright script (not checked in) against the real stack: two accounts, species and specimens through the API, planning through the UI. Screenshots desktop 1440x900 and mobile 375x812 in `beh-01/`, raw measurements in `beh-01/observation.json`. Containers, servers and the script were removed afterwards.

Legend: OK as expected, WARN works with a finding, SKIP not checked

## 0. Red runs and gates

- OK Red: core 10 of 24 tests, db 7 of 8, api 14 of 14, web 5 of 5 (skeletons compiled, typecheck green).
- OK `make ci` exit code 0 (lint, types, boundaries, knip, specs/traceability, duplicates, format, docs, tests with coverage ratchet, CRAP, build).
- WARN The existing schema test `module-schema.test.ts` enumerates all cross-module foreign keys; its expectation got the one new key `treatment_specimen` (same kind as `measurement_specimen`).
- SKIP `make e2e` (shared suite) not run, no e2e test added.

## 1. Form: several specimens, reason, agent, date

- OK Tab "Behandlung" lists all active specimens as checkboxes, cutting included (`02-form-*.png`). Date starts at today (local date).
- OK Plant "Eins" and cutting "Steck" with reason "Wollläuse", agent "Neemöl", date two days ago: "2 Termine für 2 Exemplare geplant. Den nächsten Termin siehst du auf der Karte im Bestand." (`04-single-saved-*.png`); reason cleared after saving, specimen choice reset.

## 2. Without reason or date nothing is saved

- OK Nothing chosen: "Wähle mindestens ein Exemplar, das behandelt wird."; no reason: "Bitte nenne einen Grund, zum Beispiel Wollläuse." (`03-*.png`); no request is sent. Server side: core and API tests for blank reason, missing/invalid date, no specimen, bad course numbers (400 `input.invalid` with the field, nothing written).

## 3. Kur planen

- OK "Kur planen (mehrere Termine)" shows 3 dates and 7 days as default (`05-course-form-*.png`); Zwei, "Spinnmilben": "3 Termine für 1 Exemplar geplant."; core test checks N individual treatments at T days with one shared course id, month/year/leap-day crossings.

## 4. Specimen cards (TreatmentSource, US-BEH-04)

- OK Cards show "Behandlung: Wollläuse · überfällig seit 2 Tg." for Eins and Steck and "Spinnmilben · überfällig seit 2 Tg. · +2 weitere" for Zwei (`06-*.png`). Without treatment: "keine offene Behandlung" (`01-*.png`).
- WARN The course for Zwei started "today" in the script's clock but shows "überfällig seit 2 Tg." in the screenshot: the Zwei course in this run was entered with the date still set to two days ago (the form keeps the date after saving). Dates, "heute fällig" and "in N Tg." are covered by API tests with a pinned clock.

## 5. Repeat, archived, tenant isolation

- OK Same `Idempotency-Key` twice: 201 both times, same treatment ids (one write).
- OK Archived specimen: 409 `specimen.archived`, nothing written.
- OK Second account plans on the first account's specimen: 404 `specimen.not_found`; its own Bestand shows no treatment; the first account's card still shows one reason and one more (`07-*.png`). db and API tests with two accounts; `treatment` is in the generic tenant test with a fixture.

## 6. Layout and accessibility

- OK No horizontal scrolling at 375 px (`scrollWidth` 375), axe (WCAG 2.1 AA) on form, course form and cards: no violations, desktop and mobile.
- WARN The raw measurement lists the 24 px checkbox inputs as small; their labels are 48 px high and are the touch target (same pattern as the existing forms).
- SKIP Dark scheme, keyboard-only use, screen reader.
- A layout finding (two-column grid made the form uneven on desktop) was fixed before the final screenshots.

## Open points

- BEH-02 (list of open dates), BEH-03 (ticking off, done date), FR-BEH-05 (reminder), EQU-05 (agent linked to equipment) are not part of this story.
- Date input shows the browser's locale format (en-US in headless Chromium).
