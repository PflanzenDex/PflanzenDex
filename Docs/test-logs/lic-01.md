# Test log: US-LIC-01 Assign a species to the right light zone (issue #65, delivered with PR #241)

**Branch:** `docs/testprotocols-lic-01-pha-01` (protocol only, from `origin/dev` at `ff285d8`; the story itself was merged earlier with #241 and translated with #258)
**Environment:** Linux (CachyOS), Node 24.21, Docker; PostgreSQL 16 in its own container (port 54551 from `worktree-env.mjs`), API port 55051, web (Vite dev server) port 55551, Keycloak 26.8.0 with the realm import from the repo in its own throwaway container on port 18799 (the shared sign-in service on 18081 and the shared test database on 54329 belong to other sessions and were not touched). The realm is a copy with the redirect address changed to `http://localhost:55551`; the two test accounts (Anna, Ben) were created through the Keycloak admin API (email confirmed). Chromium via `playwright-core` 1.60, axe-core with the tags wcag2a, wcag2aa, wcag21a, wcag21aa. Run on 2026-10-03.
**Method:** the automated tests of the story already exist (see section 0), so this protocol covers what they cannot: the real login, the real browser, the real database, texts and layout. A Playwright script (not checked in) drove the UI; all inputs were typed into the forms, the zones were created with the button "Standard-Lampen übernehmen", the catalog species with the form "Art vorschlagen". Expected results were computed by hand from the rule of the spec (80 % / 30 %) **before** the run, not copied from the output. Screenshots desktop 1440×900 and mobile 375×812 in `lic-01/`, raw data (every check with expected and observed value, axe findings with element and message, layout measurements) in `lic-01/observation.json`. The container, the servers and the browser were removed afterwards.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

**What this is about:** the account's zone of a species is derived live from the lux demand of the species, its default level 2–4 and the zones of the account (FR-BES-10), never stored (P-01). The view "Standorte und Licht" has the form "Zone ermitteln" for it; the specimen distribution (US-LIC-02) uses the same derivation for specimens without a location.

Default zones of the account in this run (button "Standard-Lampen übernehmen"): Lampe 1 up to 1,500 lux (cutting light), Lampe 2 up to 15,000, Lampe 3 up to 100,000, Lampe 4 up to 110,000.

---

## 0. Gates and automated coverage

- ✅ `make ci` on this branch (docs only on top of `dev`): exit 0 with its own test database (port 54551). This shows the state of `dev`, not a change by this PR.
- ✅ Automated tests that carry the story ID and were **not** re-run one by one here (they are part of `make ci`): core `derive.test.ts` (rule), API `light.test.ts` (route, tenant isolation), web `light-api.test.ts`, `light-view.test.tsx`, `LightPage.test.tsx`, and the browser test `e2e/tests/light.spec.ts` ("US-LIC-01 derives the zone from lux need and default level and explains the result", one case each for plain, soft-leaf and top zone).
- ⚠️ The browser test covers three input combinations; the by-hand run below adds the boundary cases (stay at the default level, two steps up, never cutting light) and the link to the catalog species.

## 1. Criterion: cutting light is never the target for adults

**Expected:** with only the cutting-light zone (or none) there is no adult zone: the result is "unbekannt" and says what to do next (P-08, P-09).

**Observed:**

- ✅ New account without any zone, need 10,000 lux, level 2: "Lichtzone: unbekannt" with the text "Du hast keine Zone für erwachsene Pflanzen. Lege eine zweite Lichtzone an (die erste ist Stecklingslicht)." (`01-no-zones-unknown-*.png`).
- ✅ With the four default zones, need 500 lux, level 2: "Lichtzone: Lampe 2", never "Lampe 1" (check 2h in `observation.json`).
- ✅ In all eight derivations of section 2 the result is never "Lampe 1".

## 2. Criteria: the assignment follows the lux demand (80 % / 30 % rule, soft leaf)

**Expected** (computed by hand; ceiling of the current level ×0.8 must be reached, and the demand must not be more than 30 % below the ceiling of the next level, otherwise the species stays):

| Input (lux need, default level, soft leaf) | Expected zone | Why | Observed |
|---|---|---|---|
| 10,000, 2, no | Lampe 2 | 80 % of 15,000 = 12,000 not reached | ✅ Lampe 2, "Die Art bleibt bei ihrer Standard-Stufe …" |
| 14,000, 2, no | Lampe 2 | 12,000 reached, but 14,000 is far below 70 % of 100,000 | ✅ Lampe 2, same text |
| 75,000, 2, no | Lampe 3 | reaches Lampe 3 (≥ 70,000), but not 80 % of 100,000 for Lampe 4 | ✅ Lampe 3, "Die nächste Zone wäre mehr Licht als die Art braucht … Sie bleibt hier." (`02-derivation-promoted-one-step-*.png`) |
| 80,000, 2, no | Lampe 4 | reaches 80 % of 100,000 and ≥ 70 % of 110,000 | ✅ Lampe 4, "Der Lux-Bedarf erreicht mindestens 80 % der Lux-Decke der Stufe darunter …" |
| 80,000, 2, **soft leaf** | Lampe 2 | C3 plants with soft leaves are not moved up automatically | ✅ Lampe 2, "Weichblättrige C3-Pflanzen werden nicht automatisch in eine stärkere Zone eingestuft …" (`03-derivation-soft-leaf-*.png`) |
| 20,000, 3, no | Lampe 3 | stays at the default level, 20,000 is far below 70 % of 110,000 | ✅ Lampe 3, "… bleibt bei ihrer Standard-Stufe …" |
| 100,000, 4, no | Lampe 4 | highest zone of the account | ✅ Lampe 4, "Das ist die höchste Zone deines Kontos." (`04-derivation-top-zone-*.png`) |
| 500, 2, no | Lampe 2 | cutting light is never the target | ✅ Lampe 2 |

- ⚠️ **Wording, not a defect:** for 75,000 lux the species is moved from the default level 2 up to Lampe 3, but the reason text only explains why it does not go higher ("Sie bleibt hier"). It does not say why it moved up. The result is correct; the explanation could name both steps. Observation only.
- ✅ Dark scheme (OS preference `dark`, desktop): the form and the result are readable (`07-derivation-dark-desktop.png`). Only looked at, no axe run in dark.
- ✅ Input limits: the browser rejects 0 and 200,001 lux (`checkValidity()` false), no request is sent. The server-side limit (`input.invalid`) is covered by the core and API tests, not by hand.

## 3. Criterion: the account's zone is derived from the species in the catalog (FR-BES-10)

**Expected:** a species proposed with default level 2 and lux demand 75,000 is placed in Lampe 3 for this account; a specimen without a location counts there.

**Observed:**

- ✅ Species "Lithops lesliei" proposed through the form (level 2, 75,000 lux), specimen created without a location: the distribution shows "Lampe 2: 0 Exemplare · dünnste Zone", "Lampe 3: 1 Exemplar", "Lampe 4: 0 Exemplare · dünnste Zone" (`05-species-counted-in-derived-zone-*.png`). That matches the table row for 75,000 lux. The display itself belongs to US-LIC-02 (`Docs/test-logs/lic-02.md`).
- ⏭️ The override of the zone in the care profile (US-BES-09) does not exist yet.
- ⏭️ Live change after editing a zone's lux ceiling (derivation follows the zones of the account) was not run by hand; it is covered in `core` by `derive.test.ts`.
- ⏭️ A species without a known lux demand ("unbekannt", FR-LIC-03): the species form requires the lux demand, so the state cannot be created through the UI; covered by the core test.

## 4. Tenant isolation (P-04, P-05)

- ✅ Second account Ben (no zones of his own) enters the same input (75,000 lux, level 2) in the same view: "Lichtzone: unbekannt". The derivation uses the zones of the signed-in account, not Anna's (`06-other-account-unknown-*.png`).
- ⏭️ No new table in this story, so no new generic tenant test; the API test for the route has its own two-account case.

## 5. Layout and accessibility (rough)

- ✅ Mobile 375 px: no horizontal scrolling (`scrollWidth` 375 in all six measured states); every button, select and text input is at least 48 px high (`small48` = 0).
- ⚠️ axe (WCAG 2.1 AA): one `color-contrast` violation (serious) on the element `footer`: the text "Version …" has a contrast of 4.01 (foreground #727c73 on #f4f7f2, 12 px; 4.5:1 expected). It appears in all three states checked with axe (empty, promoted, species counted), desktop and mobile. Known as issue #249 and not part of this protocol.
- ⚠️ **Layout finding on the form "Zone ermitteln":** the checkbox "Sonnenliebende C3-Pflanze mit weichem Blatt" is drawn much larger than the text (estimated from the screenshots, not measured: about 50 px at 375 px width, about 70 px on desktop) and, on mobile, centered above its label instead of next to it; on desktop it sits above its label in the left column with the result in the right column (`03-derivation-soft-leaf-mobile.png`, `07-derivation-dark-desktop.png`). It works and is keyboard-reachable, but looks unfinished. New issue, see "Open".
- ⏭️ Keyboard operation of the form was not checked by hand (the checkbox and the button are standard controls).
- ⏭️ axe in the dark scheme was not run.

## 6. Open

- Follow-up issue for the oversized checkbox (see 5); footer contrast stays with #249.
- Wording of the reason for a species that is moved up (see 2): optional improvement.
- The override in the care profile (US-BES-09) and the specimen's own light zone are not built; the spec status of US-LIC-01 stays 🟨 for that reason, this protocol changes nothing about the status.
- The browser test could get the stay-at-default and two-step cases of this protocol; they are cheap to automate.
