# Test log: US-WUN-01 See candidates prioritized by space need (issue #84)

**Branch:** `feat/wun-01-kandidaten-nach-platzbedarf` (PR #276). The story was started by a previous session (core, database, API; red runs `red-core.txt`, `red-db.txt`, `red-api.txt` were committed by that session) and taken over to the end by owner decision; the web part, the migration renumbering (0016 to 0019 after merging `origin/dev`) and this log are from the second session.
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54931, database `wun01` for the manual run), API port 55931 (started with that database URL), web (Vite) port 56931, own throwaway Keycloak 26.8 (port 18931; realm import from `app/dev/keycloak` with the redirect address changed to the web port and e-mail verification switched off; none of this is in the repo); Chromium (headless) via Playwright (Europe/Berlin, de-DE); date 2026-10-04. The shared database (54329) and shared Keycloak (18081) were not touched.
**Method:** red tests first for every layer (`red-core.txt`, `red-db.txt`, `red-api.txt` from the first session, `red-web.txt` with exit code 1 from this session), implementation, `make ci`, then a Playwright script (not checked in) against the real stack: two accounts created through the Keycloak admin API, real login in the browser, light zones through the API, three species inserted by SQL into the own database and three specimens through the API (zones end up as Lampe 2: 2, Lampe 3: 1, Lampe 4: 0 plants), wishes entered through the form, views at 1440x900 and 375x812, axe-core 4 (WCAG 2 A/AA, 2.1 A/AA). Screenshots, axe results, raw observations (`observation.json`) and the script output (`run-output.txt`) are in `wun-01/`.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ⚠️ Red runs: the first session saved `red-core.txt`, `red-db.txt` and `red-api.txt` (all tests failing, runs at 10:19, 10:21 and 10:23), but each file was committed together with its implementation (same commit), not before it, and the files carry no exit code line. This cannot be verified further from the history. This session saved `red-web.txt` with exit code 1 (module missing) before writing the web code. The App test for the new tab and the two tests for the corrected hint text were added after the code and were not run red.
- ✅ `make ci` exit code 0 on the final head; the exact commit and result are in the PR Handoff (every later commit needs a new run).
- ✅ Round 2 (review): red runs with exit code 1 saved before the changes in `red-web-round2.txt` (10 failing), `red-core-round2.txt` (3 failing) and `red-db-round2.txt` (1 failing, own database on 54931).
- ⏭️ `make e2e` and Lighthouse were not run locally; CI covers them.

## 1. Criterion: open candidates sorted ascending by the stock of the target zone, unknown zone last

- ✅ Order seen in the browser: Lampe 3 (1 plant), Lampe 2 (2 plants), then the two wishes without zone (`served-order`, `sorted-ascending: true`, `unknown-last: true`). Archived specimens are not part of the stock (shared count with the light distribution, covered by API tests, not by hand).
- ⚠️ Stock differences in this run come from the species' standard light level; no manual archiving was done.
- ✅ Each card says why it stands there ("Hier steht schon 1 Pflanze. Mehr Platz ist in Lampe 4 (0 Pflanzen)."); a wish without zone says it does not count yet.
- ✅ The list says what to do next (box above the cards).

## 2. Criterion: per candidate photo with source, German (name), zone with stock, difficulty, reasoning, actions

- ✅ Title "Geigenfeige (Ficus lyrata)", "Lampe 3 — 1 Pflanze", "Schwierigkeit: Schwer", reasoning text (`02-candidates-*.png`).
- ✅ Missing values read "unbekannt" / "Ziel-Zone unbekannt" / "Kein Bild" (P-08).
- ✅ Privacy decision (P-05): the picture is **not loaded**. The address was typed by a keeper; an `<img>` would make every viewer's browser contact a third-party host (IP address, user agent, referrer), and the epic wants images saved locally. The card shows a link "Bild ansehen (öffnet extern)" (`target=_blank`, `rel="noopener noreferrer"`, `referrerpolicy="no-referrer"`) with "Quelle: Wikimedia Commons" next to it. Observed in the real browser: 0 `img` elements in the list and no request to the picture host (`external-image-requests: []`, `picture-link` in `observation.json`; `02-candidates-*.png` show the link). The part "photo" of the criterion is therefore missing until local storage (US-WUN-04), marked in the spec as 🟨.
- ✅ A wish whose zone is outside zones 2 to 4 (cutting light "Lampe 1") is listed last with "Ziel-Zone liegt außerhalb der Zonen 2 bis 4" and "zählt … noch nicht mit", not as "unbekannt" (FR-WUN-03); the hint list for these wishes does not exist yet.
- ❌ Not implemented (spec 🟨): the per-candidate actions (bought, discarded) belong to US-WUN-03 and US-WUN-05; saving images locally belongs to US-WUN-04.

## 3. Criterion: no open candidates

- ✅ A new account sees "Keine offenen Kandidaten in der Wunschliste." and "Erfasse einen Wunsch mit Ziel-Lichtzone." (`01-empty-*.png`, `04-other-account-desktop.png`).

## 4. Recording a wish (needed to get candidates at all)

- ✅ Wishes saved through the form; confirmation "Wunsch „…“ gespeichert." and the list reloads.
- ✅ Duplicate name in another letter case is refused with the German text from `ERROR_TEXTS` (`wish.name_taken`) and no success message.
- ✅ Errors per field: the offending field gets `aria-invalid` with a visible red border, `aria-describedby` points at the error text under it, the focus moves to the first invalid field, typed values stay (`05-field-error-name-*.png`; both form-refusal and field-error scenarios shown in `03-form-refusal-*.png`). Checked with the keyboard only: Enter in the empty name field leaves the focus on "Name" with "Bitte gib einen Namen an." (`kb-empty-name`); an address with credentials marks "Bild-Adresse" (`kb-credentials`); an address without source moves the focus to "Bildquelle" and keeps name and address (`kb-no-source`). The server refusal "name taken" marks and focuses the name field (`duplicate-field`).
- ⚠️ A refusal that names no field stays in an alert (covered by a unit test; not provoked in the browser).
- ✅ Keyboard: typing a name and pressing Tab seven times reaches "Wunsch speichern"; Enter saves (`tabs-from-name-to-save-button: 7`).
- ⚠️ Limits (name 120, reasoning 500 characters and others) are assumptions (starting values), not sourced.

## 5. Tenant isolation and zone use

- ✅ A second account sees no wishes (`B-candidates: 0`); sending a wish with the first account's zone id answers 404 `light_zone.not_found` (looks like an unknown zone).
- ✅ Deleting a zone a wish points to is refused with 409 `light_zone.in_use`, naming the wish (P-10).
- Automated: two-account tests at database, core and API level (`wishes.test.ts`, `create.test.ts`, `candidates.test.ts`, `wishlist.test.ts`).
- ✅ Image addresses with credentials (`user:password@`) are refused in core, by the database check and in the form.

## 6. Layout and accessibility

- ✅ axe-core: 0 violations on empty list, filled list and refusal state, desktop and mobile.
- ✅ No horizontal scroll at 375x812 (`hscroll-*: false`).
- ⏭️ Tap target sizes were not measured by script; inputs and buttons use the shared 48 px minimum height from `light.css`.
- ⏭️ Screen reader behaviour and dark mode were not checked.

## Open points

- Actions bought/discarded (US-WUN-03, US-WUN-05), displaying the picture through local image storage (US-WUN-04), species link, specimen link and discover source of the wish (DM-WUN-01).
- The wish table has no species column yet, so the catalog merge (US-BES-10, `SpeciesRepointer`) has nothing to re-point for wishes; this must be added together with the species link.
