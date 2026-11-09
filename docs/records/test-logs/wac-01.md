# Test log: US-WAC-01 last measurement on the specimen card (issue #250)

**Branch:** `chore/issue-250-wire-messungsquelle-show-last` (from `origin/dev` after the English translation, ADR 0004; the evidence below was recorded before the translation on the branch state of BES-07 `679b931` and re-applied to the English names afterwards)
**Environment:** Linux, Docker; PostgreSQL 16 in its own container (port 54746 from `worktree-env.mjs`), API port 55246, web (Vite) port 55746, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18795 (the shared sign-in service on 18081 belongs to another session and was not touched). The realm is a copy with an adapted redirect address (`http://localhost:55746`); the test accounts were created through the admin API (email confirmed).
**Method:** tests first (red runs in `wac-01/red-*.txt`), then implementation, `make ci`, then manual operation (Playwright script, not checked in) against the real Keycloak. Species and specimens and all measurements were created through the UI. Screenshots desktop 1440×900 and mobile 375×812 in `wac-01/`, raw measurements (card texts, response of `GET /specimens/cards`, axe, target sizes) in `wac-01/observation.json` (raw data, German keys as recorded). Containers and servers were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

**What this is about:** the port `MeasurementSource` of `collection` had no implementation: the cards always said "noch keine Messung". Now `care` implements it (`MeasurementStore.lastFor` in `db`, `measurementSource` in `core`, wiring in `createApp`), and the card additionally shows the measured value.

> **Note on the English translation (ADR 0004):** the red runs and the manual run were recorded on the German names (`MessungsQuelle`, `letzteJe`, `/exemplare/karten`). The raw `.txt` logs, `observation.json` and the screenshots stay as recorded. After the translation the change was re-applied to the English names and the checks in section 0 were run again.

---

## 0. Red runs and gates

- ✅ `red-core.txt`: 4 of 251 tests red (the source was a skeleton without effect, `lastFor` of the in-memory store was empty). The other tests in the run were already green.
- ✅ `red-db.txt`: 2 of 103 red (the store method returned nothing).
- ✅ `red-api.txt`: 1 of 110 red (the card had no measurement).
- ✅ `red-web.txt`: 2 of 172 red (the value "12,5 cm" was missing on the card).
- ✅ Afterwards all packages green (before the translation: core 251, db 103, api 110, web 172 tests).
- ✅ Re-run on the English names: see the PR for the `make ci` result.
- ⚠️ With the shared test database (port 54329) an earlier run on another branch failed in the DB tests (`column "pruefsumme" does not exist`). Not investigated here, because this run uses its own database.

## 1. Criterion: the card shows the last measurement

**Expected:** per specimen the last measurement with value, quality and date; without a measurement "noch keine Messung" (P-08).

**Observed (desktop and mobile alike):**

- ✅ Two specimens without a measurement: both cards "noch keine Messung" (`01-collection-without-measurement-*.png`).
- ✅ After two measurements on specimen 1 (10 cm on 2026-09-20, 12.5 cm on 2026-10-01 with a note): "Letzte Messung: 12,5 cm · Gesund am 01.10.2026", the note is collapsible; specimen 2 stays "noch keine Messung" (`02-card-last-measurement-healthy-*.png`).
- ✅ More measurements: 14 cm "Vergeilt/dünn" on 2026-10-02, then a **back-dated older** one (9 cm on 2026-08-01). The card keeps showing "14 cm · Vergeilt/dünn am 02.10.2026" with the hint "kein Erfolgssignal"; the response of the cards route carries `letzteMessung` with `wert: 14`, `foto: null` (`03-card-etiolated-and-without-measurement-*.png`).
- ✅ After a reload the same card is there (the data comes from the database).
- ✅ Core, DB and API test: with the same date the measurement recorded last counts; specimens without a measurement are missing from the answer.
- ✅ The photo stays `null`, no invented value (P-08); it comes with the media processing.
- ⏭️ Treatments are not part of this ticket: "keine offene Behandlung" stays (BEH).

## 2. Tenant isolation (P-04)

