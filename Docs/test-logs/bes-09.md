# Test log: US-BES-09 Adjust my own care profile per species (issue #179)

**Branch:** `feat/bes-09-eigenes-pflegeprofil-je-art` (from `origin/dev` at eb99860, after US-PHA-03)
**Environment:** WSL2/Linux, Node 25, Docker; PostgreSQL 16 in its own container (port 54722 from `worktree-env.mjs`), API port 55222, web (Vite) port 55722, Keycloak 26.8 with the realm import from the repo (redirect address adapted) in its own throwaway container on port 55822. The shared sign-in service on 18081 was not touched. Chromium via Playwright (time zone Europe/Berlin, locale de-DE); date 2026-10-04.
**Method:** tests first (red runs in `bes-09/red-*.txt`), then implementation, `make ci`, then manual operation (Playwright script, not checked in) against the real stack. Zones, locations, species and specimens were created through the API with the token of the account, the profile and the flow through the UI. Screenshots desktop 1440x900 and mobile 375x812 in `bes-09/`, raw measurements (texts, API responses, axe, target sizes) in `bes-09/observation-desktop.json` and `-mobile.json`. Containers, servers and temporary files were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Red runs and gates

- ✅ Red: `red-core.txt` 40 of 386 red, `red-db.txt` 9 of 134, `red-api.txt` 14 of 161, `red-web.txt` 15 of 241. The skeletons compiled (typecheck green); operations threw "not implemented", the effective profile threw, the page showed only a heading.
- ⚠️ `red-db.txt`: besides the 8 profile tests, 1 existing schema test is red because the new table was not yet in the module register when the run was made (`pflegeprofil` was reserved there; renamed to `care_profile`); that register entry and the expectation of one more foreign key to `species` in `module-schema.test.ts` were then adjusted. The two small API client tests per web file were written with the skeleton, so they are green in the red run.
- ✅ `make ci` exit code 0 (secrets, workflows, lint, types, boundaries AB-7 to AB-14, knip, spec/principles/skills, duplicates, format, docs, tests with coverage ratchet, CRAP max 37.1 of 450, build). Tests: core 391, db 134, api 162, web 242. Branch coverage of `db` was at 89.89 % first (threshold 90 %); the refusal of an unknown species by the foreign key got a test instead of touching the threshold.
- ⏭️ `make e2e` (shared Playwright suite) was not run and no e2e test was added; the manual run below replaces it for this story.

## 1. Criterion: catalog value and my deviation side by side, only overridable fields

- ✅ Tab "Pflegeprofil" lists Dracaena (2 active specimens) and Epipremnum (1) with, per field, "Katalog: …" above the control: locations "unbekannt", zone "Zone 3" (derived from the lux need), dormancy "01.11. bis 15.03.", watering "unbekannt" plus "Hinweis der Art: …", `03-*.png`.
- ✅ Only the fields of FR-BES-09 have controls. A catalog field through the API (`latinName`) is `input.invalid` with the field named (`observation`: `catalogField`); core/api tests for `growthMeasure`, `difficulty`, `successCriteria`.
- ✅ Species with only archived specimens drop out of the list (api test); a species with a deviation stays listed without a specimen so it can be reset (core test).

## 2. Criterion: target location selected from my locations, zone override, dormancy override

- ✅ Locations and zones are `<select>` lists of the account's own ones, no free text (web test, `03-*.png`). A location or zone ID of another account is 404 `location.not_found` / `light_zone.not_found` (Mara with Ben's location and a random zone: observation `maraAttackBensLocation`, `maraAttackBensZone`).
- ✅ Dormancy from/until as month and day selects, sent as a pair (`MM-DD`); half a period is not sent, the page says "Gib Beginn und Ende der Ruhephase vollständig an (Monat und Tag)." (`11-*.png`); the server refuses it too (core test).
- ✅ Zone override: Dracaena set to "Zone 4"; the light distribution then counts the specimen without location in Zone 4 instead of the derived Zone 3 (`distribution`: Zone 3: 2, Zone 4: 1; `13-*.png`). Cutting light stays never a target (core test).
- ⚠️ Watering intervals are stored and shown, but nothing reads them until US-MON-05.

## 3. Criterion: reset to catalog per field, empty profile valid

