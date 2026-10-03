# Test log: US-BES-02 Create a specimen (issue #58)

**Branch:** `feat/bes-02-exemplar` (from `origin/feat/bes-01-art`, contains until its merge the commits of #225, #229, #230, #224)
**Environment:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54874 from `worktree-env.mjs`), API port 55374, web (Vite) port 55874, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18681 (the shared sign-in service on 18081 belongs to another session and was not touched). For the test a copy of the realm with an adjusted redirect address (port 55874) and two pre-confirmed test accounts (`mara-bes2@…`, `ben-bes2@…`) was used; it lies outside the repo. Chromium via Playwright (browser time zone Europe/Berlin); date 2026-10-03.
**Method:** tests first (red runs in `bes-02/red-*.txt`), then implementation, `make ci`, then manual operation (Playwright script) against the real Keycloak. Screenshots desktop 1440×900 and mobile 375×812 in `bes-02/`, the raw observations in `bes-02/observation.json`. Container and servers were removed afterwards. The app UI is German; quoted UI texts are given verbatim.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

Note: the code was renamed to English after this test (e.g. table `exemplar` is now `specimen`, port `SollStandortQuelle` is now `TargetLocationSource`); the log keeps the names of the time of the test. The raw `red-*.txt` outputs are unchanged evidence of the German-named test runs.

---

## 0. Red runs before the implementation and gates

**Expected:** the tests from the criteria fail as long as the function does not exist; afterwards `make ci` is green.

**Observed:**

- ✅ `red-core.txt`: 28 of 30 tests red (skeleton without behavior; 2 tests happened to run green because the skeleton rejects anyway).
- ✅ `red-db.txt`: 5 of 6 tests red because the table `exemplar` is missing.
- ✅ `red-tenant-test.txt`: with the migrations, but without a fixture, the generic tenant test fails on `exemplar: keine Fixture in fixtures.ts` (2 tests red). The module and AB-10 test stayed green: the composite foreign key to `standort` is allowed.
- ✅ `red-api.txt`: all 14 API tests red (route missing).
- ⚠️ `red-web.txt`: red only because the modules were missing (import not resolvable), not with individual red checks.
- ✅ `make ci` exit code 0 with all gates (lint, types, boundaries, baseline, knip, format, spec and traceability check, docs, tests with coverage thresholds, build).

## 1. Criterion: the species is required; prefill

**Expected:** with the species a specimen arises; name per naming rule, location per phase, `Gefangen_Am` = today's local date, empty measurement series and treatment list.

**Observed:**

- ✅ From the catalog "Diese Art wählen" opens the form "Exemplar anlegen" with species, name preview "Name: Bogenhanf" and no required field except the species (`03-form-*.png`, 0 `required` fields in the form).
- ✅ Creating only with the species: specimen "Bogenhanf", "Gefangen am 03.10.2026" (expected per Berlin date: 03.10.2026), "noch keine Messung · keine Behandlung" (`04-created-*.png`). Measurement series and treatment list are derived and empty (core test, no entry in the database).
- ✅ The list persists after reloading (2 specimens).
- ⚠️ **Limit (target location):** the location is "unbekannt" as long as the keeper chooses none, and the page says so openly. The target location of the phase is supplied by the port `SollStandortQuelle`, which only `pflege` (PHA) and the care profile (BES-09) implement. The core tests check the port with a stub (species and local date arrive, the answer is adopted, `null` stays `null`); with real phase logic it is not checked (⏭️).
- ⚠️ Assumption: the specimen name uses the German name of the species, otherwise the Latin one.

## 2. Criterion: Gefangen_Am in the local date

**Expected:** the date follows the user's time zone, not UTC (FR-BES-04, NFR-08).

**Observed:**

- ✅ Tests (`datum.test.ts`, `anlegen.test.ts`): the same moment 23:30 UTC yields the 3rd in Berlin, the 2nd of October in New York; the clock change on 2026-03-29 shifts nothing; the database delivers the date as text, even with a deviating `TZ` of the server.
- ✅ By hand (API with a real token): `Pacific/Kiritimati` yields `2026-10-04`, UTC was still the 3rd; an unknown time zone is rejected with `eingabe.ungueltig`.
- ⚠️ For now the device sends the time zone with every creation; the profile has none yet (US-ACC-02).

## 3. Criterion: the name is fixed before saving; duplicate

**Expected:** if the name exists, nothing is changed and the naming rule is applied.

**Observed:**

- ✅ Second specimen without marker: error box "Ein Exemplar mit diesem Namen gibt es schon …", "Schon vorhanden: Bogenhanf", hint to the marker; the number of specimens stays 1 (`05-name-taken-*.png`).
- ✅ With marker "rot" the preview shows "Name: Bogenhanf – rot", after saving it stands with the chosen location "Regal Süd" in the list (`06-…`, `07-…`). The first specimen keeps its name.
- ✅ Tests: markers are not duplicated per species (case irrelevant), without change; two accounts may carry the same name.
- ⚠️ **Limit:** the rules from the third specimen on (ask for missing markers, rename) belong to US-BES-03 and are missing.

## 4. Tenant isolation and repeat guard

**Observed:**

- ✅ The generic tenant test covers `exemplar` (fixture `FIXTURES_BESTAND`); the location of a foreign account is rejected by the composite foreign key.
- ✅ By hand: account Ben sees no specimens (`08-foreign-account-empty-*.png`); his retrieval of Mara's specimen yields 404 `exemplar.nicht_gefunden`, choosing Mara's private species 404 `art.nicht_gefunden`.
- ✅ The same `Idempotency-Key` does not create twice (core and API test).
- ⏭️ Double click in the browser not checked by hand; the button is disabled while sending.

## 5. Mobile and accessibility

- ✅ Mobile 375×812: no horizontal scrolling, all buttons, fields and choice lists at least 48 px high (measurement in the script).
- ❌→✅ Found and fixed: with the fourth tab "Bestand" the main navigation overflowed on mobile (width 448 instead of 375 px). The tabs now wrap (`stil.css`).
- ⏭️ Screen reader and keyboard operation not checked; fields have labels, errors are `role="alert"`.

## Open points

- Target location of the phase (PHA-01, FR-PHA-05) and care profile (BES-09): port exists, implementation missing.
- Markers from the third specimen on, renaming (BES-03); archiving (BES-07); hints for specimens without a location (BES-08).
- Species reference without a database foreign key (AB-10 allows only `(konto_id, id)`, the catalog has no account id): decision of the owner whether an exception for catalog tables is wanted.
- Zone delete check (`ZonenNutzung`): specimens refer to no zone yet, only via the location; the location source already reports that. A source of its own from `bestand` comes with the zone override (BES-04).
- The location test in the browser created the location via the API (the light page is LIC-05 and was checked there).
