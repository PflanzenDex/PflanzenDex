# Test log: US-BES-08 Recognize incomplete data (issue #64)

**Branch:** `feat/bes-08-unvollstaendige-daten-erkennen` (from `origin/dev`, state after US-BES-04)
**Environment:** WSL2/Linux, Node 25, Docker; PostgreSQL 16 in its own container (port 54877 from `worktree-env.mjs`, extra database `bes8_ui` for the manual run), API port 55377, web (Vite) port 55877, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18893 (the shared sign-in service on 18081 was not touched). The realm is a copy with an adapted redirect address and two pre-confirmed test accounts (`mara-bes8`, `ben-bes8`); it lives outside the repo. Chromium via Playwright (time zone Europe/Berlin, locale de-DE); date 2026-10-04.
**Method:** tests first (red runs in `bes-08/red-*.txt`), then implementation, `make ci`, then manual operation (Playwright script, not checked in) against the real Keycloak. Species, locations and specimens were created through the API with the token of the account, the screens through the UI. Screenshots desktop 1440x900 and mobile 375x812 in `bes-08/`, raw measurements (texts, API responses, axe, target sizes) in `bes-08/observation.json`. Containers, servers and the extra database were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Red runs and gates

- ✅ `red-core.txt`: 8 of 9 tests red (the derivation was a stub returning no hints; the test "complete specimen: no hint" is green by construction).
- ✅ `red-api.txt`: 3 of 4 red (`/specimens/hints` was read as a specimen ID: 404).
- ✅ `red-web.txt`: 6 of 6 red (page was a stub). The App test (tab "Hinweise") and the note in the distribution were seen red before the wiring (not saved as raw logs).
- ✅ `make ci` exit code 0 (lint, types, boundaries AB-7 to AB-14, knip, spec/principles/skills, duplicates, format, docs, tests with coverage ratchet, CRAP, build). Only "threshold could rise" hints, thresholds untouched.

## 1. Criterion: a specimen without species, without location or with a location without zone appears in "Hinweise" with the fixing action

- ✅ Tab "Hinweise" (`02-hints-*.png`): "Aloe… – in der Kiste" steht am Standort "Kiste …", der noch keine Lichtzone hat / "Weise dem Standort … eine Lichtzone zu." with button "Zu Standorte und Licht"; "… – ohne Standort" hat noch keinen Standort / "Weise dem Exemplar einen Standort zu." with button "Zum Bestand". The complete specimen and the archived specimen without location do not appear (`hintTexts-*`, core and API tests).
- ✅ "Zu Standorte und Licht" opens the locations view (`03-action-leads-to-locations-*.png`). After giving the location a zone (API call, `assignZone` 200) the hint for it is gone, the other stays (`04-hints-after-zone-assigned-*.png`).
- ⚠️ **Limit:** the action "Standort zuweisen" for a specimen without location can be named but not done in the app yet: no operation changes the location of an existing specimen (editing: BES-03/PHA-03, not built). The button leads to "Bestand". The story therefore stays 🟨.
- ⚠️ **Species:** the database forbids a specimen without species (`species_id` not null with foreign key), so that case cannot be produced by hand. It is covered by a core test with a species the account cannot read (`species_missing`).
- ✅ Cuttings are checked like plants (core test).

## 2. Criterion: no evaluation hides it silently

- ✅ The distribution names what it does not count (`distributionNote-*`: "Nicht mitgezählt: 1 archiviert."); its note on "unbekannter Zone" now ends with "(siehe Hinweise)" (web test; by hand no specimen had an unknown zone because the species zone could be derived from its lux need).
- ✅ Core test: every specimen the distribution reports as "zone unknown" has a hint.
- ⏭️ The central "Heute" list (TE-07) and the QS deviations (QS-04) do not exist; care phases skip plants whose species has no dormancy period (by design, FR-PHA-04).

## 3. Tenant isolation (P-04)

- ✅ Core and API tests with two accounts. By hand: Ben sees "Keine Hinweise: Jedes Exemplar hat eine Art, einen Standort und eine Lichtzone." and `GET /specimens/hints` returns `[]` (`05-foreign-account-no-hints-*.png`, `benApiHints`). No new table, so no new tenant fixture.

## 4. Layout and accessibility (rough)

- ✅ Mobile 375 px: no horizontal scrolling (`scrollWidth` 375), no target below 44 px high (`smallTargets: []`); axe (WCAG 2.1 AA) on the hints page with hints and the empty state: no violations, desktop and mobile.
- ⏭️ Dark scheme and screen reader not checked.

## Open points

- Operation to change the location of an existing specimen (so the hint can be fixed in the app).
- Hints in the central "Heute" list (TE-07) and in QS-04; hint for a species without lux need (FR-LIC-03).
- No count badge on the tab.
