# Test log: US-PHA-02 See deviations first (issue #71)

**Branch:** `feat/pha-02-abweichungen-zuerst-sehen` (from `origin/dev` at f9c8cc7, after US-PHA-03 and US-BES-09)
**Environment:** WSL2/Linux, Node 25, Docker; PostgreSQL 16 in its own container (port 54665), API port 55165, web (Vite) port 55665, Keycloak 26.8 in its own throwaway container on port 55777 (realm copy with adapted redirect address and without mail verification, outside the repo; the shared sign-in service was not touched). Chromium via Playwright (Europe/Berlin, de-DE); date 2026-10-04. Accounts were created through the Keycloak admin API, data through the API with the account's token, screens through the UI. Script not checked in. Containers and servers were removed afterwards.

Legend: ✅ as expected · ⚠️ works, with a finding · ⏭️ not checked

## 0. Red runs and gates

- ✅ `red-core.txt` 3 of 6 red, `red-web.txt` 5 of 5 red. The skeleton `phaseStatus` compiled and always answered `in_place`; the page had no groups.
- ✅ `make ci` exit code 0 (all gates, tests with coverage ratchet, CRAP max 9, duplicates 0, knip, build). Only "threshold could rise" hints; thresholds untouched.
- ⏭️ `make e2e` not run, no e2e test added (needs the fixed ports 5173/18081). The manual run below replaces it.
- ⏭️ No API test added: the order is produced in `phaseRows` (core) and the route passes it through unchanged; core and page tests cover it.

## 1. Criterion: deviation = location id differs from target location id

- ✅ Core tests: ids compared, equal ids are no deviation; an unknown target is never a deviation (P-08). By hand: "Bogenhanf – Fenster/Regal" (Kühler Flur, target Wohnzimmer) are deviations; "Opuntia – Ohne Soll" (no care profile, target unknown) is not.

## 2. Criterion: deviations before the rest; no location = own warning, no placeholder

- ✅ Order on the real stack: deviations (2), then "Standort fehlt" (1), then "Stimmen überein oder Soll unbekannt" (3); inside a group by name (`observation.json`, `01-deviations-first-*.png`).
- ✅ The row without location shows "Standort fehlt" (warning) and "Weise dem Exemplar unter „Hinweise“ einen Standort zu.", no "Standort: unbekannt".
- ✅ After "Alle 2 nach Wohnzimmer umstellen" the deviation group is gone and the page says "Keine Abweichung: …" (`02-after-switch-desktop.png`).
- ⚠️ Specimens created with a known target are placed automatically (FR-PHA-05), so only the specimen of a species without target stayed without location. A row with missing location **and** known target is covered by the core test only.
- ⚠️ Interpretation: the spec only demands deviations first; specimens without location rank second, before rows in place.

## 3. P-09, P-08, accessibility

- ✅ Every group has a next action; rows with unknown target say "Soll-Standort: unbekannt" and where to set it.
- ✅ axe: 0 violations on desktop and mobile; no horizontal overflow at 375 px (`mobileOverflow: 0`).

## 4. Tenant isolation (P-04)

- ✅ Core test with two accounts; by hand a second account gets `[]` from `/care-phases` and the empty-state page (`03-other-account-desktop.png`).

## Limits

- No dormancy period on the specimen itself (open since PHA-01). The central deviation view (US-QS-04) is not part of this story.
