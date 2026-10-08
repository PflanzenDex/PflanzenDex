# Test log: US-BEH-02 See open dates by urgency (issue #81)

**Branch:** `feat/beh-02-offene-termine-nach` (from `origin/dev` at c0ffdc6)
**Environment:** WSL2/Linux, Docker; PostgreSQL 16 in its own container (port 54490 from `worktree-env.mjs`), API port 54990, web (Vite) port 55490, Keycloak 26.8 with the repo realm import (redirect address adapted to 55490) in a throwaway container on port 55590. The shared test database (54329) and the shared sign-in service (18081) were not touched. Chromium via Playwright (Europe/Berlin, de-DE).
**Method:** tests first (red runs in `beh-02/red-*.txt`), implementation, `make ci`, then a manual run with a throwaway Playwright script (not checked in) against the real stack: two accounts created through the Keycloak admin API, data through the API, list and planning through the UI. Screenshots desktop 1440x900 and mobile 375x812 in `beh-02/`, raw measurements in `beh-02/observation.json`. Containers and servers were removed afterwards.

Legend: OK as expected, WARN works with a finding, SKIP not checked

## 0. Red runs and gates

- OK Red: core 6 of 8 tests (stubs compiled, typecheck green), API 5 of 20, web 5 of 10.
- OK `make ci` exit code 0 (lint, types, boundaries, knip, specs, duplicates, format, docs, tests with coverage ratchet, CRAP, build).
- SKIP `make e2e` (shared suite) not run, no e2e test added.

## 1. List

- OK Page "Behandlung" shows per entry plant, reason, agent or "—", due date and status (`02-list-*.png`), earliest first.
- OK Status texts in the real run: "überfällig seit 2 Tagen", "heute fällig", "in 1 Tag", "in 2 Tagen", and the date `14.10.2026` for 10 days ahead. Unit tests cover 1 day singular, 3 days (soon) and 4 days (date), month and year ends, and a time zone where UTC and local date differ.
- OK Empty: "Keine offenen Behandlungen." plus "Plane unten einen Termin, dann erscheint er hier." (`01-empty-*.png`).
- OK Archived specimen with an open treatment is not listed. P-09: a sentence names the overdue and due-today dates ("1 Termin ist überfällig, 1 ist heute fällig. Behandle diese Exemplare zuerst.").
- OK Planning a new date reloads the list at once (`03-after-plan-*.png`).
- WARN For dates more than 3 days ahead the column "Fällig am" and the status show the same date, as the spec asks for both.

## 2. Tenant isolation

- OK The second account sees only its own treatment (`04-other-account-*.png`); API and core tests with two accounts.

## 3. Layout and accessibility

- OK No horizontal scrolling at 375 px, no interactive element below 44 px, axe (WCAG 2.1 AA): no violations on all screenshots, desktop and mobile.
- OK Status is text first; the yellow edge only underlines overdue and due today.
- SKIP Dark scheme, keyboard-only use, screen reader.

## Open points

- Ticking off (US-BEH-03), reminder (FR-BEH-05), central "Heute" list (TE-07) are not part of this story; the rows have no action yet.