- ✅ "Auf Katalog zurücksetzen" next to each field, disabled without deviation. Reset of the dormancy location: message "„Soll-Standort Ruhephase“ für „Dracaena“ gilt wieder nach Katalog.", control back to "Katalog gilt" (`afterResetDormancyLocation: ""`). Reset of the dormancy period resets both ends.
- ✅ Every field reset leaves a valid empty profile (core, db, api tests); without a profile the catalog applies and unknown stays "unbekannt" (P-08).

## 4. The end-to-end flow (profile, phase list, "Jetzt umgestellt", hint gone)

- ✅ Before the profile: phase list shows "Soll-Standort: unbekannt" and no button (`01-*.png`); the Hinweise tab lists "Dracaena – Eins" and "– Zwei" and "Epipremnum" as "hat noch keinen Standort" (`02-*.png`).
- ✅ Profile: growth location Wohnzimmer, dormancy location Kühler Flur, watering 10 days, own hint, "Speichern": status "Pflegeprofil für „Dracaena“ gespeichert." (`04-*.png`, `05-*.png`).
- ✅ Pflegephasen now shows "Soll-Standort: Wohnzimmer", the group button "Alle 2 nach Wohnzimmer umstellen" and "Jetzt umgestellt" per row (`06-*.png`): the real implementation of the port `PhaseLocationSource` (before, the running app showed "unbekannt").
- ✅ "Jetzt umgestellt" on "Dracaena – Eins": "„Dracaena – Eins“ steht jetzt am Standort „Wohnzimmer“." (`07-*.png`), checked in the database over the API (`eins: true`).
- ✅ BES-08 consistency: the hint for "Dracaena – Eins" is gone; "Zwei" and "Epipremnum" remain (`08-*.png`), because their location is still missing.
- ✅ Own dormancy 01.09. to 30.11. changes today's phase of the same specimens to "Ruhephase" with target "Kühler Flur" (`10-*.png`), the catalog period would say growth phase.
- ✅ API test: a new specimen without a chosen location is placed at the growth location of the profile (port `TargetLocationSource`, FR-PHA-05).

## 5. Zone in use cannot be deleted unnoticed

- ✅ `DELETE /light-zones/<Zone 4>` with Dracaena pointing to it: 409 `light_zone.in_use`, `data` names `{ kind: "care_profile", name: "Dracaena" }`, the web text shows "Pflegeprofil der Art: Dracaena" (web test; `12-*.png` shows the page).

## 6. Private, tenant isolation (P-04, P-05)

- ✅ Table `care_profile` is in the generic tenant test with a fixture (db 134 tests green); db test with two accounts and the same species keeps separate profiles. No sharing setting exists yet that could read it (SOZ).
- ✅ By hand: Ben's Pflegeprofil is empty (`14-*.png`), `GET /care-profiles` returns 0 entries, his `PUT /care-profiles/<Mara's species>` is 404 `species.not_found` (private proposal of another account looks unknown), Mara's profile is unchanged (`maraStill: true`).

## 7. Refusals stay visible, repeat is harmless

- ✅ A refusal of the server stays as an alert and no success message is shown (web test); the same `Idempotency-Key` replays the stored answer, a different body under it is 409 `idempotency.key_conflict` (api test); a double tap on "Speichern" sends one request (web test).

## 8. Layout and accessibility (rough)

- ✅ Mobile 375 px: no horizontal scrolling (`scrollWidth` 375), no control below 44 px (`smallTargets: []`); axe (WCAG 2.1 AA) on the phase list, the empty and the filled profile: no violations, desktop and mobile.
- ⏭️ Dark scheme, keyboard-only use, screen reader not checked.
- ⚠️ On desktop the page keeps the narrow single column of the existing layout; cards use the full width available there.

## Open points

- FR-BES-12: the hint when the catalog changes a value I did not override needs catalog versions (not built).
- Wish as a trigger for a species in the view (WUN does not exist).
- Watering intervals are read by nobody until US-MON-05; the specimen card (BES-06) still shows only the zone of the location.
- No specimen field overrides a profile field yet, so the specimen layer of the effective profile is empty (tested with a synthetic specimen layer).
- Story stays 🟨.
