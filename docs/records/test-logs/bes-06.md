# Test log: US-BES-06 See specimens as cards (issue #62)

**Branch:** `feat/bes-06-karten` (from `origin/dev`, after the merge of PHA-01 and the QG thresholds)
**Environment:** WSL2/Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54777 from `worktree-env.mjs`), API port 55277, web (Vite) port 55777, Keycloak 26.8 with the realm import from the repo in its own throwaway container on port 18781 (the shared sign-in service on 18081 belongs to another session and was not touched). The realm is a copy with an adapted redirect address and two pre-confirmed test accounts (`mara-bes6`, `ben-bes6`); it lives outside the repo. Chromium via Playwright (time zone Europe/Berlin); date 2026-10-03.
**Method:** tests first (red runs in `bes-06/red-*.txt`), then implementation, `make ci`, then manual operation (Playwright script, not checked in) against the real Keycloak. The sample data (zone, locations, species, specimens) were created through the API with the token of the accounts. Screenshots desktop 1440×900 and mobile 375×812 in `bes-06/`, raw measurements in `bes-06/observation-without.json` and `observation-demo.json` (raw data, German keys as recorded). Containers and servers were removed afterwards.

**Important:** measurements, photos and treatments do not exist in the product yet (WAC, BEH). The script therefore fed them in a second run with **demo ports** (only for this check, not in the repo) to see the presentation. The first run without ports is the real state today.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Red runs and gates

- ✅ `red-core.txt`: 18 of 18 new core tests red (skeleton without behavior).
- ✅ `red-api.txt`: 8 of 9 API tests red (the route was missing; the test for 401 happened to run green because `/specimens/cards` was already protected as `/specimens/:id`).
- ⚠️ `red-web.txt`: 18 of 18 red with a skeleton for `loadCards` and the old list.
- ✅ `make ci` exit code 0 (lint, types, boundaries, baseline, knip, spec, principles and skill check, duplicates, format, docs, tests with coverage thresholds, CRAP, build).
- ⚠️ The web coverage of `dev` was below the new thresholds (`CarePhasesPage` without a DOM test). A small DOM test was added so that this PR is green.

## 1. Criterion: card with photo/placeholder, name, species, light zone, status, location, last measurement

**Observed (run without ports, `02-cards-without-ports-*.png`):**

- ✅ Four specimens as cards. Name, "Art:", "Lichtzone:", "Status: Pflanze", "Standort:" appear. "Regal Süd" shows "Lichtzone: Zone 3".
- ✅ A location without zone ("Kiste ohne Zone") and specimens without location show "Lichtzone: unbekannt" and "Standort: unbekannt", nothing invented (P-08).
- ✅ Without a measurement it says "noch keine Messung", the photo is a placeholder "Noch kein Foto" (with text, not just an image).
- ✅ Empty state (`01-collection-empty-*.png`): "Du hast noch kein Exemplar. Wähle zuerst eine Art aus dem Katalog." with the button "Art wählen" (P-09).
- ⚠️ **Limit:** photo, measurement and treatment are empty in the real product until `care` (WAC, BEH) implements the ports.

## 2. Criterion: measurement, photo, open treatment (with demo ports, `03-cards-with-demo-ports-*.png`)

- ✅ "Letzte Messung: Gesund am 01.10.2026"; photo of the measurement as an image.
- ✅ Etiolated/thin: "Vergeilt/dünn" with a warning background and the hint "kein Erfolgssignal, auch bei Wachstum" (no green success sign).
- ✅ Treatment: "Neem spritzen · überfällig seit 2 Tg. · +2 weitere" (the earliest of three); "Mehr Licht geben · heute fällig". Overdue items are bold and underlined, not only marked by color.
- ✅ The due-date calculation and "+N weitere" are covered in the core with tests across month, year and leap-year boundaries; in New York the same time yields "heute fällig" instead of "überfällig" (API test).

## 3. Criterion: note collapsible, photo large

- ✅ "Notiz der Messung" is a `<details>`, closed at first; a click opens it (`04-note-open-mobile.png`, `notizOffen: true`).
- ⚠️ "Click on the photo opens it large" is a link to the image address in a new tab (`target=_blank`, `rel=noopener noreferrer`), no lightbox. The photo itself only comes with WAC (media addresses); the link was checked with the demo image, not the retrieval of a real photo.

## 4. Criterion: grid

- ✅ Mobile 375 px: one column, no horizontal scrolling (`scrollBreite` = 375). Desktop 1440 px: two columns (the content frame of the app is narrow; more columns would appear with a wider frame).
- ⚠️ The requirement "one to two columns on the phone" is met with one column at 375 px; two columns only from about 560 px frame width. That is an assumption (minimum width 16 rem per card), not a measured value.

## 5. Tenant isolation

- ✅ Core test and API test with two accounts: cards only of the own specimens, the ports never learn foreign IDs.
- ✅ By hand: Ben first sees the empty state, after creating only "Bens Ficus" (`05-…`, `06-…`); Mara's answer contains nothing of "Bens" (`maraSiehtBens: false`), Mara's names are missing for Ben.

## 6. Accessibility (rough)

- ✅ Focus: the photo link can be reached with Tab; focus ring 3 px solid (`04b-focus-photo-desktop.png`).
- ✅ Touch targets: the script measured all buttons, links, summaries and fields, none below 44 px height (`kleineZiele: []`); `summary` has a 44 px minimum height.
- ✅ axe (light and dark, page with demo cards): no violations in the cards. A first run found the heading order (h1 → h3); fixed, card names are now h2.
- ⚠️ axe reports in the **light** scheme a contrast violation of the footer "Version …" (4.01 : 1, text `#727c73`); it does not belong to this ticket and was not changed. No violations in the dark scheme (`07-dark-desktop.png`).
- ⏭️ Screen reader not checked. Dark scheme only via axe and screenshot, not every state variant.

## Open points

- Photo, last measurement and treatment only become visible when WAC (`MeasurementSource`) and BEH (`TreatmentSource`) implement the ports.
- Light zone = zone of the location; the override on the specimen (cutting) comes with BES-04.
- Archived specimens are not yet hidden (BES-07).
- Footer contrast of the app (separate finding).
