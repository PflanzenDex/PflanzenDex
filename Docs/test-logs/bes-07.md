# Test log: US-BES-07 Archive a received or given-away plant (issue #63)

**Branch:** `feat/bes-07-eingegangene-oder-abgegebene` (from `origin/dev`, state after US-WAC-01 and US-LIC-01)
**Environment:** WSL2/Linux, Node 25, Docker; PostgreSQL 16 in its own container (port 54604 from `worktree-env.mjs`), API port 55104, web (Vite) port 55604, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18791 (the shared sign-in service on 18081 belongs to another session and was not touched). The realm is a copy with an adapted redirect address (`http://localhost:55604`) and two pre-confirmed test accounts (`mara-bes7`, `ben-bes7`); it lives outside the repo. Chromium via Playwright (time zone Europe/Berlin, locale de-DE); date 2026-10-03.
**Method:** tests first (red runs in `bes-07/red-*.txt`), then implementation, `make ci`, then manual operation (Playwright script, not checked in) against the real Keycloak. The species and specimens were created through the API with the token of the account, everything else through the UI. Screenshots desktop 1440×900 and mobile 375×812 in `bes-07/`, raw measurements (texts, responses, axe, target sizes) in `bes-07/observation.json` (raw data, German keys as recorded). Containers and servers were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Red runs and gates

- ✅ `red-core.txt`: 21 of 55 tests red (the operations were skeletons without behavior, the lists did not filter). The other tests in the run were already green (input validation is in the skeleton).
- ✅ `red-db.txt`: 6 of 15 red (columns and methods were missing).
- ✅ `red-api.txt`: 10 of 13 red (routes were missing: 404).
- ✅ `red-web.txt`: 10 of 10 red (skeleton of the client, no UI).
- ✅ `make ci` exit code 0 (lint, types, boundaries AB-7 to AB-14, baseline, knip, spec, principles and skill check, duplicates, format, docs, tests with coverage thresholds, CRAP, build).
- ⚠️ A repeated coverage run reports only hints "threshold could rise"; the thresholds were not touched.

## 1. Criterion: "Archivieren" with a reason sets status, date and reason

**Expected:** archiving with `eingegangen`, `abgegeben`, `getauscht`, `verschenkt`, `verkauft` or free text sets `Status: Archived`, `Archived_At`, `Archived_Reason`.

**Observed:**

- ✅ Every card has "Archivieren". The form (`02-archive-form-*.png`) offers exactly these five reasons and "anderer Grund …" (`observation.json`: `gruende`).
- ✅ With "verkauft": message "… ist archiviert. Du findest es im Archiv und kannst es dort wiederherstellen." (P-09); the archive shows "Archiviert am 03.10.2026" and "Grund: verkauft" (`04-archived-with-archive-*.png`).
- ✅ The free reason " Katze war schneller " is stored trimmed (`05-two-archived-free-reason-*.png`).
- ✅ An empty free reason is not sent, "Bitte nenne einen Grund …" appears (`03-free-reason-empty-*.png`); "Abbrechen" leaves all three cards in place.
- ✅ Date as a local calendar date: core test with 23:30 UTC (Berlin 3 October, New York 2 October), DB test with the server time zone Pacific/Kiritimati, API test. By hand only Berlin was checked.
- ✅ A second archiving through the API: 409 `specimen.already_archived`, date and reason of the first stay (`doppeltArchivieren`).
- ⚠️ **Assumption:** reason up to 250 characters (starting value, DB and core the same).

## 2. Criterion: archived specimens are missing from evaluations, but stay viewable and restorable

**Observed:**

- ✅ The cards in the tab Bestand show only the non-archived ones (`kartenNachArchiv`, after reloading `nachReload.karten`). The ports for measurements and treatments do not learn the IDs of archived specimens (core and API test).
- ✅ Growth: measuring an archived specimen is rejected with 409 `specimen.archived`, nothing is written (`messenArchiviert`, core and API test).
- ✅ Care phases: only `plant` is listed (core test from PHA-01 with an archived specimen). By hand the list was empty (the sample species have no dormancy period), that is **no** proof.
- ✅ History: `GET /specimens/:id` returns the archived specimen with date, reason and catch date (`historie`); the section "Archiv" shows species, date and reason.
- ✅ Restore (`07-restored-*.png`): message "… ist wiederhergestellt und steht wieder im Bestand.", card back, archive without the entry, `archiviertAm` and `archiviertGrund` `null` again, status `plant` (`wiederhergestellt`). A cutting stays a cutting (core and DB test).
- ⏭️ Treatments, Pokédex ownership, distribution and today list do not exist yet; they are not implemented and not checked. Future evaluations must filter with `isActive` (README).
- ⚠️ The measurement series of an archived specimen is readable through `GET /specimens/:id/measurements`, but has no access in the UI.

## 3. Criterion: a swap archives automatically (US-SOZ-11)

- ⏭️ Not implemented: belongs to SOZ. The operation `specimen.archive` accepts any reason freely, SOZ can call it with "Getauscht mit <display name>". That is why the story stays 🟨.

## 4. Tenant isolation (P-04)

- ✅ Core, DB and API tests with two accounts: archiving or restoring a foreign specimen yields `specimen.not_found` (404) and looks like an unknown one; nothing changes. The archive contains only own specimens. The columns belong to the table `specimen`, whose generic tenant test stays green.
- ✅ By hand: Ben sees an empty archive (`benArchivApi`), his attempts to archive or restore Mara's specimens end with 404 (`benArchiviertMaras`, `benWiederherstellenMaras`); his collection is empty (`06-foreign-account-empty-*.png`).

## 5. Layout and accessibility (rough)

- ✅ Mobile 375 px: no horizontal scrolling (`scrollBreite` = 375 in all views), all buttons, select fields and inputs at least 44 px high (`kleineZiele: []`).
- ✅ axe (WCAG 2.1 AA) on the collection, the form, the collection with archive and the dark scheme: no violations in the new parts.
- ⚠️ axe still reports the contrast of the footer "Version …" in the **light** scheme (already found in BES-06, does not belong to this ticket, not changed). No violations in the dark scheme (`08-dark-*.png`).
- ⚠️ After archiving the message is shown while the list is still reloading; the archive appears a moment later (waited for in the script, not measured).
- ⏭️ Screen reader not checked.

## Open points

- Automatic archiving on a swap (SOZ-11) and the evaluations that do not exist yet (distribution, treatments, Pokédex ownership, today list).
- The name of an archived specimen stays taken (assumption, so that restoring never collides): a new specimen of the same species needs a marker. If that is a nuisance, a separate decision is needed (uniqueness only among active specimens, then renaming on restore).
- No access to the measurement series of an archived specimen in the UI.
- Footer contrast of the app (separate finding).
