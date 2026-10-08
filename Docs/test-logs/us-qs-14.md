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

- ✅ #604 Phone sheet: focus does not enter the sheet and the planning sheet does not trap Tab (bug, accessibility). Fixed, confirmed in the re-test of 2026-10-08 (section "Re-test", R1).
- ✅ #605 `Card` with `className="grid"`: friend rows (and two more places) render as one line (bug). Fixed, confirmed in the re-test (R2).
- ⚠️ #606 "Mehr laden": the focused button is pushed out of view (enabler, accessibility). Fixed in the main point (button stays in view, announcement right); remaining: the button sits flush on the bottom bar, issue #629 (R3).
- ✅ #607 Phone navigation for reviewers and operators: "Konto" moves into "Mehr" (decision). Decided and written into the spec; the real app matches the new criteria (R4).
- ✅ #608 Visual polish: curved left bar of the overdue chip, "Freunde" without a page header. Fixed, confirmed in the re-test (R2); the remaining polish points are issue #630.

Not filed (judgment calls, listed for the owner): the red border of the wishlist hint "Nachschub nötig"; the weights 700 ("Alle") and 400 (catalog entries) among otherwise semibold buttons; the wording of the empty "Vorschläge" while the taxon tree is empty; the arrow keys on the mode switch.

Not checked (⏭️): contrast and axe on the live pages, dark screenshots for five of the eight pages, a real phone and other browsers (only Chromium), screen reader output, view cross-fade and swipe, Escape on menus and popovers (not used by a page yet), `aria-current` of the navigation.

Environment-specific: the web server ran on port 5173 because the realm of the shared Keycloak only allows that redirect address; the scratch database `pflanzendex_manual` was dropped after the test; the two Keycloak users `qs14-*@example.test` stay in the shared local Keycloak (removing them needs the admin password, which this session did not use).

Screenshots (`us-qs-14/`): `01` to `08` the eight pages (light, mobil and desktop), `09` to `11` dark, `12` toast, `13` offline banner, `14` unknown-zone banner, `15` PlantLoader, `16` "Mehr laden", `17` planning sheet and dialog, `19` focus ring, `20` and `21` navigation of a reviewer.

---

## Re-test (2026-10-08, issue #627)

**Setup:** same method as above, on this branch (`chore/qs-14-redesign-re-test-the`, code of `dev` at `2de4c0c`): real Keycloak 26.8, API (port 55034), Vite on port 5173 (the realm only allows that redirect address), PostgreSQL 16 in this worktree's container (port 54534) with a fresh scratch database `pflanzendex_manual` (migrations 0001 to 0041, dropped afterwards), Chromium 1243 headless driven by Playwright, `de-DE`, 360 and 1280 px, light and dark, reduced and normal motion for the focus tests. The existing Keycloak users "Mara Testperson" (main account) and "Jonas Testperson" (friend, role `reviewer` set by SQL in the scratch database) were reused. Data: 45 species (this time proposed through the API by Mara and approved through `POST /review/:id/decide` by Jonas, so no guard trigger was disabled), light zones "Lampe 1" to "Lampe 4", locations "Fensterbank" (no zone), "Wachstumsregal", "Balkon", six specimens (one archived "Vertrocknet"), two treatments (13 and 6 days overdue on "Alocasia aoula – Topf 1", plus "heute fällig"), three wishes, a friendship between the two. No taxa were seeded, so "Vorschläge" was not looked at. For the start-page hints Jonas has one specimen and no location or zone.

Not run: `make ci` of section 0 is repeated for this docs-only change (result in the PR description).

| #   | Finding                                                          | Result               |
| --- | ---------------------------------------------------------------- | -------------------- |
| R1  | #604 phone sheets: focus, Tab, Escape                            | ✅                   |
| R2  | #605 and #608 Freunde, header, overdue chip, hint cards, archive | ✅ (⚠️ polish, #630) |
| R3  | #606 "Mehr laden"                                                | ⚠️ #629              |
| R4  | #607 bar for a role account                                      | ✅                   |

