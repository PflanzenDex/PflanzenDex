# Test log: US-BEH-03 Tick off a date with a tap (issue #82)

**Branch:** `feat/beh-03-termin-per-tipp-abhaken` (from `origin/dev` at aab2a30, after US-BEH-02)
**Environment:** WSL2/Linux, Docker; PostgreSQL 16 in its own container (port 54794 from `worktree-env.mjs`), API port 55294, web (Vite) port 55794, Keycloak 26.8 with the repo realm import (redirect address adapted to 55794, direct grant enabled on the throwaway instance only to get tokens for seeding) in a throwaway container on port 55894. The shared test database (54329) and the shared sign-in service (18081) were not touched. Chromium via Playwright (Europe/Berlin, de-DE); date 2026-10-04.
**Method:** tests first (red runs in `beh-03/red-*.txt`), implementation, `make ci`, then a manual run with a throwaway Playwright script (not checked in) against the real stack: accounts through the Keycloak admin API, data through the API, ticking off and history through the UI. Screenshots desktop 1440x900 and mobile 375x812 in `beh-03/`, raw measurements in `beh-03/observation.json`. Containers and servers were removed afterwards.

Legend: OK as expected, WARN works with a finding, SKIP not checked

## 0. Red runs and gates

- OK Red (skeletons compiled, typecheck green): core 12 of 445, db 6 of 148, api 12 of 196, web 9 of 266 tests red (`red-core.txt`, `red-db.txt`, `red-api.txt`, `red-web.txt`).
- OK `make ci` exit code 0 (secrets, workflows, lint, types, boundaries, knip, specs, duplicates, format, docs, tests with coverage ratchet, CRAP max 37.1 of 450, build).
- SKIP `make e2e` (shared suite) not run, no e2e test added.

## 1. Criterion: "Done" sets Done and stores Done_At (local date), addressed by id

- OK Button "Erledigt" on every open row (aria-label "Wollläuse bei <Exemplar> als erledigt abhaken"). Tap: the page says "„…– Eins“: „Wollläuse“ als erledigt eingetragen am 04.10.2026." and the row leaves the list (`03-after-done-*.png`).
- OK Done date is the local date in Europe/Berlin (`04.10.2026`, API `doneAt: 2026-10-04`). Core/API tests pin 23:30 UTC (3rd in Berlin, 2nd in Los Angeles) and a database test runs with the server time zone Pacific/Kiritimati (NFR-08).
- OK The request goes to `/treatments/<id>/complete` (addressed by id, web test).

## 2. Criterion: idempotent, second tap changes nothing

- OK Second call on the same treatment with a new key and another time zone: 200, same row, first done date kept (`secondTap`). Two parallel calls: both 200, identical answers (`parallel`). A double tap in the UI sends one request (web test).

## 3. Criterion: history per specimen

- OK Selection "Exemplar für den Verlauf" lists the done treatment with reason, agent, due and done date (`04-history-*.png`); without a choice the page says what to do (P-09); the history of an archived specimen stays readable (`archivedHistory: 1`).

## 4. Consequences in other views

- OK Card of the specimen before: "Behandlung: Wollläuse · überfällig seit 2 Tg. · +2 weitere", after: "Behandlung: Spinnmilben · in 3 Tg. · +1 weitere" (`01-card-before-*.png`, `05-card-after-*.png`). Open list after: the done row is gone, the rest unchanged.
- OK Archived specimen: ticking off its open date is 409 `specimen.archived` and the date stays open.
- WARN Course follow-up: the spec asks for no follow-up date on done; none is created (the course dates already exist). Documented in the spec.

## 5. Tenant isolation (P-04)

- OK Second account on Mara's treatment id: 404 `treatment.not_found`, the treatment stays open (`maraStillOpen: true`); Ben's history request for Mara's specimen: 404 `specimen.not_found`; Ben's page lists only his own date (`06-other-account-mobile.png`). Two-account tests in db and api, foreign id in core.

## 6. Layout and accessibility

- OK No horizontal scrolling (1440 and 375 px), no interactive element below 44 px, axe (WCAG 2.1 AA): no violations on the list, after-done, history and other-account views.
- SKIP Dark scheme, keyboard-only use, screen reader.

## Open points

- No undo and no editing of a done treatment (the spec names neither); reminder (US-MON-03) and the central "Heute" list (TE-07) are not part of this story.