- ✅ DB test with two accounts: Ben asks for Anna's specimen and gets nothing, Anna does not see Ben's measurement (`lastFor` runs under the row rules of the account).
- ✅ API test with two accounts: the card of Ben's specimen carries no measurement of Anna; Anna's specimen does not appear in Ben's cards.
- ✅ Core test: measurements of another account do not appear; without IDs the store is not asked at all.
- ✅ By hand: Ben sees an empty collection (`benKarten: []`, `04-foreign-account-empty-*.png`).
- ⏭️ No new table and no migration: the generic tenant test for `measurement` applies unchanged.

## 3. Layout and accessibility (rough)

- ✅ Mobile 375 px: no horizontal scrolling (`scrollBreite` = 375), all buttons, selects and inputs at least 44 px high (`kleineZiele: []`); desktop 1440 px likewise.
- ⚠️ axe (WCAG 2.1 AA) reports one `color-contrast` violation on one element of the collection view (desktop and mobile). Which element was not determined; in BES-06 and BES-07 it was the contrast of the footer "Version …" (open as #249). Not changed.
- ⏭️ Dark scheme and keyboard operation of the new line not checked.

## 4. Open

- Photo on the card (media processing, US-WAC-05), rate and trend (US-WAC-03/04).
- Archived specimens are not passed to the port, as before (BES-07).

---

## US-WAC-01 record a measurement (issue #74, 2026-11-09)

**Branch:** `feat/wac-01-messung-erfassen` (draft PR 1794, from `origin/dev`; the claim on `dev` is `chore(wac): claim wac-01 (#74)`)
**Environment:** Linux 7.3 (CachyOS), Node v26.13.0, Playwright 1.64.1 (Chromium 1248 from the Playwright cache), Docker. PostgreSQL 18.6 in its own container (port 54565 from `worktree-env.mjs`, `make db-up`, `make migrate` with all 116 migrations applied). API in dev mode (`tsx watch`) on port 55065, web (Vite) on port 55565, the e2e origin 56565 registered at the sign-in service with `web-port.mjs` (both origins added, nothing replaced). The sign-in service is the shared Keycloak of the main checkout on port 18081; it was not started, restarted or given credentials. Browser time zone (device) `Pacific/Kiritimati` (UTC+14), the profile zone `Pacific/Pago_Pago` (UTC-11); at the time of the run the two zones showed different calendar days (the default-date check depends on it).
**Method:** section 0 (gates and tests) first, then the manual flow: a Playwright script (not checked in) against the real app, signed in as the dev account `test` through the real sign-in page, the first plant through the first-plant onboarding, the profile zone set in "Einstellungen → Profil". Desktop 1440×900 and mobile 375×812, each in its own browser context (one sign-in per context). Screenshots in `wac-01/` (`05` to `16`, `NN-<state>-desktop.png` and `NN-<state>-mobile.png`). Raw measurements of the run in the same folder: `protocol-run.json`.

**Deviations (environment, not product):**

- `make db-seed` was not run: it depends on `make auth-up`, which a worktree must not run, and the demo seed reads the admin password from the main checkout's `.env`. Instead the catalog part of the demo seed ran alone: `seedCatalog` with the 51 species of `app/packages/api/perf/catalog-seed/species-list.ts`, on this worktree's test database. No demo accounts were seeded; the account `test` was provisioned by its first sign-in.
- No object storage here (no `S3_*` variables, no MinIO container): the server answers the photo with `media.storage_unavailable` (502). Section 6 shows the refusal path; a stored photo was not seen on screen (the photo tests of US-WAC-05/06 cover the stored copy).
- `make one-screen` was not run: it depends on `make auth-up`, which a worktree must not run (see the report).

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

### 0. Gates and tests

- ✅ `make gates` before the protocol: exit 0, 24 steps, 0 failed (scratch log of the run; repeated after this section was written, see the report of the PR).
- ✅ Red first: the new web tests failed on the unchanged code (3 of 105 in the measure folder: the emptied date, the typed "31.02.2026", the schema case; the form sent a POST without a date). The core test "an emptied date (empty text) is refused and writes nothing" was green before the change: the server already refused an explicit empty date (`dateField`), only the web form hid it.
- ✅ Green after the fix: `care/measure` 105 of 105 (99 before), `shared/lib/text-rules` (naming test of the message tables) and `care/measure` 190 of 190 (11 files), `core/src/care/measurements` 101 of 101 (100 before).
- ✅ Full suites: web `npx vitest run` 300 files, 3536 tests, exit 0; core `npx vitest run` 185 files, 2332 tests, exit 0.
- ✅ Automated tests for the time zone: `US-WAC-01 the form's date is today in the profile's zone, even when the device's zone has another day` (fake timers, 9 November 2026 at 23:30 UTC, profile zone Pacific/Pago_Pago or Pacific/Kiritimati, chosen so that the device zone shows another day); `US-WAC-01 the request names the profile's time zone once one is chosen, not the device's (US-ACC-02)`.
- ⏭️ `make ci` not run (the skill asks for it as section 0; the brief asked for `make gates`); `make one-screen` not run (it depends on `make auth-up`, which a worktree does not run, see the report).
- ✅ `make ds-snapshots-check` exit 0 (`QG-U5 snapshots: ok`, 49 ui stories and 14 page states, light and dark; 126 passed). The four ✘ rows in its log are the `ds-snapshot-fixture-*` cases of the self-test; the gate reports `QG-U5 snapshots: ok` and the self-test passes 5 of 5. No baseline image changed.

### 1. Criterion a: the view shows the growth measure, last measurement, rate, trend, last assessment and the form

**Expected:** "Was messen?" with the growth measure of the species; the last measurement; rate and trend (cm per year, from the own measurements only); the last assessment; the input form. Without a species measure: "Wachstumsmaß unbekannt: …" (P-08, P-09).

**Observed (mobile and desktop alike):**

- ✅ Layer "Verlauf" part "Überblick" (`10-verlauf-ueberblick-*.png`): "Was messen?" with "Wachstumsmaß unbekannt: Wähle selbst Höhe, Rosettendurchmesser oder Trieblänge und bleib dabei. Miss immer dasselbe Maß an derselben Stelle, sonst sind die Werte nicht vergleichbar.", "Rate 2,9 cm/Jahr", "Trend stabil", "Letzte Bewertung Gesund · 09.11.2026". The growth measure is unknown because the seeded catalog species has none; the text is the one the spec names (aligned with the UI).
- ✅ Rate check by hand: first measurement 10 cm on 02.01.2026, last 12,5 cm on 09.11.2026: (12,5 − 10) / 311 days × 365 = 2,93 cm/Jahr, shown as 2,9 cm/Jahr.
- ✅ The fact line on the page: "Letzte Messung 11 cm am 09.11.2026" with the button "Verlauf (n)" (`16-saved-confirmation-*.png`).
- ✅ Automated: `US-WAC-01 shows "Was messen?", last measurement and last rating`, `FR-WAC-05 a cutting is marked as Steckling`, `US-WAC-03 shows rate and trend …`, `… "noch keine Rate"`.
- ⏭️ Not seen by hand: a species with a growth measure ("Höhe." etc.; the automated test "Rosettendurchmesser." covers the text), the cutting badge (automated only).

### 2. Criterion b: number in steps of 0.5 cm, quality, optional note, optional photo; non-numeric or negative input is rejected without writing

**Expected:** a number on the 0.5 grid; invalid input is refused before sending and writes nothing; the count of measurements does not change.

**Observed:**

- ✅ "abc" → "Bitte gib eine Zahl ab 0 an, zum Beispiel 12,5." (refusal in the form, the value stays, the count of measurements stays at Verlauf (8)) (`08-invalid-number-*.png`).
- ✅ "12,3" → "Miss in Schritten von 0,5 cm, zum Beispiel 12 oder 12,5." (refusal, nothing written).
- ✅ Quality select: "Gesund" (preset) and "Vergeilt/dünn" (chosen for the back-filled measurement, which then shows as a hollow diamond in the Kurve, `11-verlauf-kurve-mobile.png`).
- ✅ Note behind "Mehr Angaben" (closed by default), as in the earlier e2e.
- ✅ Photo, real flow with a 1×1 PNG chosen in the file input (`06-photo-storage-refused-*.png`): the measurement 12,5 was saved; the photo was refused by the server with `media.storage_unavailable` (502, this environment has no object storage). The toast says: "Die Messung ist gespeichert, das Foto nicht. Der Bildspeicher antwortet gerade nicht. Deine Daten sind nicht betroffen; versuche es später erneut." (P-10: nothing disappears silently, the measurement is kept, the German text of the code, no raw server text).
- ⏭️ Not run by hand: "-3" (automated in the e2e spec and in the form tests), a non-image file (automated: `a file that is not an image is rejected before sending`), a stored photo on the card or in the list (no object storage here; the photo tests of US-WAC-05/06 cover it).

### 3. Criterion c: the date defaults to today in the user's time zone and is changeable (back-filling)

**Expected:** the default is today in the profile's time zone, not the device's (NFR-08, US-ACC-02); a past date can be typed; an emptied date or one that is no real day is refused (P-10).

**Observed:**

- ✅ Profile zone set to `Pacific/Pago_Pago` (UTC-11) in "Konto → Einstellungen → Profil"; browser (device) zone `Pacific/Kiritimati` (UTC+14). The form's "Datum" shows **09.11.2026** (profile zone); the device zone would give 10.11.2026. Measured in both viewports (`defaultDate` in `protocol-run.json`).
- ✅ Back-filling: "02.01.2026" with 10 cm and quality "Vergeilt/dünn" → "Gespeichert: 10 cm am 02.01.2026." (`07-back-filled-*.png`), the entry appears in the list at its date.
- ✅ Emptied date (the field cleared) → "Bitte gib ein Datum an, das es gibt, zum Beispiel 09.11.2026.", the field is marked invalid (`aria-invalid=true`), no POST, the count stays the same (`09-invalid-date-emptied-*.png`); the focus on "Datum" is an automated assertion, not logged in the run. Before the fix the form dropped an empty date from the request and the server recorded today silently.
- ✅ Typed "31.02.2026" (no real day) → the same text, nothing written.
- ✅ Automated: the schema case, the two DOM cases (`US-WAC-01 an emptied date is refused in the form …`, `US-WAC-01 a typed date that is no real day …`), the form default in the profile zone and in the device zone (fallback), the request's `timeZone`; core: `US-WAC-01 an emptied date (empty text) is refused and writes nothing; a missing date means today`.
- ⏭️ Not run by hand: a date in the future (automated in core and the form's `max`), and a time zone change while the form is open.

### 4. Criterion d: the view names the growth measure and reminds the keeper to measure the same dimension at the same place (a hint, nothing enforced)

**Expected (owner decision 2026-11-09):** the reminder is visible; nothing blocks a different place.

**Observed:**

- ✅ The reminder "Miss immer dasselbe Maß an derselben Stelle, sonst sind die Werte nicht vergleichbar." stands in the Überblick part below "Was messen?" (`10-verlauf-ueberblick-mobile.png`).
- ✅ Nothing is enforced: a measure is accepted whatever the place (no check exists).

### 5. Criterion e: saving is idempotent (US-QS-03)

**Expected:** a repeated save after a lost answer writes one measurement.

**Observed:**

- ✅ Automated only: `US-QS-03 a second try after a lost answer sends the same Idempotency-Key: one measurement` (measure page test), the core operation test with the same key, the API test.
- ⏭️ Not reproduced by hand (no network loss was produced in the browser).

### 6. Criterion f: the layer "Verlauf" with the parts "Überblick | Kurve | Messungen", one screen, paged, `&teil=` kept on reload

**Expected:** the layer opens on "Überblick"; the three parts switch; the entries are newest first and paged by the free height; the part is in the address and survives a reload.

**Observed (mobile 375×812 and desktop 1440×900):**

- ✅ "Überblick" first (`10-…`), "Kurve" with the chart: healthy measurements as circles, the etiolated one as a diamond, the legend "Kreis: gesund. Raute: vergeilt/dünn; solche Messungen zählen nie als Erfolg." (`11-verlauf-kurve-*.png`); the address shows `teil=kurve`.
- ✅ "Messungen": newest first, two entries per page on the phone (eight entries, four pages), three on the desktop ("Seite 1 von 6" with 17 entries) with "Zurück" and "Weiter" (`12-verlauf-messungen-page1-*.png`); "Weiter" shows "Seite 2 von 4" (`13-…`).
- ✅ The layer fits the phone screen; the pager stays on screen (`12-…`, horizontal overflow 0 px).
- ✅ Reload on `teil=messungen`: the layer is open again on the part "Messungen" (`14-reload-keeps-messungen-*.png`).
- ✅ Automated: the part in the address and its default (`course-layer`), the pager.

### 7. Criterion g: the measure view's address (`?form=measure&plant=<id>`): Back closes, reload opens it for the same specimen, Back with a typed value asks "Eingabe verwerfen?"

**Observed:**

- ✅ Address after "Messen": `collection?form=measure&plant=<id>` (both viewports).
- ✅ Back without input closes the view (back at `/collection`); the same address opened again shows "Messen: Bogenhanf" (the same specimen).
- ✅ Back with a typed value: "15" typed with key events → Back → the question "Eingabe verwerfen?" with the text "Was du eingetragen hast, ist noch nicht gespeichert. Verwirfst du es, ist es weg." and the buttons "Weiter bearbeiten" and "Verwerfen" (`15-back-asks-discard-*.png`). "Weiter bearbeiten": the form stays, "15" is kept; a second Back asks again; "Verwerfen" leaves the view (`/collection`).
- ⚠️ In the first run of the protocol this step failed on both viewports: the script filled the field and pressed Back in the same tick, before the guard entry was pushed; with a pause of 400 ms, or with key events as a person types, the question appears (`probe-fill` and the focused re-run in `part2`). Not analysed further; the guard is armed by the input event, so the timing of an immediate Back is worth a look.

### 8. Save confirmation on the phone

- ✅ After a valid measurement: "Gespeichert: 11 cm am 09.11.2026." as a status line above the bottom navigation (`16-saved-confirmation-mobile.png`); its box (y 694–714) and the button "Messung speichern" (y 484–532) do not overlap (0 px). Desktop: no overlap either.
- ⚠️ With "Mehr Angaben" open and the photo failure toast, the toast lies over the photo field's controls (`06-photo-storage-refused-mobile.png`). The toast can be closed, the text is complete, but it hides the file field until closed.
- ⚠️ After a save, the growth note "Dein Wachstum ist noch unbekannt. …" (US-QS-15, issue 1644) lies over the value label on the phone (`06-…`); it closes with "Schließen" and the form keeps its place (by design, overlay without layout effect).

### 9. Layout and accessibility

- ✅ Horizontal overflow 0 px at every state measured, mobile and desktop (`overflowPx` 0 on all layout checks).
- ✅ Tap targets: every visible interactive element measures at least 44 px high and wide, except the skip link "Zum Inhalt springen" (1×1 px, visible only on focus). Eight (phone) and twelve (desktop) elements are 44 px high or wide, below the 48 px the skill names. That meets the repo's 44 px rule; the 48 px reference is not met for these (⚠️ noted, not changed).
- ✅ axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) on the measure view: no violations, mobile and desktop.
- ⏭️ Dark scheme in the browser (the snapshot check covers the components), keyboard walk of the new discard dialog (the dialog uses the shared dialog).
- ⏭️ Not run: `make a11y-routes` (needs the auth target).

### 10. Open points

- The environment has no object storage: a stored photo was never seen on screen; the refusal path (502, German text, measurement kept) was.
- The seeded catalog species have no growth measure, so only the "unbekannt" text was seen on screen; the "Höhe."/"Rosettendurchmesser." text is automated only.
- The first-plant guide ("Schritt 1 von 2: Deine erste Pflanze") appeared on `/today` for the account that already had a plant (desktop pass and a later probe; `isNewAccount` in core is false for it). Not investigated: it belongs to the onboarding (US-ONB-01), not to this story.
- Deviations of the environment: no `make db-seed` (it needs `make auth-up`); the catalog part of the demo seed ran alone (`seedCatalog`, 51 species); the dev account `test` signed in for the first time on this database (the first-plant onboarding appeared).
- `make one-screen SCREEN=…` and `make ci` were not run here (see the report).
