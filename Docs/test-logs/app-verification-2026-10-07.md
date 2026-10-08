# Test log: app verification on `dev` (2026-10-07)

**Branch:** `dev` @ `3307da0` (no changes to the code).
**Environment:** WSL2/Linux, Node 24.21; PostgreSQL 16 test container (port 54329) with its own database `verify_20261007` (all migrations `0001`–`0022` applied), API port 3000, web (Vite) port 5173, shared Keycloak 26.8 from `make auth-up` (port 18081); Chromium (headless) via Playwright 1.63 (Europe/Berlin, de-DE); date 2026-10-07. Nothing was changed at runtime.
**Method:** `make ci`, then a Playwright script (not checked in) against the real stack at 1440×900 (`-desktop`) and 375×812 (`-mobil`). Each viewport gets its own account, created through the Keycloak admin API with the e2e helper (`app/packages/e2e/support/account.ts`). Real login in the browser, then the core flow by hand through the UI: adopt the default lamps, create a location, propose a species, create a specimen, record a measurement (valid and invalid). After that every view is opened once. Every step checks horizontal overflow, console errors, page errors and 5xx responses. Screenshots (full page) and raw observations (`observation-desktop.json`, `observation-mobil.json`) are in `app-verification-2026-10-07/`. No axe run in this pass.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates

- ✅ `make ci` exit code 0 on `3307da0` (vitest: 336, 813, 255 and 918 tests passed in the four packages; check scripts 415 of 415).
- ⏭️ `make e2e` and Lighthouse were not run.

## 1. Sign-in (US-ACC-01)

- ✅ Signed out, the start page shows "Anmelden" (`01-signed-out`). The button leads to the Keycloak login (`02-login`). After login the start view opens with the onboarding wizard "Schritt 1 von 3 · Wo stehen deine Pflanzen?" (`03-start`).
- ⏭️ Registration with mail confirmation was not run (accounts were created through the admin API; see `acc-01.md`).

## 2. Locations and light zones (US-LIC-05)

- ✅ Empty state with next actions (`04-light-empty`). "Standard-Lampen übernehmen" creates Lampe 1–4; the location "Fensterbank Süd" on Lampe 3 shows up (`05-light-set-up`).
- ⚠️ Desktop and mobile (`20-light-with-specimen`): the sections "Lichthunger", "Einstufungsregeln", "Indikatoren für höhere Stufen" and "Warnzeichen" sit **above** the page heading "Standorte und Lichtzonen" and outside its card. The h1 is therefore not the first thing on the page.

## 3. Species catalog and proposal (US-BES-01, US-BES-02)

- ✅ Species search (`06-species-search`), form "Art vorschlagen" with the hint that the proposal first goes to the review list (`07-species-proposal`), "Diese Art wählen" leads to "Exemplar anlegen" (`08-specimen-new`).
- ⚠️ The e2e helper `withSpecimen` in `measure.spec.ts` uses labels such as `"Lateinischer Name *"`; in the running app the accessible name has no space before the asterisk. The script only got past this step with `/^Lateinischer Name/`. Whether `make e2e` is red because of this was not checked (⏭️).

## 4. Collection (US-BES-…)

- ✅ After "Exemplar anlegen" the collection shows the confirmation, the distribution over the light zones and the specimen card with the actions Messen, Kennzeichen, Fangdatum, Archivieren (`09-collection`).
- ⚠️ The card says "Lichtzone: unbekannt", while the distribution next to it counts the specimen under "Lampe 3: 1 Exemplar" and the light view lists it under Lampe 3. The note ("es zählt die Zone des Standorts, sonst die der Art") explains the count, but the card does not take the species zone. Inconsistent to read.

## 5. Measurement (US-WAC-01)

- ✅ "Gespeichert: 12,5 cm …" after saving (`10-measure`).
- ✅ The input "abc" is rejected with "Bitte gib eine Zahl ab 0 an" (`11-measure-invalid`).

## 6. Other views

| Nr. | View                       | Result                                                                                                                                                                                                                    |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | Start with data            | ✅ "Deine Pflanzen warten im Bestand …" with "Zum Bestand"                                                                                                                                                                |
| 13  | Pokédex                    | ✅ "1 Art gefangen", card Echeveria elegans with the caught date; "Fehlend" and "Artenarm" are disabled with an explanation (P-10). ⚠️ mobile: the counter "1 Art gefangen" touches the label "Suche …" below it (no gap) |
| 14  | Wunschliste                | ✅                                                                                                                                                                                                                        |
| 15  | Pflegephasen               | ✅ empty state with "Zum Bestand" (P-09)                                                                                                                                                                                  |
| 16  | Behandlung                 | ✅                                                                                                                                                                                                                        |
| 17  | Hinweise                   | ✅                                                                                                                                                                                                                        |
| 18  | Pflegeprofil               | ✅                                                                                                                                                                                                                        |
| 19  | Artenvergleich             | ✅                                                                                                                                                                                                                        |
| 21  | Konto                      | ✅                                                                                                                                                                                                                        |
| 22  | Einstellungen              | ✅                                                                                                                                                                                                                        |
| 23  | `/review` without the role | ✅ redirect to start with "Die Prüfliste ist nur für Prüfende …"                                                                                                                                                          |

## 7. Cross-cutting checks

- ✅ No horizontal overflow at 1440 px or 375 px on any of the 23 states.
- ✅ No console errors, no page errors, no 5xx responses (desktop and mobile).
- ✅ Mobile: bottom navigation Start, Arten, Bestand, Behandlung, Mehr; desktop: two-line top navigation.
- ⏭️ axe, tap target sizes, dark mode and zoom were not checked in this pass (see the QS-12 screenshots).

## Open points

- Light view: move the reference sections below the page heading, or into the card (finding 2).
- Collection card: show the zone the distribution uses (location, otherwise species) instead of "unbekannt" (finding 4).
- Pokédex mobile: gap between the counter and the search label (finding 6).
- Check the e2e labels with an asterisk (`"Lateinischer Name *"`) against `make e2e` (finding 3).
- The footer shows "Version unbekannt": expected locally because `APP_VERSION` is not set.
