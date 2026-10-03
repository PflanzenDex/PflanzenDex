# Test log: US-PHA-01 See which phase every plant should be in (issue #70, delivered with PR #240)

**Branch:** `docs/testprotocols-lic-01-pha-01` (protocol only, from `origin/dev` at `ff285d8`; the story itself was merged earlier with #240 and #248 and translated with #258)
**Environment:** Linux (CachyOS), Node 24.21, Docker; PostgreSQL 16 in its own container (port 54551 from `worktree-env.mjs`), API port 55051, web (Vite dev server) port 55551, Keycloak 26.8.0 with the realm import from the repo in its own throwaway container on port 18799 (the shared sign-in service on 18081 and the shared test database on 54329 belong to other sessions and were not touched). The realm is a copy with the redirect address changed to `http://localhost:55551`; the two test accounts (Anna, Ben) were created through the Keycloak admin API (email confirmed). Chromium via `playwright-core` 1.60, axe-core with the tags wcag2a, wcag2aa, wcag21a, wcag21aa. Run on 2026-10-03 at about 22:30 Central European Summer Time.
**Method:** the automated tests of the story already exist (see section 0), so this protocol covers what they cannot: the real login, the real browser and database, and the time zone of the device. A Playwright script (not checked in) drove the UI; everything was created through the forms: the location "Fensterbank" with a light zone, six species with "Art vorschlagen" (dormancy period typed as month-day), one specimen each, and the specimen of the sixth species archived. Expected phases were decided from the spec **before** the run. Browser contexts with the time zone `Europe/Berlin` and `Pacific/Auckland` were used to check "today in the user's time zone". Screenshots desktop 1440×900 and mobile 375×812 in `pha-01/`, raw data (every check with expected and observed value, axe findings with element and message, layout measurements, the two local dates) in `pha-01/observation.json`. The container, the servers and the browser were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

**What this is about:** the view "Pflegephasen" lists every active specimen whose species has a dormancy period, with the expected phase today ("Ruhephase" or "Wachstumsphase"), the current location and the target location. The phase is derived on every request from the calendar and never stored (P-01).

Species and expectations (dates `MM-DD`; "today" in Berlin was `10-03`, in Auckland `10-04` because of the 11-hour difference at the time of the run, `observation.json`, key `timezone`):

| Species (as typed) | Dormancy period | Expected in Berlin | Expected in Auckland |
|---|---|---|---|
| Winteria crossingyear | 10-01 … 03-15 (crosses the new year) | Ruhephase | Ruhephase |
| Summeria shortrest | 05-01 … 08-31 | Wachstumsphase | Wachstumsphase |
| Nopausa evergrowing | none | not listed | not listed |
| Hodie startsandends | 10-03 … 10-03 (today in Berlin) | Ruhephase | Wachstumsphase |
| Cras onlytomorrow | 10-04 … 10-04 (tomorrow in Berlin) | Wachstumsphase | Ruhephase |

Plus a sixth species "Archivia willbearchived" (dormancy 10-01 … 03-15) whose specimen was archived through "Archivieren" before the list was read.

---

## 0. Gates and automated coverage

- ✅ `make ci` on this branch (docs only on top of `dev`): exit 0 with its own test database (port 54551). This shows the state of `dev`, not a change by this PR.
- ✅ Automated tests that carry the story ID and were **not** re-run one by one here (they are part of `make ci`): core `phases.test.ts` (interval in the same year, across the new year, active specimens only, time zone instead of UTC date, unknown target location, tenant isolation, invalid time zone), API `care-phases.test.ts` (401 without token, 400 for an invalid time zone, phases from the local date against the real database, tenant isolation), web `care-phases.test.tsx`, `CarePhasesPage.test.tsx`, and the browser test `e2e/tests/care-phases.spec.ts`.
- ⚠️ The browser test has **only the empty state**: its comment says the flow with a specimen was pending until the species catalog can be filled. That has been possible since US-BES-01; the by-hand run below does this flow. Automating it is a follow-up (see "Open").

## 1. Criterion: which specimens are listed

**Expected:** every active specimen (not cutting, not archived) whose species has a dormancy period; nothing else.

**Observed:**

- ✅ New account without specimens: "Noch kein Exemplar hat eine Phase: Gelistet werden Pflanzen, deren Art einen Ruhephasen-Zeitraum hat. Lege im Bestand ein Exemplar einer solchen Art an." (`01-empty-*.png`). The view says what to do next (P-09).
- ✅ Six specimens in the collection (one per species, one of them archived): exactly four are listed (Winteria, Summeria, Hodie, Cras) (`02-phases-berlin-*.png`).
- ✅ The specimen of the species without a dormancy period is not listed.
- ✅ The archived specimen is not listed.
- ⏭️ "Not cutting": cuttings can not be created yet (US-BES-04 is still open), so this part was not run by hand.
- ⏭️ A dormancy period on the specimen itself (the spec says: only the species' counts for now): not built, not checked.

## 2. Criterion: phase from today's date in the user's time zone

**Expected:** "Ruhephase" if today lies in `From…Until` (including both days), otherwise "Wachstumsphase"; the interval may cross the new year.

**Observed, device time zone Europe/Berlin (today 10-03):**

- ✅ Winteria (10-01 … 03-15, across the new year): "Soll-Phase heute: Ruhephase".
- ✅ Summeria (05-01 … 08-31): "Soll-Phase heute: Wachstumsphase".
- ✅ Hodie (10-03 … 10-03, today is the first and the last day): "Soll-Phase heute: Ruhephase".
- ✅ Cras (10-04 … 10-04, starts tomorrow): "Soll-Phase heute: Wachstumsphase".
- ✅ After a reload of the page the list is identical (name, phase, locations): derived live, not stored.

**Observed, same account, device time zone Pacific/Auckland (today 10-04, a calendar day later than in Berlin):**

- ✅ Winteria: Ruhephase. Summeria: Wachstumsphase (unchanged).
- ✅ Hodie (10-03 … 10-03): now "Wachstumsphase", because it is already 10-04 there.
- ✅ Cras (10-04 … 10-04): now "Ruhephase" (`03-phases-auckland-*.png`).

So the phase follows the local calendar date of the device (NFR-08), not the UTC date and not the server's date. The check depends on the time of day of the run: it needs a moment when the two time zones are on different calendar days (here 22:30 in Berlin); the script computes the dates at run time instead of hard-coding them.

- ⚠️ The time zone comes from the device for now, until the account profile has one (US-ACC-02, as the spec says). A user who travels sees the phase of the place of the device. This is the documented state, not a defect.

## 3. Criterion: target location

**Expected:** the target location is the one assigned for this phase; without a care profile it is "unknown", never invented (P-08).

**Observed:**

- ✅ Every row shows "Soll-Standort: unbekannt".
- ✅ The specimen created with the location "Fensterbank" (Winteria) shows "Standort: Fensterbank"; the others show "Standort: unbekannt".
- ⏭️ The target location per phase (care profile of the keeper, US-BES-09) does not exist yet, so the positive case was not checked.

## 4. Tenant isolation (P-04, P-05)

- ✅ Second account Ben opens "Pflegephasen" and sees no entry (the empty state, `04-other-account-empty-*.png`), while Anna has four.
- ⏭️ No new table in this story, so no new generic tenant test; the API and core tests have their own two-account cases.

## 5. Layout and accessibility (rough)

- ✅ Mobile 375 px: no horizontal scrolling (`scrollWidth` 375 in all four measured states); every button, select and text input is at least 48 px high (`small48` = 0).
- ⚠️ axe (WCAG 2.1 AA): one `color-contrast` violation (serious) on the element `footer`: the text "Version …" has a contrast of 4.01 (foreground #727c73 on #f4f7f2, 12 px; 4.5:1 expected). It appears in both states checked with axe (empty, list), desktop and mobile. Known as issue #249 and not part of this protocol.
- ✅ Dark scheme (OS preference `dark`, desktop): the list is readable (`02-phases-berlin-dark-desktop.png`). Only looked at, no axe run in dark.
- ⚠️ The list is sorted by name; there is no order by deviation. That is US-PHA-02 (⬜), so nothing is wrong yet.
- ⏭️ Keyboard operation was not checked by hand (the view has no controls besides the navigation).
- ⏭️ axe for the Auckland state and the other account's empty state was not run (same view and components as the checked ones).

## 6. Open

- Automate the flow with specimens in the browser test (species with dormancy, one archived, the time zone case with `timezoneId`): the by-hand run above shows it works and which waits are needed.
- The spec status of US-PHA-01 stays 🟨 (target location per phase and the dormancy period on the specimen are missing); this protocol changes nothing about the status.
- The footer contrast (#249) is not part of this protocol.
