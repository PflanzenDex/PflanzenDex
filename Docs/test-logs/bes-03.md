# Test log: US-BES-03 Tell several specimens of a species apart (issue #59)

**Branch:** `feat/bes-03-mehrere-exemplare-einer-art` (from `origin/dev` at `c8efade`, PR #264)
**Environment:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54644 from `worktree-env.mjs`), API port 55144, web (Vite dev server) port 55644, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18690 (the shared sign-in service on 18081 belongs to another session and was not touched). For the test a copy of the realm with an adjusted redirect address (port 55644) and two pre-confirmed test accounts (`mara-bes3@…`, `ben-bes3@…`) was used; it lies outside the repo. Chromium via Playwright (browser time zone Europe/Berlin).
**Method:** tests first (red runs in `bes-03/red-*.txt`, compiling skeleton without behavior), then implementation, `make ci`, then manual operation (Playwright script) against the real Keycloak. Screenshots desktop 1440×900 and mobile 375×812 in `bes-03/`, the raw observations in `bes-03/observation-desktop.json` and `observation-mobile.json`. Containers and servers were removed afterwards. The app UI is German; quoted UI texts are given verbatim.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Red runs before the implementation and gates

**Expected:** the tests from the criteria fail as long as the behavior does not exist; afterwards `make ci` is green.

**Observed:**

- ✅ `red-core.txt`: 25 of 136 tests red (new operation `specimen.mark` and the marker rules of `specimen.create` as skeletons; the card test for `speciesId` and `marker` was run with the two fields removed).
- ✅ `red-db.txt`: 8 of 32 tests red (no unique index, `create` ignores the markers of existing specimens, `mark` is a skeleton).
- ✅ `red-api.txt`: 9 of 60 tests red (route `POST /specimens/:id/marker` missing, the old duplicate-name test now expects `specimen.marker_required`).
- ✅ `red-web.txt`: 10 of 75 tests red (form without required marker and without questions for missing markers, no "Kennzeichen" button, `markSpecimen` a skeleton).
- ✅ `make ci` exit code 0 with all gates (lint, types, boundaries AB-7 to AB-14, baseline, knip, spec and traceability check, duplicates, format, docs, tests with coverage thresholds and ratchet, CRAP, build) at commit `24a6b9d`. The coverage ratchet printed hints only (thresholds could be raised; not changed, gate files are out of scope).
- ✅ Migration 0013 (`-- module: collection`) applied on a database that already held the migrations 0001 to 0012; the generic tenant test needs no new fixture (no new table).

## 1. Criterion: 1st specimen plain, 2nd gets a marker (default "clip")

**Expected:** the first specimen is named after the species without a marker; the second needs a marker, preset "Klammer" and freely changeable; the first keeps its name.

**Observed:**

- ✅ 1st form: label "Kennzeichen (optional)", "Name: Echeveria bessmall" (`01-first-form-*.png`).
- ✅ 2nd form: field "Kennzeichen" is required and preset "Klammer", preview "Name: Echeveria bessmall – Klammer" (`02-second-form-*.png`); the first specimen keeps "Echeveria bessmall".
- ✅ Core and API tests: the 2nd without a marker is `specimen.marker_required` (409) without change, even if the plain name is free.
- ⚠️ The preset "Klammer" is a form default; the API does not apply it (it requires an explicit marker). It is dropped when a specimen already carries "Klammer" (test).

## 2. Criterion: from the 3rd every specimen has its own marker; the app asks before saving

**Expected:** with a third active specimen the plain one needs a marker; nothing is saved until all markers are there.

**Observed:**

- ✅ 3rd form: besides the new marker a second field "Kennzeichen für „Echeveria bessmall“" appears (`03-third-form-missing-*.png`).
- ✅ Clicking "Exemplar anlegen" with it empty: alert "Bitte vergib zuerst alle fehlenden Kennzeichen, bevor du speicherst.", 0 POSTs to `/specimens` (`04-third-blocked-*.png`).
- ✅ After typing "blau": preview „Echeveria bessmall“ heißt dann „Echeveria bessmall – blau“ (`05-third-form-filled-*.png`); saving writes all in one go: list "Echeveria bessmall – blau", "– Klammer", "– rot" (`06-list-three-*.png`).
- ✅ API tests: without the answers `specimen.markers_missing` (409, data `missing`), nothing written; with them one transaction (db test: a failing new specimen undoes the renames); an answer for a specimen that is not missing, archived or of another account is `specimen.not_found` and changes nothing.
- ✅ Archived specimens do not count and are never renamed (core test).

## 3. Criterion: markers are unique per species (case-insensitive), duplicate or empty is an error without change

**Observed:**

- ✅ Core, db (unique index `specimen_marker_per_species`) and API tests: "ROT" after "rot" is `specimen.marker_taken` (409), the same marker at another species or in another account is fine; an empty marker is `input.invalid` (400); nothing changes.
- ✅ By hand on the card: renaming "– blau" to "rot" shows the alert "Dieses Kennzeichen gibt es bei dieser Art schon. Wähle ein anderes, damit du die Töpfe unterscheiden kannst." (`08-rename-duplicate-*.png`).
- ✅ The marker of an archived specimen stays taken (core test), like its name (US-BES-07).

## 4. Criterion: renaming changes no references

**Observed:**

- ✅ By hand: card button "Kennzeichen", form "Kennzeichen ändern" with the current name and preview "Name: Echeveria bessmall – grün" (`07-rename-form-*.png`); after saving the message „Echeveria bessmall – blau“ heißt jetzt „Echeveria bessmall – grün“. Die Historie bleibt beim Exemplar. and the list shows the new name (`09-renamed-*.png`); after a reload still the same.
- ✅ Core and API tests: the ID, species, location, date and status are unchanged after `specimen.mark`; `GET /specimens/:id` with the old ID returns the new name; an archived specimen is `specimen.archived` (409) and unchanged.

## 5. Tenant isolation, repeat guard, layout

**Observed:**

- ✅ Two-account tests (core, db, API): a specimen of another account is `specimen.not_found` (404) for rename and for answers, and stays unchanged; both accounts may use the same marker.
- ✅ By hand with two Keycloak accounts: the lists of both contain only their own three specimens.
- ✅ Same `Idempotency-Key` renames once (core test); without token 401, without key 400 (API).
- ✅ Layout: no horizontal scrolling at 1440 and 375 px (`scrollW` = `innerW` for all 9 screens, see the observation files).
- ⏭️ Not checked: axe/Lighthouse reports for the new screens (the e2e suite was not run), keyboard-only operation, a screen reader.

## 6. Limits

- Changing the **location** (or other fields) of an existing specimen is not part of this story's criteria; it belongs with the move (`US-PHA-03`).
- Restoring an archived specimen can leave three active specimens with one unmarked (the rule is checked when creating and renaming).
- The derived name uses the species' display name of the day of the rename; a later change of the German name does not rename existing specimens until their marker changes.
- Migration number 0013 is free on `origin` today; a parallel branch with a migration would have to renumber.
