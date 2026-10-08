# Test log: US-QS-14 Redesign, manual test protocol (issue #601)

**Branch:** `chore/qs-14-redesign-manual-test-protocol` (draft PR #602), based on `dev` at `b6c0a1e`
**Environment:** Linux (CachyOS, kernel 7.2), Node 24.21.0, Docker; browser Chromium 1243 (headless, Playwright 1.63), locale `de-DE`; date 2026-10-08. The real stack ran, so no Storybook stand-in was needed:

- web (Vite dev server) on **port 5173** and not on the worktree's own port 55545: the Keycloak realm only allows the redirect address `http://localhost:5173/*`, and the Keycloak of this machine belongs to another stack that this session must not change (an attempt to add the address at runtime was refused). No other process used 5173 during the test.
- API on its own port **55045** (`VITE_API_URL=http://localhost:55045`, `WEB_ORIGIN=http://localhost:5173`).
- PostgreSQL 16: the worktree's container (port 54545), with a separate database `pflanzendex_manual` (migrations 0001 to 0033), so the `make ci` database was not touched.
- Keycloak 26.8 (port 18081) and Mailpit (port 18025) were already running (started by `make auth-up` from another worktree); this test only used them.

**Data and runtime changes that are not in the repo** (all in the scratch database or in the test accounts):

- Two test accounts were created through the real registration form ("Konto anlegen", email confirmation link from Mailpit, password): "Mara Testperson" (main account) and "Jonas Testperson" (friend). Friendship made through the API (code, request, accept).
- The shared catalog was seeded with SQL: 45 approved species ("Calathea trifasciata", "Calathea trifasciata f14", ...; many share a genus, so the names are repetitive) and 45 matching taxa for the discover and Pokédex views. For this, the triggers `species_guard` and `review_case_guard` were disabled in `pflanzendex_manual` only.
- Via the API (as Mara): default light zones "Lampe 1" to "Lampe 4", locations "Fensterbank" (no light zone), "Wachstumsregal" (Lampe 3), "Balkon" (Lampe 4, outdoor), six specimens, three wishes, two treatment plans (one overdue, one due today).
- Jonas received the role `reviewer` in the scratch database to see the role-only entry "Prüfliste".

**Method:** `make ci` first (section 0), then the real app driven with Playwright scripts (not part of the repo) at 320, 360 and 1280 px, light and dark (`colorScheme`), with `reducedMotion: reduce` as the default and `no-preference` for the comparison, signed in against the real Keycloak. Measurements come from the browser (`getComputedStyle`, `getBoundingClientRect`, `document.getAnimations()`, `elementFromPoint`). Screenshots are 360×800 ("mobil") and 1280×800 ("desktop") instead of the 375×812 and 1440×900 of the skill, as the issue asks for 360 and 1280; 30 PNGs, reduced to 128 colours, in `us-qs-14/`. The app UI is German; quoted UI texts are verbatim.

Legend: ✅ wie erwartet · ⚠️ funktioniert, aber Auffälligkeit · ❌ error · ⏭️ nicht geprüft

Summary: 29 ✅, 10 ⚠️, 1 ❌, 6 ⏭️ (items counted in sections 0 to 7). The ❌ and four of the ⚠️ became issues #604 to #608 (see "Offene Punkte"); none was trivial, so this PR fixes nothing in the app.

---

## 0. Gates

**Expected:** `make ci` green.

**Observed:**

- ✅ `make ci` exit code 0 on this branch with the final diff (changelog entry, protocol, screenshots): 41 API, 90 database, 27 core and 146 web test files passed, layout gate OK.
- ⚠️ The run before it (same diff) failed once in `US-ENT-01 suggests a species with reasons ...` (`app/packages/api/src/discover/discover.test.ts`): the shared test database held a foreign taxon ("Taxonusdadaceff jobbi") from another test, which crowded the ten-card deck. The rerun was green; the flake is not caused by this change (it touches no code). Not filed.

## 1. Criterion: pages in light and dark at 360 px and 1280 px

**Expected:** "Heute", "Sammlung" (views "Pflanzen", "Arten", "Wunschliste"), "Entdecken" (modes "Vorschläge", "Katalog"), "Freunde" and "Konto" show their content, one main heading each, in light and dark, with the calm look.

**Observed:**

- ✅ All eight pages render with data at 360 and 1280 px (`01-*` to `08-*`): "Heute" with the cards "Überfällig", "Heute fällig", "Angaben fehlen"; "Sammlung" with the distribution over the light zones and the specimen cards; "Arten" with the Pokédex rank; "Wunschliste" with "Nachschub nötig" and "Als Nächstes dran"; "Entdecken" with "Vorschlag 1 von 10" and its reasons; "Katalog" with search and entries; "Freunde" with the friend list; "Konto" with "Hallo, Mara Testperson".
- ✅ Every page has exactly one `h1` ("Heute", "Sammlung", "Entdecken", "Freunde", "Konto") and the document title "<name> – PflanzenDéx" (measured on all 48 combinations of page, width and scheme).
- ✅ Dark mode follows the system setting (`prefers-color-scheme: dark`): background `rgb(15, 22, 18)`, text `rgb(230, 239, 233)` (`09-*` to `11-*`). Light and dark show the same layout.
- ✅ Unknown values read "unbekannt" (P-08): "Deutscher Name unbekannt", "Luftfeuchte unbekannt", "Lichtzone: unbekannt" on the specimen of the location without a zone.
- ⚠️ Before the taxa were seeded, "Vorschläge" said "Keine neuen Vorschläge: Der Katalog hat noch keine Arten." although the catalog held 45 species (the suggestions need the taxon tree of the background job). The text is only misleading in that state; it still names a next action ("Art vorschlagen"). Not filed.
- ⚠️ The wishlist hint "Nachschub nötig: Lampe 2 (0 offene Kandidaten) ..." is drawn with a red border like an error, although it is advice (`04-sammlung-wunschliste-*.png`). A judgment call for the design owner. Not filed.
- ⚠️ "Freunde": the lines of a friend row run together ("befreundet seit 08.10.2026Gemeinsame Arten: unbekannt ...") and the buttons "Sammlung ansehen" and "Freundschaft beenden" touch each other (`07-freunde-*.png`). Cause and fix: #605.
- ⚠️ "Freunde" is the only destination whose title and sections sit in one large card; the others show the title above the content (`07-freunde-*.png`). #608.
- ⏭️ Contrast of every colour pair was not measured here; the token pairs are covered by the gates (QG-U5, QG-U9 and `style-contrast.test.ts`), not by this run. Axe on the real pages was not run.
- ⏭️ Dark mode was shot for three pages only (`09-*`, `10-*`, `11-*`); for all eight pages the dark runs include the measurements of section 3 (overflow, tap targets, weights) but no screenshot, and the keyboard walk of section 5 ran in light mode only.

## 2. Criterion: navigation bar with the five destinations

**Expected:** from 360 px a bottom bar with at most five items, from 768 px a rail, from 1280 px a labelled sidebar, all from one list: "Heute", "Sammlung", "Entdecken", "Freunde", "Konto"; the role-only "Prüfliste" and "Betreiber" stay separate.

**Observed:**

- ✅ 360 px: `nav "Navigation unten"`, 360×59 px at the bottom, items "Heute", "Sammlung", "Entdecken", "Freunde", "Konto" (five). Same list on every page, current page highlighted (`01-*-mobil.png`).
- ✅ 768 and 1024 px: `nav "Navigation seitlich"`, a rail 80 px wide; the bottom bar is hidden.
- ✅ 1280 px: `nav "Hauptnavigation"`, a sidebar 248 px wide with the brand and the same five labelled items; "Konto" is set off by a rule below the other four (`01-*-desktop.png`). On "Konto" the list "Abschnitte von Konto" (200 px) sits beside the sections, hidden below 1280 px.
- ✅ An account without a role sees neither "Prüfliste" nor "Betreiber".
- ✅ Reviewer on desktop: "Prüfliste" follows "Konto" as a separate entry (`21-nav-reviewer-desktop.png`).
- ⚠️ Reviewer on a phone: the bar shows "Heute", "Sammlung", "Entdecken", "Freunde", "Mehr", and "Konto" moves into the drawer "Mehr" together with "Prüfliste" (`21-nav-reviewer-mobil.png`, `20-mehr-drawer-reviewer-mobil.png`). That follows the five-slot rule of DS-25, but "Konto" is no longer one tap away. Decision needed: #607.
- ✅ The drawer "Mehr" opens by keyboard, Escape closes it and the focus returns to "Mehr".
- ⏭️ `aria-current` of the active item was not read; only the visual state was checked.

## 3. Criterion: no horizontal scroll, tap targets, semibold button labels

**Expected:** no horizontal scroll at 320 and 360 px (and 1280 px); tap targets at least 44 px (the skill says 48 px; 44 px is the criterion of the story); button labels semibold (600).

**Observed:**

- ✅ No horizontal scroll: `scrollWidth - clientWidth` is 0 on all eight pages at 320, 360 and 1280 px, in light and dark (48 measurements).
- ✅ Tap targets: every visible link, button, input, select and textarea is at least 44 px high and wide on all pages and widths, with three exceptions that are fine: the skip link "Zum Inhalt springen" (1×1 px until focused, by design), links inside running text (excluded), and the 20×20 px checkboxes on "Freunde" and "Konto", whose label row is 44 to 48 px high and takes the tap ("Nur neue Arten" 142×44, "<Art>: mit Freunden teilen" 268×48).
- ✅ The mode switch "Pflanzen | Arten | Wunschliste" is 86 to 113 px wide and 44 px high; the toast's "Meldung schließen" is 44×44.
- ✅ Button labels are semibold: the computed `font-weight` of every `button` on the eight pages is 600 (13 on "Heute", 32 on "Pflanzen", 10 on "Arten", 10 on "Wunschliste", 2 on "Vorschläge", 4 on "Katalog", 15 on "Freunde", 3 on "Konto"), with the two exceptions below.
- ⚠️ Two buttons are not 600: the selected filter chip "Alle" on "Arten" is 700, and the 20 entries of the catalog are buttons that hold the species name (weight 400, 83 px high, they are data, not captions). Probably intended, not filed.

## 4. Criterion: Toast, Banner, PlantLoader, Card, Avatar

**Expected:** the new components behave as designed, in the real app.

**Observed:**

- ✅ Toast: saving the location "Fensterbank" ("Standort ändern", "Lichtzone zuweisen", "Speichern") shows "Standort gespeichert." (`12-toast-mobil.png`). It sits above the bottom bar at 360 px (y 654 to 716, bar at 741) and bottom right at 1280 px, in a polite live region, has the close button "Meldung schließen" (44×44) and disappears by itself within 7 s. Escape does not dismiss it (it needs no key: it closes itself and has a button).
- ✅ Banner, offline: with the browser set offline (Playwright `setOffline(true)`, the same switch as DevTools "Offline") "Heute" shows the banner "Du bist offline: Angezeigte Daten können veraltet sein. Änderungen werden gesendet, sobald du wieder online bist." (`13-banner-offline-mobil.png`, `role="status"`). Going online again removes it within 1.2 s.
- ✅ Offline, opening a view that was not loaded before shows "Du bist offline. Diese Seite wurde noch nicht geladen." with the action "Erneut versuchen" (P-09, P-10).
- ✅ Banner, unknown light zone: "Lichtzone unbekannt: Für Fensterbank fehlt die Lichtzone. Weise sie mit „Lichtzone zuweisen“ zu, damit die Hinweise zum Licht stimmen." above the locations (`14-banner-zone-unknown-mobil.png`, `role="status"`), at 360 and 1280 px.
- ✅ PlantLoader: with the API delayed by 5 s, "Heute" shows the plant drawing in the sections and the status "Heute wird geladen …" (`15-plantloader-mobil.png`). Normal motion runs the animations `plant-sway` (2.56 s) and `plant-grow` (1.92 s); with reduced motion none runs and the drawing stands still.
- ⚠️ In the same screenshot the status chip "überfällig seit 13 Tagen" of an open treatment has a thick dark left bar that follows the round corner, which looks like a glitch. #608.
- ⚠️ Card: the Card component puts its children into an inner block, so `className="grid"` on `Card` does nothing; this breaks the friend row (section 1) and the same pattern in `archived-list.tsx` and `start-page.tsx`. #605. Elsewhere cards render as designed (`01-*`, `05-*`, `07-*`).
- ✅ Avatar: "Konto" shows the circle "M" next to "Hallo, Mara Testperson" (`08-konto-mobil.png`); the friend row shows "JT" as a decorative avatar next to the name.

## 5. Criterion: keyboard-only operation

**Expected:** Tab order follows the visual order, the focus is visible and never hidden by the bar or the toast, Escape closes dialogs, menus and popovers and returns the focus.

**Observed:**

- ✅ Tab walk over the eight pages at 360 and 1280 px (about 500 stops): the first stop is the skip link "Zum Inhalt springen", then the brand link; at 1280 px follow the five navigation links, at 360 px the content; the bottom bar comes last. No focused element was covered by another element (`elementFromPoint` at its centre) or outside the view.
- ✅ The focus indicator is visible: a green ring around the sidebar link and around the button "Zu Behandlung" (`19-focus-visible-desktop.png`, crops checked by eye). Automatic detection by computed style was inconclusive (the ring is drawn with a shadow stack), so this is a visual check of two elements, not of every stop.
- ✅ Desktop, "Behandlung planen" (a dialog at 1280 px): the focus goes into the dialog, 25 Tab presses stay inside, Escape closes it and the focus returns to the button (`17-plan-dialog-desktop.png`).
- ❌ Phone, "Behandlung planen" (a bottom sheet at 360 px): after opening, the focus stays on the trigger button, and Tab leaves the sheet to the page behind it ("Exemplar wählen …", "Standort wählen …", "Heute", "Sammlung", ...). Escape closes the sheet and returns the focus. Same result for a click and for Enter, with and without reduced motion (`17-plan-dialog-mobil.png`). The jsdom tests of the sheet pass, so only a browser test finds it. #604.
- ✅ The drawer "Mehr" (same sheet component) keeps Tab inside after the first key press; Escape closes it and returns the focus to "Mehr". On open the focus also stays on the trigger (part of #604).
- ✅ The mode switch (`Pflanzen | Arten | Wunschliste`) works with Tab and Enter: the address changes to `?view=species`, the focus stays on the pressed control and the view name is announced in a live region.
- ⚠️ The arrow keys do not move between the modes; Tab is needed. Not required by the story.
- ⏭️ Escape on menus and popovers: no page uses the Menu or Popover component yet (only Storybook); not checked.
- ⏭️ Screen readers (the live regions and names were read from the DOM, not heard).

## 6. Criterion: "Mehr laden"

**Expected:** the catalog shows 20 entries and "Mehr laden" appends the next ones; the end is announced; the button is reachable by keyboard.

**Observed:**

- ✅ "Entdecken", "Katalog" with 45 species: 20 entries and the button "Mehr laden" (`16-mehr-laden-mobil.png`); Enter on the button gives 40 ("20 weitere geladen. 40 von 45 angezeigt."), then 45 ("5 weitere geladen. 45 von 45 angezeigt."), the text "Alles geladen" and the button is gone.
- ⚠️ After Enter the focus stays on "Mehr laden", but the new entries are inserted above it, so the focused button leaves the visible area. #606.

## 7. Criterion: reduced motion

**Expected:** with `prefers-reduced-motion: reduce` no non-essential motion runs and every state change stays visible.

**Observed:**

- ✅ At 360 px with `reduce`: no element has a running transition or animation on any of the eight pages (0 of 0). With `no-preference` the same pages have 5 to 32 elements with transitions per page, and the lists on "Sammlung" run the animation `list-in` (6, 45 and 3 elements).
- ✅ The PlantLoader stands still with `reduce` (section 4) and still says "Heute wird geladen …", so the state stays visible.
- ⏭️ The cross-fade between views (view transitions) was not measured, and no swipe on "Vorschläge" (touch gesture) was tried.

## Offene Punkte

Findings as issues (all found in this run, none fixed in this PR because none is trivial):

- ❌ #604 Phone sheet: focus does not enter the sheet and the planning sheet does not trap Tab (bug, accessibility).
- ⚠️ #605 `Card` with `className="grid"`: friend rows (and two more places) render as one line (bug).
- ⚠️ #606 "Mehr laden": the focused button is pushed out of view (enabler, accessibility).
- ⚠️ #607 Phone navigation for reviewers and operators: "Konto" moves into "Mehr" (decision).
- ⚠️ #608 Visual polish: curved left bar of the overdue chip, "Freunde" without a page header like the other destinations.

Not filed (judgment calls, listed for the owner): the red border of the wishlist hint "Nachschub nötig"; the weights 700 ("Alle") and 400 (catalog entries) among otherwise semibold buttons; the wording of the empty "Vorschläge" while the taxon tree is empty; the arrow keys on the mode switch.

Not checked (⏭️): contrast and axe on the live pages, dark screenshots for five of the eight pages, a real phone and other browsers (only Chromium), screen reader output, view cross-fade and swipe, Escape on menus and popovers (not used by a page yet), `aria-current` of the navigation.

Environment-specific: the web server ran on port 5173 because the realm of the shared Keycloak only allows that redirect address; the scratch database `pflanzendex_manual` was dropped after the test; the two Keycloak users `qs14-*@example.test` stay in the shared local Keycloak (removing them needs the admin password, which this session did not use).

Screenshots (`us-qs-14/`): `01` to `08` the eight pages (light, mobil and desktop), `09` to `11` dark, `12` toast, `13` offline banner, `14` unknown-zone banner, `15` PlantLoader, `16` "Mehr laden", `17` planning sheet and dialog, `19` focus ring, `20` and `21` navigation of a reviewer.
