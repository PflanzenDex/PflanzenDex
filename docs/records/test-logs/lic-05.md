# Test log: US-LIC-05 Manage locations and light zones (issue #69)

**Branch:** `feat/lic-05-standorte` (stacked on `feat/acc-01-anmeldung` #192, with `feat/te-08-betreiber` #191 merged in)
**Environment:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54431 from `worktree-env.mjs`), API port 54931, web (Vite) port 55431, Keycloak 26.8 (`make auth-up`; for the test the redirect address of the web client was extended by port 55431 at runtime via the admin API, not in the repo); browser Chromium via Playwright; date 2026-10-03.
**Method:** `make ci`, then manual operation (Playwright script) against the real Keycloak with test account `mara@example.test`. Screenshots desktop 1440×900 and mobile 375×812 in `lic-05/`. The app UI is German; quoted UI texts are given verbatim.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

Note: the code was renamed to English after this test (e.g. table `lichtzone` is now `light_zone`, error code `lichtzone.nicht_gefunden` is now `light_zone.not_found`); the log keeps the names of the time of the test in prose where it quotes UI or screenshot content.

---

## 0. Gates

**Expected:** `make ci` green.

**Observed:**

- ✅ `npm run ci` exit code 0 (lint, types, boundaries, spec check, format, tests, build) with its own test database.
- ✅ The generic tenant test covers `lichtzone`, `standort` and `idempotenz` (fixtures in `fixtures.ts`).

## 1. Criterion: a location has name, light zone and kind; any number per zone

**Expected:** create locations with name, zone, indoor/outdoor; several locations per zone; a zone of a foreign account cannot be assigned.

**Observed:**

- ✅ "Fensterbank" (lamp 2, indoor) and "Balkon" (without zone, outdoor) created (`03-locations-hint-*.png`).
- ✅ Tests: three locations in one zone (core, db); a foreign zone yields `lichtzone.nicht_gefunden` or 404 (API test, composite foreign key in the database).
- ✅ A duplicate location name is rejected (API 409, DB test); in the UI seen manually only for zones (`07-name-taken-*.png`).
- ⏭️ Error message for a duplicate location name in the UI: not triggered manually.

## 2. Criterion: a light zone has name, lux ceiling, optional PPFD, order

**Expected:** create, change, rename; values outside the limits rejected; a missing PPFD appears as "unbekannt" (P-08).

**Observed:**

- ✅ Default adopted: lamp 1 to 4 with 1,500 / 15,000 / 100,000 / 110,000 lux and PPFD 36 / 300 / 1,600 / 2,000 (`02-default-*.png`); numbers from the specification.
- ✅ Zone "Lampe 2" renamed to "Unterholz" (`05-renamed-*.png`).
- ✅ Invalid input (empty name, lux 0 or 1.5, negative PPFD) is rejected in core and API with 400 and field names; the database additionally has check rules.
- ⚠️ The limits (lux 1 to 200,000, PPFD 1 to 3,000, name 60 characters) are **assumptions** (starting values), not proven.
- ⏭️ The display "PPFD unbekannt" is proven only by a component test, not in the browser.

## 3. Criterion: deleting a zone that is used is rejected and names who uses it

**Expected:** rejection with a list of users; after release deleting is possible.

**Observed:**

- ✅ Delete "Lampe 2" → confirmation → message "Diese Lichtzone wird noch genutzt …" with "Standort: Fensterbank"; the zone stays (`04-delete-rejected-*.png`).
- ✅ The unused zone "Lampe 4" could be deleted (in the browser; follow-up image not saved).
- ✅ Mechanism for specimens and species via the port `ZonenNutzung` (now `ZoneUsage`) tested with a dummy: all users are named, nothing is deleted.
- ⚠️ **Limit:** specimens and species do not exist yet; in reality deleting checks only locations. BES has to add the sources (see `app/README.md`). The display of "Exemplar:" and "Art:" in the UI is proven only by a component test.
- ✅ Fallback: the foreign key prevents deleting even with a newly arisen usage (DB test).

## 4. Criterion: renaming changes no assignments

**Expected:** reference via id.

**Observed:**

- ✅ After renaming "Lampe 2" to "Unterholz", "Fensterbank" still shows "Unterholz · innen" (`05-renamed-*.png`); tests in core and db check the same id.
- ✅ Renaming a location leaves zone and kind untouched (core test).

## 5. Criterion: locations without a zone appear in "Hinweise"

**Expected:** hint with next action (P-09); disappears after assignment.

**Observed:**

- ✅ "Balkon" without zone → block "Hinweise": "Der Standort „Balkon" hat noch keine Lichtzone. Weise dem Standort eine Lichtzone zu." (`03-…`); button "Lichtzone zuweisen".
- ✅ After assignment to lamp 3 the block disappears (`06-assigned-*.png`).
- ⚠️ The central "Hinweise" page belongs to US-BES-08 and does not exist yet; the hint appears on the page of the story and via `GET /hinweise` (now `GET /hints`).

## 6. Tenant isolation and repeat guard

- ✅ API test: account B does not see zones/locations of account A and can neither change nor delete (404) nor assign them.
- ✅ The same `Idempotency-Key` creates nothing twice; without a key 400; two parallel `begin` calls yield exactly one hit (DB test).
- ⏭️ Two browser accounts simultaneously: not checked manually.

## 7. Mobile (375 px) and operation

- ✅ All states as a mobile screenshot; buttons and inputs 48 px high; no horizontal scrolling (document width 360 px at a 375 px window).
- ⚠️ The view is long because each zone shows two buttons one below the other; condensing would be follow-up work.
- ⚠️ In the browser two console messages occurred that were not evaluated (presumably the missing `favicon.ico`, known from ACC-01).
- ⏭️ No contrast measurement, no screen reader test, no dark mode screenshot.

## Open points

- Locations cannot be deleted (no criterion); as soon as specimens use a location, deleting needs the same usage port.
- Moving the order happens via a number, not by dragging.
- The test ran with an adjusted redirect address in the local Keycloak; the realm export in the repo knows only port 5173.
