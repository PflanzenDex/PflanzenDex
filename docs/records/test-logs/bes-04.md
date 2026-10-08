# Test log: US-BES-04 Create a cutting and pot it (issue #60)

**Branch:** `feat/bes-04-steckling-anlegen-und` (from `origin/dev`, state after the English rename, ADR 0004; the feature was first built on the German names and then re-applied on the English ones)
**Environment:** Linux, Docker; PostgreSQL 16 in its own container (port 54814 from `worktree-env.mjs`), API port 55314, web (Vite) port 55814, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18797 (the shared sign-in service on 18081 belongs to another session and was not touched). The realm is a copy with the redirect address changed to `http://localhost:55814`; the test accounts were created through the admin API (email confirmed). Chromium through Playwright (time zone Europe/Berlin, locale de-DE); date 2026-10-03.
**Method:** tests first (red runs in `bes-04/red-*.txt`), then implementation, `make ci`, then operation by hand (Playwright script, not checked in) against the real Keycloak, API and database. Species were created through the UI; zones, location and the comparison plant through the API with the token of the account. Screenshots desktop 1440×900 and mobile 375×812 in `bes-04/`, raw observations (texts, API answers, axe, target sizes) in `bes-04/observation.json` (keys as recorded, German). The throwaway Keycloak and the servers were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but something stands out · ❌ error · ⏭️ not checked

---

## 0. Red runs and gates

- ✅ `red-core.txt`: 10 of 100 tests red (skeleton of `exemplar.eintopfen`, `stecklingslicht` and the creation with a status had no behaviour yet; the stubs compiled).
- ✅ `red-db.txt`: 5 of 20 red (the adapter had no `eintopfen`, no `status` on insert).
- ✅ `red-api.txt`: 6 of 9 red (route `POST /exemplare/:id/eintopfen` missing: 404).
- ✅ `red-web.txt`: 7 of 8 red (no client function, no tick box, no button).
- ⚠️ The four `.txt` files are the raw runs **before** the rename to English (German identifiers, as recorded, ADR 0004). After the rename the same tests were ported one to one; they were run green, not red again.
- ✅ `make ci` exit code 0 after the rename (lint, types, boundaries AB-7 to AB-14, baseline, knip, spec, principle and skill checks, duplicates, format, docs, tests with coverage thresholds, CRAP, build). Own test database, the shared one was not used.

## 1. Criterion: "Cutting" sets `status: cutting` and cutting light; the location is the one of the growth phase, also in dormancy

- ✅ Form: tick box "Das ist ein Steckling" (unticked at the start, `observation.json`: `hakenStart` false) with the explanation that a cutting stands under cutting light and is missing in the phases and in the light distribution (`02-form-cutting-*.png`).
- ✅ With the tick and the location "Regal Süd" (zone "Lampe 2"): message "Steckling … ist angelegt. Er steht unter Stecklingslicht; tippe auf der Karte „Eingetopft“ …" (P-09). The card shows `Lichtzone: Lampe 1 · Status: Steckling · Standort: Regal Süd`: Lampe 1 is the lowest zone of the account, the zone of the location is **not** used for a cutting (`03-collection-cutting-*.png`, `kartenSteckling`).
- ✅ Location of the growth phase: core and API tests with a stub of the port `TargetLocationSource.growthLocation` (a cutting asks only `growthLocation`, never `targetLocation`; a chosen location comes first; without an answer the location stays "unknown", P-08).
- ⏭️ In the app the port has no implementation yet (care profile BES-09): without a chosen location the location of a cutting is "unknown". Not shown by hand.
- ⚠️ **Assumption (design decision):** the zone of a cutting is derived (lowest zone of the account, the same rule as `zoneDistribution`), not stored. The spec's "removes the light zone override" therefore means: nothing to delete, the status alone decides.

## 2. Criterion: phase tracker and light distribution exclude cuttings

- ✅ Distribution before repotting: `notCounted.cuttingLight` = 1, zone "Lampe 2" counts only the plant (`distributionBefore`); the page text says "Nicht mitgezählt: 1 unter Stecklingslicht".
- ✅ Phase list: only status `plant` is listed (existing test of PHA-01, unchanged). By hand the list was not opened (the example species have no dormancy period), so this is **no** evidence by hand.

## 3. Criterion: "Eingetopft" is an action

- ✅ Only the cutting card has "Eingetopft" (`eintopfenKnoepfe` 1 of 2 cards).
- ✅ Click: message "„… ist eingetopft und eine Pflanze. Ab jetzt gilt die Lichtzone seines Standorts oder der Art.“", the button disappears, status and zone change (`lightZone` "Lampe 2", `04-repotted-*.png`); the distribution now counts 2 in "Lampe 2" and 0 under cutting light (`distributionAfter`). After a reload still no button (`nachReloadKnoepfe` 0).
- ✅ A plant cannot be repotted: API answer `specimen.not_a_cutting` (409), status stays (also core, db and API tests; archived cuttings too).
- ✅ Repeating the request with the same `Idempotency-Key` returns the first answer (core and API test).
- ⏭️ The feed event "Eingetopft" for shared specimens: not built, needs SOZ and sharing (open point, spec stays 🟨).

## 4. Criterion: the species keeps its target profile

- ✅ Nothing in the species is touched: `specimen.repot` writes only `status` of the specimen (db test compares the whole row before and after). Not checked by hand beyond the card text "Art: …".

## 5. Tenant isolation (P-04)

- ✅ Core, db and API tests with two accounts: a foreign cutting cannot be repotted, the answer (404 `specimen.not_found`) is identical to an unknown id, nothing changes. No new table, so no new tenant fixture.
- ✅ By hand: the second account has an empty collection (`benKartenApi` 0) and gets 404 when repotting the first account's cutting (`benEintopfenMaras` 404).

## 6. Layout and accessibility (rough)

- ✅ Mobile 375 px: no horizontal scrolling (`scrollBreite` 375), all buttons, inputs and selects at least 44 px high (`kleineZiele` empty), the tick box has a 48 px row.
- ✅ Two layout faults were found in the first screenshots and fixed before the final run: the tick box was centred and oversized, and three buttons per card broke words ("Mess/en"). Now the tick box sits in front of its text and the buttons wrap as whole buttons.
- ✅ axe (WCAG 2.1 AA) in the light scheme: only the contrast of the footer "Version …" (found in BES-06, issue #249, not part of this ticket, not changed). Dark scheme: no violations (`05-dark-form.png`).
- ⏭️ Screen reader and keyboard-only operation not checked.

## Open points

- Feed event "Eingetopft" for shared specimens (SOZ).
- Implementation of `growthLocation` in `care` (care profile BES-09); until then a cutting without a chosen location has an unknown location.
- Footer contrast (#249).