### R1. #604 phone sheets at 360 px

**Expected:** focus enters the sheet, Tab cycles inside, Escape closes it and the focus returns to the trigger.

**Observed:**

- ✅ "Behandlung planen" on "Heute" (Mara): on opening (Enter and mouse click, reduced and normal motion) the focus is inside the dialog (the first checkbox of "Exemplare"). 14 Tab presses all stay inside; Shift+Tab from the start wraps to the last control "Behandlung speichern". Escape closes the sheet (no visible dialog left) and the focus is back on the button "Behandlung planen" (`re-01-plan-sheet-fokus-mobil.png`). The earlier ❌ is gone.
- ✅ Drawer "Mehr" (Jonas): on opening the focus is on the sheet container (heading "Mehr" with the entries), so inside the dialog; 14 Tab presses cycle between "Konto" and "Prüfliste" only; Escape closes it and the focus returns to "Mehr" (`re-02-mehr-drawer-mobil.png`). Same for click and Enter, both motion settings.
- ⏭️ Screen reader output was not heard; only DOM focus was measured.

### R2. #605 and #608 layout, header, chip

**Expected:** friend rows as separate blocks with a gap, buttons apart, a page header "Freunde" like the other destinations, no curved bar on the overdue chip, hint cards and archive entries laid out as stacked blocks.

**Observed:**

