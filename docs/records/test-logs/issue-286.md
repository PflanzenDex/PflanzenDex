# Test log: FR-BES-04 back-dated catch date on creation (US-BES-02, issue #286)

**Branch:** `feat/issue-286-back-date-the-catch` (from `origin/dev`, `origin/dev` merged again before the ready check)
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54858, not the shared test database on 54329), API on port 55358, web (Vite) on port 55858, Keycloak 26.8.0 in its own throwaway container (port 18886, realm import from the repo with the redirect address changed to `http://localhost:55858`, imported from a private directory). Chromium through Playwright (Europe/Berlin, de-DE); date 2026-10-04. The API ran against the own database URL (54858).
**Method:** spec first, red tests (saved with exit code in `issue-286/red-*.txt`), implementation, `make ci`, then a Playwright script (not checked in) against the real stack: two real Keycloak users (sign-in through the Keycloak form), species created through the API with the token of the real session, then the "Exemplar anlegen" form driven by mouse and keyboard at 1440x900 and 375x812. Screenshots in `issue-286/`, raw observations (texts, axe, horizontal scroll, tap targets) in `issue-286/observations.json`.

Legend: ✅ as expected · ⚠️ works, but something stands out · ❌ error · ⏭️ not checked

---

## 0. Red runs and gates

- ✅ Red runs saved before the implementation: `issue-286/red-core.txt` (14 of 54 failed, exit code 1), `issue-286/red-api.txt` (3 of 18 failed, exit code 1), `issue-286/red-web.txt` (8 of 26 failed, exit code 1). The API tests and web tests that already passed in the red run (untouched form sends nothing, API client forwards `catchDate`, Pokédex card label) describe behavior that needed no change.
- ✅ `make ci` exit 0 on the own database (port 54858) after the last code change before this manual run. It is run again after this log is committed (see the PR).

## 1. Criterion: optional catch date on creation, default today's local date

**Expected:** a date field "Fangdatum" with today's local date preset, a hint that back-dating is allowed.
**Observed:**

- ✅ The field is `type="date"`, labelled "Fangdatum", value `2026-10-04`, `max` `2026-10-04` (`01-form-default-*.png`). Hint: "Voreingestellt ist heute. Hast du die Pflanze schon länger, trage hier ein früheres Datum ein; ein Datum in der Zukunft geht nicht."
- ✅ A specimen created with the untouched field has `caughtAt` 2026-10-04 (read back through `GET /specimens`, Hoya).
- ✅ Automated (not by hand): the preset follows the profile time zone, not UTC (web test with America/New_York, core and API tests with 23:30 UTC).

## 2. Criterion: a back-dated catch date is stored and drives the Pokédex catch date

**Observed:**

- ✅ Typing `2022-02-03` with the keyboard and pressing Enter creates the specimen (`03-created-*.png`). `GET /specimens` shows `caughtAt` 2022-02-03 for Aloe (desktop run) and Ficus (mobile run).
- ✅ The Pokédex card reads "gefangen 03.02.2022", not "≈" (`04-pokedex-*.png`), on desktop and mobile. The Pokédex code was not changed.

## 3. Criterion: a future date is refused, nothing is written, the error names the field

**Observed (desktop and mobile):**

- ✅ Typing `2999-01-01` and submitting: nothing is created; an alert "Das Fangdatum liegt in der Zukunft. Wähle heute oder ein früheres Datum." appears under the field (`02-future-refused-*.png`).
- ✅ Visible marker: red 2 px border on the field (`2px rgb(179, 38, 30)`), not only `aria-invalid="true"`. `aria-describedby="catch-date-hint catch-date-error"`. Focus moved to the field (`document.activeElement.id` = `catch-date`). The entered value stays (P-10).
- ✅ axe (wcag2a, wcag2aa, wcag21a, wcag21aa): no violations on the default form and on the refused form, desktop and mobile.
- ✅ Keyboard: the field is reached and filled by keyboard only; Enter submits (used for the successful back-dated run).
- ⏭️ Not checked by hand: a screen reader announcement; the browser's native date picker popup. The refusal against the profile time zone (not UTC) is covered by automated tests only.

## 4. Layout

- ✅ No horizontal scroll at 375x812 and 1440x900.
- ⚠️ One element is under 48 px high: the existing checkbox "Das ist ein Steckling" (24 px). It is not part of this change and was not touched; the catch date input itself is tall enough.

## 5. Tenant isolation (P-04)

- ✅ By hand: the second account (Ben) sees 0 specimens after Mara created three.
- ✅ Automated: the API test "a back-dated specimen of account A stays private" (404 on the foreign specimen, date not in the foreign list).

## Open points

- Correcting the catch date after creation is not part of this story: there is no general edit of specimen fields yet. Recorded as an open point in `docs/specs/product/02-collection.md` (US-BES-02); until then a wrong date means archiving and re-creating the specimen.
- The date picker uses the browser's native control, so its look and its locale handling differ between browsers; only Chromium was run.
