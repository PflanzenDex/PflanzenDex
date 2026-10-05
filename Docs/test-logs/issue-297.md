# Test log: issue #297 UX and logic follow-ups (US-POK-08, US-POK-09, US-WUN-01, US-ACC-02, US-ACC-03, US-BES-10)

**Branch:** `feat/issue-297-ux-and-logic-follow` (PR #299).
**Environment:** Linux, Node 24, Docker; PostgreSQL 16 in its own container (port 54723; database `pflanzendex_test` for the test suites, database `manual297` for the manual run), API port 55223 (started with `DATABASE_URL` pointing at `manual297` on 54723), web (Vite) port 55723, own throwaway Keycloak 26.8 (container `pflanzendex-kc-297`, port 18297; realm import from `app/dev/keycloak` with the redirect addresses changed to the web port and e-mail verification and SMTP switched off; none of this is in the repo); Chromium (headless) via Playwright (Europe/Berlin, de-DE); date 2026-10-05. The shared database (54329) and the shared Keycloak (18081) were not touched.
**Method:** red tests first for every changed behavior (`issue-297/red-*.txt`, each ends with `exit code: 1`), implementation, `make ci`, then a Playwright script (not checked in) against the real stack at 1440x900 (`-desktop`) and 375x812 (`-mobil`): a user is created through the Keycloak admin API, real login in the browser, 14 specimens of 14 species in 4 families plus one species without family are created through the API with the token of the browser session, axe-core 4 (WCAG 2 A/AA, 2.1 A/AA) on each state. Screenshots, axe results and raw observations (`observation-desktop.json`, `observation-mobil.json`) are in `issue-297/`.

Legend: ✅ as expected · ⚠️ works, but with a finding · ❌ error · ⏭️ not checked

---

## 0. Gates and tests

- ✅ Red runs saved with exit code 1 before the implementation: `red-web-pokedex.txt` (5 failing), `red-web-app.txt` (1), `red-web-wishlist.txt` (1), `red-web-invalid.txt` (1), `red-web-start.txt` (12, partly collateral because the fake server no longer serves the card list), `red-core-ownership.txt` (1), `red-core-wishlist.txt` (1 failing test plus one test file that cannot import the missing `name-key` module), `red-core-merge.txt` (1), `red-db-wishlist.txt` (migration test and wishes test, run with the migration file moved away), `red-db-review.txt` (1), `red-db-specimens-count.txt` (1), `red-api-count.txt` (1).
- ⚠️ Not run red: the test that replaced the vacuous API isolation test (it only strengthens an assertion and passed at once), the API test for names that differ in diacritics (core and database tests of the same behavior ran red).
- ✅ `make ci` exit code 0 on the commit before the test log (output of the run is in the PR Handoff).
- ⏭️ `make e2e` and Lighthouse were not run locally; CI covers them.

## 1. US-POK-08: collapsed groups and scroll position survive the detail view

- ✅ Sorted by "Familie", the group "Cactaceae" was collapsed, the card "Monstera deliciosa" opened, then the browser Back button used: the group is still collapsed (`cactaceae-expanded-after-back: "false"`), the scroll position is the one from before opening (desktop 400 to 400, mobile 834 to 834). The same with the button "Schließen" (desktop 400 to 400, mobile 865 to 865).
- ✅ The group of species without a known family reads "Ohne bekannte Familie · 1 Art" (`group-headers`, `03-pokedex-groups-*.png`); other groups keep "n / unbekannt" (the family total needs the taxonomy build, US-POK-03).
- Automated: `PokedexBrowse.test.tsx` (group state, scroll, header), `ownership.test.ts` in core (deterministic cultivar card) and API (isolation with an own specimen of account B).

## 2. US-POK-09: Back closes the detail, tap marker, profile reset

- ✅ Opening the detail pushes a history entry (`history-state-open: {"pokedexDetail":true}`); the browser Back button closes the detail and stays on the Pokédex page (URL unchanged, `detail-closed-after-back: true`). The "Schließen" button and Escape take the same entry back through `history.back()`.
- ⚠️ `history.length` grows by one per opening (`history-length-delta: 1`): the browser never shortens the list when going back, only the current position moves. Going back twice leaves the app's page, as before. When the detail is left through "Zum Artprofil", the pushed entry stays behind (Back then does nothing visible once); accepted, noted in the code comments.
- ✅ Every card shows a chevron "›" (14 of 14 cards, visible, `aria-hidden`), plus a border on hover and focus (`03-pokedex-groups-*.png`, `04-pokedex-detail-*.png`). The hover state itself was not checked in the real browser (⏭️).
- Automated: `PokedexDetail.test.tsx`; `App.test.tsx` covers the reset of the profile id (the way Pokédex, species profile, collection, "Zurück zur Art" ends on the catalog search).

## 3. US-WUN-01: server error clears on input, names unique after folding

- ✅ After the wish "Café Test" was saved, "Cafe Test" is refused with the German text of `wish.name_taken` (`wish-name-error-text`), the name field is marked (`aria-invalid="true"`, red border plus inset ring, text under the field, `06-wish-name-taken-*.png`).
- ✅ Typing one more character into the name field removes the mark and the text at once (`error-cleared-on-input: ["false", 0]`), the focus stays in the field (`focus-stays-on-name: "wish-name"`, `07-wish-error-cleared-*.png`). Automated: editing another field keeps the refusal of the name visible.
- ✅ Database: migration `0020_wishlist_wish_name_key.sql` adds the nullable column `name_key` and the unique index `wish_name_key (account_id, name_key)`; the key is computed in core (`wishNameKey`: NFD, combining marks removed, lower case). Tested on a scratch database migrated to 0019, filled with colliding wishes ("Café", "Cafe" of one account), then migrated to 0020: the migration applies, nothing is deleted, the older wish gets the key, the newer colliding one keeps its name and gets no key (exempt, reported as a `WARNING` naming the wish ids), a second run applies nothing, the previous app version can still insert without a key. Names that differ only in "ß"/"ss" stay different on purpose.
- ⚠️ Existing duplicates after folding are reported, not merged or renamed; an operator has to ask the owner. Not checked against real production data (⏭️).

## 4. US-ACC-02: marked field does not move the layout

- ✅ The rule `[aria-invalid="true"]` now only changes the border colour and adds an inset ring (`box-shadow: inset 0 0 0 1px`), no border width. Heights before and after marking are identical: wish name field 48 px to 48 px, Anzeigename 58.2 px to 58.2 px on desktop and 48 px to 48 px on mobile (`name-input-height-before-invalid-after`, `displayname-box-before-after`); no horizontal scroll on mobile (`horizontal-scroll: false`). Automated: `invalid-field-style.test.ts` pins the rule.
- ⚠️ The shift of about 2 px named in the issue could not be reproduced in the fields I measured, even with the old rule injected (search field 48 px, 48 px, 48 px: the minimum height of 48 px absorbs it); I could not name a field where the old rule moved the layout, so the improvement is verified as "no change in size", not as "fixed a visible jump".
- ⏭️ `PUT /account/profile` with `displayName: null` is **not** changed: see "Open points".

## 5. US-ACC-03: cheap count and heading hierarchy

- ✅ The start page asks `GET /specimens/count` (answered `{"count":14}`), and no request to `/specimens/cards` is made from it (`start-page-requests: ["/specimens/count", "/specimens/count"]`, also asserted in `start-page.test.tsx`). The route counts active specimens in the database (one `count(*)`, row rules apply); API test with two accounts, database test.
- ✅ The guide (wizard) and the overview both have exactly one `h1` "Start" (`wizard-h1`, `overview-h1`); the steps ("Wo stehen deine Pflanzen?") are `h2` (`01-start-guide-*.png`, `02-start-overview-*.png`).

## 6. US-BES-10: own error code for a failed merge lock

- Automated only (no flow in the UI to reach it): core test with a store whose lock fails answers `review.merge_lock_failed` and leaves the case open; database test: a case whose species row cannot be locked answers `lock_failed` and stays `proposal`; the text is in `ERROR_TEXTS`, the HTTP status 409 in `error-http.ts`. ⏭️ Not provoked in the browser.

## 7. Accessibility

- ✅ axe-core (WCAG 2 A/AA, 2.1 A/AA): 0 violations on all eight states at both sizes (`axe-*.json`): start guide, start overview, Pokédex groups, Pokédex detail, wish name taken, settings with a marked field.
- ⏭️ The screenshot after Back (`05-pokedex-after-back-*.png`) was not run through axe separately (same page as `03`).

## Open points

- Needs decision, not changed: `PUT /account/profile` still accepts `displayName: null` (reset to "not chosen"). The settings form sends `null` for an account that never chose a name, so refusing it would make "save the time zone" impossible until a name is typed; the AC of US-ACC-02 say neither that a name is required nor that it may be reset. Product decision needed (required name, or `null` only meaning "unchanged").
- The scroll position is restored by the app; the browser's own scroll restoration is not relied upon.
- Environment: the Keycloak realm for this run differs from the repo only in redirect addresses and mail settings.