- ✅ "Freunde" at 360 and 1280 px, light and dark: one `h1` "Freunde" above the content with the intro text, like "Heute" or "Sammlung"; no horizontal scroll (0 px). The friend row shows avatar and name, then "befreundet seit 08.10.2026" and "Gemeinsame Arten: unbekannt (noch nichts freigegeben)" on their own lines, then the two buttons as separate blocks with a gap (`re-03-freunde-light-mobil.png`, `re-04-freunde-dark-desktop.png`).
- ✅ Overdue chip "überfällig seit 13 Tagen" on "Heute": a uniform 1 px border on all four sides and a full pill radius, no thick left bar (computed style at 360 and 1280 px; `re-05-ueberfaellig-chip-mobil.png`).
- ✅ Start page hint cards (Jonas, `/`): "Du hast noch keinen Standort angelegt." and "Du hast noch keine Lichtzonen." are two blocks with text, hint line and button on separate lines, 16 px padding, gaps between them, at 360 and 1280 px, light and dark (`re-06-start-hinweise-dark-mobil.png`).
- ✅ "Sammlung" archive entry (Mara): "Alocasia ctula – Topf 6" shows "Art", "Archiviert am 08.10.2026", "Grund: Vertrocknet" and the button "Wiederherstellen" on separate lines (`re-07-sammlung-archiv-mobil.png`).
- ⚠️ By eye, things that look off but are not broken (#630): hint cards and the "Sammlung" cards sit as cards inside the large page card, which looks heavy in dark mode; the chip at 360 px wraps into two lines ("überfällig seit 13 / Tagen") and becomes a rounded box; at 1280 px the two friend buttons still stack vertically although there is room for one line, while the share cards below put their buttons side by side. The previous layout bug itself (one run-together line) is fixed.
- ⏭️ No design file was compared; the visual judgment is by eye on the screenshots (light 360, dark 1280, the start page in dark and the archive were looked at; the other combinations were rendered and measured for overflow only).

### R3. #606 "Mehr laden" at 360 px

**Expected:** after "Mehr laden" the focused button stays visible and the announcement is right.

**Observed:**

- ✅ Entdecken, Katalog with 45 species: Enter on the focused "Mehr laden" gives 40 entries and the status "20 weitere geladen. 40 von 45 angezeigt."; the second Enter gives 45 and "5 weitere geladen. 45 von 45 angezeigt."; the focus moves to "Alles geladen", the button is gone. The button stays inside the viewport after the first press (`re-08-mehr-laden-mobil.png`); same with reduced and normal motion. The earlier ⚠️ (button pushed out of view) is fixed.
- ⚠️ The button's bottom edge is at y 741, exactly the top of the bottom bar (741): visible, but with no gap, so the lower edge of the focus ring is under the bar (inferred from the geometry and the screenshot, not measured on the ring). Issue #629.

### R4. #607 spec text against the real app

**Expected** (`Docs/PRODUCT-SPECS/14-Cross-Cutting.md`, lines 169 and 170): without a role five destinations and no "Mehr"; with the role reviewer or operator the bar holds "Heute", "Sammlung", "Entdecken", "Freunde", "Mehr", and the drawer holds "Konto" and the role-only entries; from 768 px the rail and sidebar show "Konto" and the role-only entries separately.

**Observed:**

- ✅ Mara (no role), 360 px: `nav "Navigation unten"` with "Heute", "Sammlung", "Entdecken", "Freunde", "Konto", no "Mehr".
- ✅ Jonas (reviewer), 360 px: "Heute", "Sammlung", "Entdecken", "Freunde", "Mehr"; the drawer lists "Konto" and "Prüfliste".
- ✅ Jonas at 768 px (rail) and 1280 px (sidebar): "Konto" and "Prüfliste" as separate items after the four destinations.
- ⏭️ The operator role ("Betreiber") was not set up; only the reviewer was checked.

### Offene Punkte after the re-test

- Open: #629 (button flush on the phone bar, bug) and #630 (polish: card in card, chip wrap, friend buttons on desktop; enabler).
- Still not checked (unchanged): contrast and axe on the live pages, real phones and other browsers, screen reader output, "Vorschläge" (no taxa seeded in this run), the operator role.
- Environment: the Keycloak users `qs14-*@example.test` stay in the shared local Keycloak; the scratch database and this run's API and Vite processes were removed after the test.

Screenshots (`us-qs-14/`, prefix `re-`, 128 colours): `re-01` planning sheet, `re-02` drawer "Mehr", `re-03` and `re-04` "Freunde", `re-05` overdue chip, `re-06` start-page hints, `re-07` archive entry, `re-08` "Mehr laden".

### Fixes for #629 and #630 (2026-10-08)

- #629: the shell already kept the page's scroll padding equal to the bar height, so `scrollIntoView({ block: "nearest" })` put the button exactly at the bar's top edge. The shell now adds 8 px of room for the focus ring (ring 2 px plus offset 2 px, doubled) to the top and bottom scroll padding, and still adds nothing where the bars are hidden (from `md`). Measured in Storybook at 360 px: the bottom scroll padding is 67 px (bar 59 px plus 8 px). The real "Mehr laden" button with 45 species was not re-run against the real app; the geometry check on a Storybook page only confirmed the padding value.
- #630 (a): cards inside the page card (start-page hints, archive entries, distribution card, specimen cards in "Sammlung") are flat and one surface step tinted (`bg-secondary`, no second shadow or border), as ADR 0011 decision 4 says depth comes from the surface step. `Card` got a `nested` prop. (b): the status chip uses `rounded-control` instead of the full pill, so a wrapped text stays a soft box. (c): the two friend buttons share one wrapping row with a gap.
- Screenshots `fix-01` and `fix-02` (prefix `fix-`, 128 colours): "Sammlung" and "Heute" in dark mode at 360 px from the Storybook page stories. Before: `re-05`, `re-06`, `re-07`. The friend row at 1280 px has no page story with a friend list, so (c) is covered by a unit test only.

## Gap test: role "Betreiber" and "Vorschläge" with real taxa (2026-10-08, issue #635)

**Branch:** `chore/qs-14-redesign-test-gap-betreiber` (draft PR #640), based on `dev` at `747751a`. Docs only; no app code changed.

**Setup:** same method as the re-test: real Keycloak 26.8, API (port 55270), Vite on port 5173 (the realm only allows that redirect address), PostgreSQL 16 in this worktree's container (port 54770) with a fresh scratch database `pflanzendex_manual` (migrations 0001 to 0041, dropped afterwards), Chromium 1243 headless driven by Playwright, `de-DE`, light and dark, reduced motion. The existing Keycloak users were reused, none created: "Mara Testperson" (main account) and "Jonas Testperson" (second account). Changes that are not in the repo:

- **Operator role:** roles live in the table `account_role` (`is_operator()` and `is_reviewer()` read it; `GET /account` reports `operator` and `reviewer`). No Keycloak realm role is involved, so the Keycloak admin password was not needed. Mara got `operator` and Jonas `reviewer` with `insert into account_role (account, role) ...` in the scratch database. (The database function `is_reviewer()` is true for any role, so the operator also sees "Prüfliste"; that matches the spec text.)
- **Species and taxa:** 35 real house plant names (Monstera deliciosa, Hoya carnosa, ...) were proposed through the API by Mara and approved through `POST /review/:id/decide` by Jonas. The taxonomy job of the API process (the real OpenTree, Wikidata, Wikipedia and GBIF run, started with the API) then built the taxa itself within about two minutes: 33 `resolved`, 2 `unresolved` (`Ceropegia woodii`: `taxonomy.not_species`, `Dracaena trifasciata`: `taxonomy.no_match`). So no taxon was inserted by SQL and there is no deviation from the repo here. 12 of the 33 summaries are English (`summary_language = 'en'`), 21 German.
- Mara's collection for the second look: light zones "Lampe 1" to "Lampe 4" (defaults), locations "Wachstumsregal" and "Fensterbank", three specimens (Aloe vera, Epipremnum aureum, Hoya carnosa), two wishes. For the "AllDecided" state Jonas put all 35 species on his wishlist through the API.
- On the Betreiber page I saved a monthly cost (12,50 EUR), created one invitation code and switched the registration mode to "nur mit Einladungscode" and back to "offen für alle" in the scratch database.

Legend as above. Screenshots (`us-qs-14/`, prefix `gap-`, 8 files, 128 colours) are 360×800, 768×900 and 1280×800.

| #   | Check                                                        | Result                               |
| --- | ------------------------------------------------------------ | ------------------------------------ |
| G0  | how the operator role is granted                             | ✅ database, no Keycloak admin       |
| G1a | navigation for the operator at 360, 768, 1280 px, both modes | ✅                                   |
| G1b | Betreiber page: heading, layout, overflow, targets, focus    | ✅ (⚠️ focus lost after saving #642) |
| G1c | role gate for a reviewer opening `/operator`                 | ✅                                   |
| G2a | deck with real taxa: cards, reasons, keyboard, swipe         | ⚠️ #643, #644, #645                  |
| G2b | end of a deck, "Neuer Stapel", last deck                     | ⚠️ #643                              |
| G2c | "AllDecided" and its wording                                 | ✅                                   |
| G2d | "Mehr laden" in "Vorschläge"                                 | ⏭️ does not exist there              |

### G0 and G1. Role "Betreiber"

**Expected** (`Docs/PRODUCT-SPECS/14-Cross-Cutting.md`, US-QS-14): for an account with the role operator the bar at 360 px shows "Heute", "Sammlung", "Entdecken", "Freunde", "Mehr" and the drawer "Mehr" holds "Konto", "Prüfliste" and "Betreiber"; the rail (768 px) and the sidebar (1280 px) show "Konto" and the role-only entries as separate items. The page has one main heading, no horizontal scroll, controls of at least 44 px and a visible focus.

**Observed** (Mara as operator; measured with `getBoundingClientRect` and `getComputedStyle` in all six combinations of 360, 768, 1280 px and light, dark):

- ✅ 360 px: `nav "Navigation unten"`, 360×59 px, five items of 69×58 px: "Heute", "Sammlung", "Entdecken", "Freunde", "Mehr". The drawer (`role=dialog`) lists "Konto", "Prüfliste", "Betreiber", each 328×44 px (`gap-01-*`). On `/operator` the item "Mehr" is the highlighted one (`gap-02-*`).
- ✅ 768 px: `nav "Navigation seitlich"`, a rail 80 px wide: brand, then "Heute", "Sammlung", "Entdecken", "Freunde", "Konto", "Prüfliste", "Betreiber" (71×58 px each); "Betreiber" carries `aria-current="page"` on its page (`gap-03-*`).
- ✅ 1280 px: `nav "Hauptnavigation"`, a sidebar 248 px wide, items 223×44 px; a rule sets "Konto", "Prüfliste" and "Betreiber" off from the four destinations; the current entry is highlighted (`gap-04-*`).
- ✅ The page: one `h1` "Betreiber", title "Betreiber – PflanzenDéx", sections "Monatliche Kosten", "Registrierung", "Einladungscodes"; the heading takes the focus after the navigation (all six combinations); scroll overflow 0 px; every button, input and link is at least 44 px high (only the visually hidden skip link measures 1×1 px). The keyboard order is skip link, brand, (sidebar entries), the form fields, the buttons, the bar. The focus ring is visible on "Kosten speichern" (`gap-02-*` shows the page, the ring by eye in a separate dark 360 px shot that is not part of the set). Light and dark show the same layout; on the phone the statistics stack as label above value, from 1280 px they sit in two columns.
- ✅ Writes work: "Kosten speichern" with 12,50 gives "Monatliche Kosten gespeichert." and "Kosten pro Nutzer 6,25 € (Oktober 2026, manuell eingetragen)" with two accounts; "Code erstellen" shows the code once ("ZKKJ-SWE2-..." with "Gültig bis 15.10.2026, 16:40. Der Code wird nur jetzt angezeigt ...") and a list line "offen · erstellt ..."; the status line is a `role=status` with "Einladungscode erstellt.". The registration switch toggles ("Im Moment: nur mit Einladungscode" and back).
- ✅ Jonas (reviewer, no operator role): the bar shows "Heute", "Sammlung", "Entdecken", "Freunde", "Mehr" (drawer not opened in this run, it was in R4); opening `/operator` by address leads to the start page with "Der Betreiberbereich ist nur für den Betreiber sichtbar." (a refusal that names the reason, P-10).
- ⚠️ After each of the three writes the keyboard focus is lost to `BODY` (measured for "Kosten speichern", "Für alle öffnen" and "Code erstellen" with Enter): #642.
- ⚠️ By eye: the page is a plain column without a page card, unlike "Freunde". On a phone the section "Registrierung" button "Nur mit Einladungscode erlauben" looks like an outlined chip with weak contrast to the page (not measured). A judgment call, not filed.
- ⏭️ Not checked: a Keycloak realm role (does not exist), axe and exact contrast on the live page, a real phone, screen reader output, the invitation flow (registering with the code) and the page with several invitations.

### G2. "Vorschläge" with real taxa

**Expected** (`Docs/PRODUCT-SPECS/17-Discover.md`, US-ENT-01 to US-ENT-04, as far as they are built; US-ENT-04 is not): one card at a time with image and source, name, text, zone, difficulty and unknown attributes as "unbekannt", 1 to 3 reasons from own data, "Nein", "Später", "Ja" as buttons and by swipe, "Für heute durch" after the last card with "Neuer Stapel", an empty view with the reason and the next action.

**Observed:**

- ✅ With 33 resolved taxa Mara sees "Vorschlag 1 von 10" with image, `h2` name, "Deutscher Name unbekannt", the Wikipedia text, a definition list ("Lichtzone", "Schwierigkeit" as ★☆☆, "Luftfeuchte", "Mindesttemperatur", "Haustiere", "Wuchsgröße" as "unbekannt"), the source line "Bild und Text: Wikipedia (CC BY-SA)", "Warum diese Art?" and the three buttons. No overflow at 360 and 1280 px, light and dark (`gap-05-*`). Decks have 10, 10, 10 and 3 cards (33 candidates), the fifth request ends in an empty view.
- ✅ Keyboard: Tab reaches the buttons in 6 steps at 360 px (13 at 1280 px, through the sidebar); Enter on "Ja", "Nein" or "Später" moves on and puts the focus on the new card title (`H2#suggestion-title`), the line "Vorschlag n von 10" is `aria-live="polite"`. The focus ring on "Nein" is visible (`gap-06-*`).
- ✅ A drag with the mouse (pointer events) to the right and to the left each advanced one card. ⏭️ A real touch swipe was not tested.
- ✅ The honesty line "Deine Entscheidungen werden noch nicht gespeichert: „Ja“ und „Nein“ blättern vorerst nur weiter." is visible and the end card says "Für heute durch. 0 neu auf der Wunschliste." even after several "Ja" (consistent with US-ENT-04 not built, P-10).
- ✅ "AllDecided" (Jonas with all 35 species on the wishlist): "Keine neuen Vorschläge: Du besitzt alle Arten des Katalogs oder hast dich schon entschieden." with "Schlage eine neue Art für den Katalog vor." and the button "Art vorschlagen" (`gap-07-*`, dark 360 px; the same at 1280 px light). The reason and the next action are clear, the target (catalog mode) exists. The earlier misleading "Der Katalog hat noch keine Arten." (taxa missing) did not show now because taxa existed.
- ⚠️ Focus is lost to `BODY` at the end of a deck ("Für heute durch ...", `gap-08-*`) and after "Neuer Stapel" (every deck and the final empty view): #643.
- ⚠️ The three action buttons sit below the fold: y=937 px at 360×800 (the page is 1169 px high, the bar starts at 741 px), y=840 px at 1280×800 (`gap-05-*` shows the card, `gap-06-*` the page after scrolling by 369 px). The source line link is 20 px high. #644.
- ⚠️ 12 of 33 texts are English in the German card, without `lang` attribute: #645.
- ⚠️ Reasons: every card shows the same two lines, "Diese Art hast du noch nicht gefangen." (true for every candidate, so no information) and "Neue Familie: <Familie> fehlt dir noch im Pokédex." With an empty collection deck 1 holds ten Araceae in a row and deck 2 starts with Asparagaceae, so the order follows the families, not variety. This is the state of the built part (US-ENT-03 and the scoring of US-ENT-05 are open in the spec, status 🟨); the card does not claim more than it knows. Not filed, as a story of the epic ENT covers it.
- ⚠️ "Neuer Stapel" is offered after the last small deck (3 cards) although no further deck exists; the next request answers "Keine weiteren Vorschläge: Dieser Stapel ist der letzte." (the wording talks about a deck the user never saw). Honest and with a next action, but a dead end by one tap. Not filed (wording).
- ⏭️ "Mehr laden" does not exist in "Vorschläge" (the deck uses "Neuer Stapel"); the "Katalog" mode with "Mehr laden" was checked in the re-test (R3). The state with an empty taxon table ("Der Katalog hat noch keine Arten.") was not repeated. The filters of US-ENT-02 are not built. Reasons from thriving or struggling specimens (measurements) were not set up, so only the two built reason lines were seen.

### Offene Punkte after the gap test

- New issues: #642 (focus lost after saving on the Betreiber page), #643 (focus lost at the end of a deck and after "Neuer Stapel"), #644 (decision buttons below the fold, small source link), #645 (English texts without `lang`). They have no Priority on the board yet (bugs: P1 by the rule of thumb).
- Still not checked (unchanged): contrast and axe on the live pages (#637), real phone and other browsers (#638), screen reader output (#636), a real touch swipe, the invitation redemption flow.
- Environment: the Keycloak users `qs14-*@example.test` stay in the shared local Keycloak (reused, none created); the scratch database, this run's API and Vite processes were removed after the test. The registration mode of the scratch database was set back before it was dropped.
