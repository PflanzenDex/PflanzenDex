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
