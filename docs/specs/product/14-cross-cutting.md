# 14 – Epic QS: Cross-Cutting (Privacy, Security, Mobile, Quality)

Non-functional requirements for all epics. All ⬜. The yardstick is the product principles P-01 to P-11 (`00-Product-Overview.md`).

## User stories

### US-QS-01 · Nothing depends on remembering · 🟨 (prototype 🟡)

As a **plant keeper** I want the system to report need for action itself.

Acceptance criteria:

- Phase changes, due treatments, overdue measurements and wishlist buffer trigger a reminder (epic MON) without the app being opened.
- The home screen "Heute" shows the same items (one source, `FR-MON-03`).

State of implementation (enabler TE-07, assumptions decided by the PO, flagged): the module `today` (read only, no table) holds the one `status` function (`todayStatus` in `core`, `GET /today?timeZone=<IANA name>`, view "Heute"). It does not recompute anything; it reuses the derivations of the open treatments (US-BEH-02), the care phases (US-PHA-02) and the hints about incomplete specimens (US-BES-08), reads the clock once and adds order and next action, so "Today", the reminders (MON) and the AI daily status (US-KI-02) can use it and never disagree (R-04). Dates are local calendar days in the user's time zone (NFR-08). Entries, most urgent first (what is bound to a date comes first; assumption): (1) treatment overdue, the most overdue first, (2) treatment due today, (3) phase deviation (location id differs from the target location of today's phase, US-PHA-02), (4) incomplete specimen (US-BES-08), inside groups 3 and 4 by name. Every entry carries a text, a next action (P-09) and the place where it is done (`treatments`, `care_phases`, `hints`; the interface maps them to views). A specimen without location is named once, as incomplete data, not again as deviation (P-10 without duplicates). Treatments that are not due yet are not entries but are counted (`upcoming`, shown as a note), so nothing disappears silently (P-10). An empty list says "Heute steht nichts an." with the count of later dates and leads to the collection (P-09). Archived specimens never appear (`isActive`, US-BES-07), only the own data is read (P-04). **Open (gap list):** the entry "measurement overdue" (needs an interval per species or specimen, which no story defines yet; P-08, no invented number), the wishlist buffer warning (US-WUN-02, still its own view), "phase change today with the old location" (US-MON-02), the QS-04 deviation view, a switch of the AI daily status (US-KI-02) onto the function, reading of the same function by the reminders (US-MON-01 to MON-03), a per-entry quick action in the list (ticking off a treatment still happens in "Behandlung"), the list on the start page, and a count badge on the navigation entry.

### US-QS-02 · Logic is testable · 🟨 (prototype 🟡)

As a **developer** I want to secure every calculation with tests.

Acceptance criteria:

- Phase, rate, trend, light zone counting, prioritization, naming rule, rank, milestones, swap states and feed derivation exist as pure logic without I/O and have tests.
- Every story with status ✅ has at least one test whose name carries the story ID (P-06).

State of implementation: care phase (`care/phases`), light zone counting (`collection/distribution`), prioritization (`wishlist/candidates`), naming rule (`wishlist/name-key`, `pokedex/ownership/species-key`), rank (`pokedex/rank`) and milestones (`pokedex/milestones`) are pure logic in `core` with tests. The second criterion is enforced for `US-` stories by `check-traceability.mjs` (`make spec-check`, US-QG-04); the report `app/tools/check/quality/duplicates/story-tests/report-story-tests.mjs` (report only, exit 0; owner decision 2026-10-07) lists the tests per ✅/🟨 story and requirement and the state of each logic area. **Open:** rate and trend (they come with US-WAC-03), swap states and feed derivation (SOZ, do not exist yet), and whether requirement rows (`FR-`, `NFR-`) with ✅ must also carry a test name (owner decision; five ✅ requirements have none today).

### US-QS-03 · Repeatable without fear · 🟨 (prototype ✅)

Acceptance criteria:

- Every writing operation is idempotent or prevents double execution (double click, repeat after abort).
- Background jobs (reminders, catalog enrichment, photo processing) deliver the same result on repetition.

State of implementation: the job queue (TE-06, PostgreSQL, module `jobs`) exists: orders with the same type and key are merged, a failed run is retried with backoff, a lost worker loses its job after a lease, and a job that cannot succeed ends dead with its error kept (P-10). Handlers must be repeatable. **Open:** no job type yet (reminders, catalog enrichment, photo processing come with their stories) and the redelivery of buffered write actions.

### US-QS-04 · Deviations become visible · 🟨 (prototype ✅)

Acceptance criteria:

- Wrong location, overdue treatment, buffer undercut, etiolated last measurement, data gaps appear as a warning with an instruction for action (P-09).
- Data that would be missing in an evaluation (specimen without species, without location) appears in a warning list (P-10).

State of implementation: the today list (TE-07, view "Heute") shows every deviation as an entry with a state word, a text and the next action (P-09): wrong location of the care phase (US-PHA-02), overdue treatment (US-BEH-02), etiolated last measurement ("Vergeilt", leads to measuring), zone 2 to 4 below the buffer of open candidates ("Nachschub", the warning of US-WUN-02, leads to the wishlist) and data gaps (US-BES-08, specimen without location or zone, also in the warning list "Fehlt noch"). A specimen always has a species (required on creation), so "without species" cannot occur. Archived specimens are left out (US-BES-07). **Open:** the manual test protocol in a real browser.

### US-QS-05 · Privacy and control · 🟨 (prototype ✅ partly)

As a **plant keeper** I want to know and determine what happens with my data.

Acceptance criteria:

- Information, export and complete deletion of the account (see `US-ACC-04`).
- Photos are freed of EXIF/GPS before storage and reduced to a maximum size (prototype: long side 1600 px, quality 82).
- Location, growth notes, treatments, prices and financial data are never transmitted to friends or partners (FR-SOZ-01, FR-EQU-08).
- A page "What is measured?" names usage measurement and click counting; without consent nothing is counted.

State of implementation: photos are freed of EXIF/GPS and reduced (long side 1600 px, quality 82) before storage and served only to their owner (US-WAC-06). Friends see only the whitelisted facts of shared specimens (US-SOZ-04); a test proves for every friend view (shared specimens, friend collection, friend list, feed, feed banner) that location, measurement notes and treatments of a shared specimen never reach the friend. The section "Was wird gemessen?" on the page Konto names what is recorded: no click counting, no usage analytics and no advertising or analytics services; the time of the last activity is stored on every sign-in and the operator sees only the number of active accounts of the last 30 days (US-ACC-05); images of collector cards and suggestions are loaded by the device directly from Wikimedia. Export and deletion of the account exist (US-ACC-04); **open:** the information about the processing (release R3); whether the count of active accounts needs a consent or rests on the operator's legitimate interest (owner decision).

### US-QS-06 · Sources and licenses · 🟨 (prototype ✅)

Acceptance criteria:

- Wikipedia texts and images (CC BY-SA) are shown with source link and license statement (FR-POK-07).
- User images remain the property of the user; passing on only after sharing.
- Partner links are labeled (FR-EQU-05).

State of implementation: the collector card (US-POK-01) and the suggestion card (US-ENT-01) link the Wikipedia article with "Quelle: Wikipedia (CC BY-SA)" or "Bild und Text: Wikipedia (CC BY-SA)"; when text or image are shown without a known article link, source and license are still named as text ("…, Link unbekannt", P-08); a card without Wikipedia content shows no attribution. User images (measurement photos, US-WAC-06) are served only to their owner and are not passed on (the photo switch of US-SOZ-04 does not act yet). **Open:** the label of partner links (FR-EQU-05; equipment does not exist yet) and the license of each image (a Wikimedia Commons image can carry a license other than CC BY-SA; the catalog does not store it yet).

### US-QS-07 · Usable on mobile · ⬜ new

As a **plant keeper** I want to operate the app on the phone next to the plant.

The look and the components that make this possible are governed by the design system (`docs/guides/reference/design-system.md`, enabler TE-17, gates QG-U4 to QG-U6).

Acceptance criteria:

- All everyday flows (measuring with photo, confirming watering/location, ticking off treatment, Today list) can be operated with one hand and without horizontal scrolling.
- The app is installable (home screen) and shows the last loaded data when there is no network; write actions are buffered and delivered when the network returns, without duplicate entry (`US-QS-03`).
- Photo capture directly from the camera.
- Given a page or a request is loading, when the wait is shown, then an animated sprout (static under reduced motion) accompanies the placeholder or stands alone, and assistive technology hears the loading text once (4.1.3, 2.3.3).
- Given a write succeeded or failed, when the result is shown, then a toast says so in a polite (error: assertive) live region above the bottom bar, an undo action is offered where one exists, and the toast stays while it is hovered or focused and for an error at least 10 s; a state that lasts (offline, unknown zone, failed sync) is shown as a banner that stays until dismissed or resolved (4.1.3, 2.2.1, P-10).
- Given a card, a person or plant picture, or a progress value is shown, when it is read by assistive technology or the image fails, then a card that opens something is one link or button with a visible focus ring and a 44 px target, a picture is named (or hidden when the name is next to it) and falls back to initials, and progress is a named progress bar with its value or "Schritt n von m"; motion stops under reduced motion (1.1.1, 2.4.7, 2.5.8, 4.1.2).
- Given a set of tabs, when I move with the arrow keys, Home or End, then focus and selection move together over a real tablist (only the selected tab is in the tab order, `aria-selected` and `aria-controls` are set) (4.1.2, 2.1.1).
- Given a collapsible section such as a care profile part, when I toggle it with Enter or Space, then its button reports `aria-expanded`, the height animates with the motion tokens, and under reduced motion it switches without animation (4.1.2, 2.3.3).
- Given a popover or an overflow menu is open, when I press Escape, press outside or tab out, then it closes, and Escape returns focus to its trigger; in the menu the arrow keys, Home and End move over the enabled items (2.1.1, 2.4.3).
- Given a long list such as the species catalog, when I press "Mehr laden" (or use the numbered pages), then the button is disabled and shows the sprout while the page loads without shifting the layout, a polite live region says how many were added and "n von m", focus stays on the button (or on "Alles geladen" after the last page), and the numbered pages form a named navigation with `aria-current="page"` and 44 px targets (4.1.3, 2.4.3, 2.5.8, 4.1.2).

### Accessibility (US-QS-08 to US-QS-13)

The conformance target is **WCAG 2.1 level AA** as required by **EN 301 549 V3.2.1** (chapters 9 web and 11 software; decision E-23). The stories below turn that target into checkable behavior at app level. Component-level rules (focus ring, 44 px targets, contrast, overlays) stay in `docs/guides/reference/design-system.md` (DS-15 to DS-20, DS-37, DS-38, DS-40) and the gates QG-U1 and QG-U5. The bracketed numbers name the WCAG 2.2 success criteria a criterion covers. The criteria of US-QS-08 to US-QS-12 are **standing criteria**: once done, they hold for every view, flow and control added later. The Definition of Done (FR-QG-10, item 11) and the gate QG-U7 (FR-QG-24) enforce them on every story, so accessibility is not a one-time effort.

### US-QS-08 · Operable by keyboard alone · 🟨 new

As a **plant keeper who cannot or does not want to use a pointer** I want to reach every function with the keyboard.

Acceptance criteria:

- Given any view, when I use only Tab, Shift+Tab, Enter, Space, Esc and the arrow keys, then I can reach and trigger every function the view offers, in an order that follows the visual reading order (2.1.1, 2.4.3).
- Given any view, when I press Tab first, then a "Zum Inhalt springen" link appears and moves the focus past the navigation to the main content (2.4.1).
- Given a focused element, when sticky parts (bottom navigation, header, open sheet) are shown, then the focused element is never completely hidden by them (2.4.11).
- Given a function that uses swiping or dragging (swipe suggestions in Discover, dragging a sheet, reordering), when I use the keyboard or a single tap, then the same result is reachable without the gesture (2.5.1, 2.5.7).
- Given any widget, when it has the focus, then the focus can always leave it again with the keys named above; there is no keyboard trap (2.1.2).
- Given an everyday flow (US-QS-07: measuring with photo, confirming watering or location, ticking off a treatment, Today list), when its end-to-end test runs, then a keyboard-only variant of the test passes (guardrail, P-06).

### US-QS-09 · Oriented and guided through the app · 🟨 new

As a **plant keeper using a screen reader, magnification or with limited concentration** I want to always know where I am and what comes next.

Acceptance criteria:

- Given any view, then it has a unique German page title ("Heute – PflanzenDex"), exactly one main heading and the regions header, navigation and main content (2.4.2, 1.3.1, 2.4.6).
- Given I change the view, when the new view has loaded, then the focus moves to its main heading and the new title is announced; going back restores the focus to the element that opened the view (2.4.3).
- Given a flow with more than one step (onboarding, creating a specimen, measuring with photo), then every step shows "Schritt n von m" and its name, going back keeps what I already entered, and I am never asked twice for data I gave in the same flow (3.3.7). The first-use flow and the staged functions follow epic ONB (US-ONB-01, US-ONB-05, US-ONB-06): locked entries stay visible with reason and way, the overview "Was die App kann" is in the help entry.
- Given a help or contact entry, then it is in the same place in every view (3.2.6), and navigation entries keep their order and names across views (3.2.3, 3.2.4).
- Given sign-in or sign-up, then no step requires solving a puzzle or remembering a code by heart; pasting passwords and codes and password managers work (3.3.8).
- Given a view has nothing to do, then it says so and names the next step (P-09), also for screen reader users.

### US-QS-10 · Changes are announced, not only shown · 🟨 new

As a **plant keeper using a screen reader** I want to hear what the app did, without losing my place.

Acceptance criteria:

- Given I save, delete or tick off something, when the operation finishes, then the result ("Gespeichert", "Behandlung abgehakt") is announced without moving the focus (4.1.3).
- Given I am offline, when a write action is buffered or delivered later (US-QS-03, US-QS-07), then both states are announced and visible as text (4.1.3, P-10).
- Given I submit a form with errors, then the focus moves to the first invalid field or to an error summary that links each field, and every error message names the field and how to fix it (3.3.1, 3.3.3; DS-38).
- Given a photo of a species or specimen, then it carries an alternative text with the species or specimen name and the date; purely decorative images are hidden from assistive technology (1.1.1).
- Given a chart (growth trend, zone distribution), then the same values are available as text or a table, and an unknown value reads "unbekannt", never an invented number (1.1.1, 1.3.1, P-08).
- Given a status shown as color, emoji or icon (care phase, etiolation, overdue), then the same status is also given as text that assistive technology reads (1.4.1, 1.3.3).

### US-QS-11 · Keyboard shortcuts · ⬜ new

As a **plant keeper working at a desktop** I want to reach the frequent actions with shortcuts.

Acceptance criteria:

- Given any view, when I press `?`, then an overview lists every shortcut available in this view and globally; it is also reachable from the help entry (US-QS-09).
- Given the global shortcuts (starting set, assumption: go to Today, collection, Pokédex and wishlist; search; new measurement), then they come from one central register; every shortcut action is also reachable through a visible control, and that control shows its shortcut.
- Given a shortcut made of a single character, then I can turn it off or change it to one with a modifier in my account settings, and it never fires while the focus is in a text field (2.1.4).
- Given a shortcut, then it does not take over keys that browsers, the operating system or screen readers use (for example Tab, Ctrl+L, Alt+arrow, the screen reader modifier keys); the register rejects such a key at build time (guardrail).
- Given a phone without a keyboard, then nothing depends on a shortcut.

### US-QS-12 · Adaptable display · 🟨 new

As a **plant keeper with low vision** I want to enlarge and adapt the display without losing content.

Acceptance criteria:

- Given a width of 320 CSS px or a browser zoom of 400 % on a 1280 px window, then every view works without horizontal scrolling and without cut-off content (1.4.10, 1.4.4); data tables follow the card pattern (DS-24).
- Given user-set text spacing (line height 1.5, paragraph spacing 2, letter spacing 0.12, word spacing 0.16 times the font size), then no text overlaps or is cut off (1.4.12).
- Given the device in portrait or landscape, then every view works in both (1.3.4).
- Given the system setting "reduce motion", then animations and transitions are off or reduced to a fade (2.3.3; DS-19).
- Given forced colors (Windows contrast themes) or the dark scheme, then focus indicator, borders of controls and status texts stay visible (1.4.11, 2.4.7).
- Given content that appears on hover or focus (tooltip), then it can be closed with Esc, stays while the pointer is over it and does not disappear by itself (1.4.13).

### US-QS-13 · Accessibility statement and feedback · ⬜ new

As a **plant keeper who meets a barrier** I want to report it and learn how accessible the app is.

Acceptance criteria:

- Given the app is open to external users (stage 2), then a page "Barrierefreiheit" states the conformance target (WCAG 2.1 AA, EN 301 549), the date and method of the last check, the known gaps with a workaround each, and a contact for feedback; it is reachable from every view (same place as help, US-QS-09).
- Given I report a barrier, then the report reaches the operator as an issue with the label `accessibility`, I get a confirmation, and the operator answers within a stated period (starting value: 14 days, assumption).
- Given a release into `main`, then the known gaps on the page match the open issues with the label `accessibility` (nothing disappears silently, P-10).
- Given the legal check of E-23 finds the app in scope of the BFSG, then the page also carries the information the BFSG requires for services, before the first external user.

### US-QS-14 · Modern, calm and fast-feeling interface · ⬜ new

As a **plant keeper** I want the app to look modern and feel quick on the phone and on a large screen, so that checking my plants is pleasant every day.

Acceptance criteria:

- Given a viewport of 360 px, then the main destinations are reached from a bottom bar with at most five items; from 768 px a navigation rail and from 1280 px a labelled sidebar show the same destinations from one list.
- Given my account has no role, when I open the app at 360 px, then the bottom bar shows the five destinations "Heute", "Sammlung", "Entdecken", "Freunde" and "Konto" and no "Mehr".
- Given my account has the role reviewer or operator, when I open the app at 360 px, then the bar still holds at most five slots: "Heute", "Sammlung", "Entdecken", "Freunde" and "Mehr", and the drawer "Mehr" holds "Konto" and the role-only entries "Prüfliste" and "Betreiber" (owner decision 2026-10-08, issue #607); from 768 px the rail and the sidebar show "Konto" and the role-only entries as separate items.
- Given light and dark mode, then every colour pair of the design tokens meets WCAG 2.1 AA (4.5:1 text, 3:1 boundaries and focus) and a test fails when a token has no checked pair.
- Given `prefers-reduced-motion: reduce`, then no non-essential motion runs (no route transition, no list entry, no swipe animation) and every state change is still visible.
- Given a screen change, a list that appears or a completed action, then the change is animated with the shared motion tokens (starting values: 120, 200 and 320 ms, assumption), using `transform` and `opacity` only.
- Given I open another view where the system supports it, then only the main content cross-fades to the new view over the slow motion token while the app bar and the navigation stay still; where it is not supported, or for a switch inside a view, the view changes at once, and in every case the focus moves to the new heading and the new title is announced as without motion (US-QS-09, US-QS-10).
- Given a list of cards appears, then each card rises and fades in over the base motion token without moving anything else on the page (no layout shift).
- Given the first load of the app, then the initial JavaScript stays within the budget of QG-U6 and the Lighthouse scores do not get worse than before the redesign; code for animation that only one screen needs loads with that screen.
- Given any view, then it keeps its next action for empty, error and loading states (P-09) and shows "unbekannt" for unknown values (P-08).
- Given the main destinations, then my plants (US-BES) and the species I caught or still miss (US-POK) are one destination "Sammlung" with a switch at the top between "Pflanzen", "Arten" and "Wunschliste"; there is no separate "Bestand", "Pokédex", "Wunschliste" or "Artenvergleich" destination and the page has one main heading.
- Given the destination "Sammlung", when I choose "Arten", then the species view shows, the address names the view so that back, forward and a copied link lead to the same view, and the species view is loaded only then.
- Given a link to the former address of the Pokédex (including any path below it), when I open it, then I land on the species view of the "Sammlung"; the former address of the collection still shows my plants.
- Given I chose a view before, when I open "Sammlung" without a view in the address, then the view from my last choice on this device shows; when the address names a view, then the address wins; when the device cannot remember (private mode), then the plants show and nothing breaks.
- Given I switch the view with the keyboard or a screen reader, then every choice is a target of at least 44 px, the selected one is marked by more than colour, the focus stays on the switch, and the new view is announced politely (US-QS-10).
- Given the destination "Sammlung", when I choose "Wunschliste", then my open wishes show ranked by the space need of their target zone with their actions (US-WUN-01, US-WUN-03, US-WUN-05), a wish with an unknown target zone stands at the end and says so (P-08), and the count line names the number of open wishes; the address names the mode, the mode is remembered per device and the address wins as for the other modes, and the wishlist is loaded only then. _Superseded in part by US-QS-22 (2026-10-29): the wishes are compact rows, paged, with the details in a layer; the ranking and the count line stay._
- Given the species view of the "Sammlung", when I choose the arrangement "Schwierigkeit", then the species with an active specimen show side by side, the easiest first, with "unbekannt" for a missing value (US-BES-05), under the same main heading; the address names the arrangement, and choosing "Pokédex" shows the caught and missing species again. _Superseded in part by US-QS-22 (2026-10-29): the species are compact entries, paged, side by side values open in a layer._
- Given a link or bookmark to the former addresses of "Wunschliste" or "Artenvergleich", when I open it, then I land on the wishlist mode or on the species view arranged by difficulty of the "Sammlung", the focus stays where it was, and the former addresses are no entries of the navigation.
- Given a missing species in the Pokédex offers "Auf die Wunschliste" (US-POK-09), when I choose it, then the wishlist mode of the "Sammlung" opens.
- Given I switch between the modes or the arrangements with the keyboard or a screen reader, then every choice is at least 44 px, the choice is marked by more than colour, the focus stays on the control and the new view is announced politely; a mode that is loading, empty or failing keeps its next action (P-09, P-10).
- Given the main destinations, then treatments (US-BEH) and the hints about incomplete plants (US-BES-08) are not destinations of their own: "Heute" shows them as sections after "Jetzt dran", in the order "Jetzt dran", "Behandlungen", "Fehlt noch", each named by a heading below the one main heading of the page.
  Superseded 2026-10-29 by US-QS-18: "Heute" no longer shows the topics as sections one below the other; each opens as a layer from a tile (`?sheet=treatments|watering|hints`), and the former anchors `/today#behandlungen`, `#giessen` and `#fehlt-noch` open that layer. The criteria below that speak of sections apply to the content of the layers.
- Given the section "Behandlungen", then I see the open dates by urgency with "Erledigt" (US-BEH-02, US-BEH-03), plan new ones in a form that opens as a sheet on a phone and as a dialog on a large screen (US-BEH-01), and reach the done treatments per plant (US-BEH-03).
- Given the section "Fehlt noch", then each hint names what is missing and offers the action that fixes it, including choosing a location for a plant without one right there (US-BES-08, US-PHA-03).
- Given a link or bookmark to the former addresses of "Behandlung" or "Hinweise", when I open it, then I land on "Heute" at the matching section, the section name is announced politely and the focus is on its heading; the former addresses are no entries of the navigation.
- Given one of the sections is empty, fails to load or is loading, then it shows that state with its next action (P-09, P-10) while the other sections stay usable.
- Given "Heute" is opened, then the sections load as their own parts, so the initial JavaScript does not carry them (QG-U6).
- Given the main destinations, then "Konto" and "Einstellungen" are one destination "Konto" with one main heading and the sections "Profil" (name, e-mail, ways to sign out; US-ACC-01) and "Einstellungen" (display name, time zone, notifications, privacy; US-ACC-02) in this order, each named by a heading below the main heading; "Einstellungen" is no entry of the navigation. Superseded by US-QS-17 (2026-10-29): "Konto" is an index of its sections, each a view of its own.
- Given a wide screen (1280 px), then a list of the sections beside them links to each section and marks the current one by more than colour; on a small screen the sections are stacked without the list. Superseded by US-QS-17 (2026-10-29): the index stands beside the open section at 1280 px and nothing is stacked.
- Given a link or bookmark to the former address of "Einstellungen", when I open it, then I land on "Konto" at the section "Einstellungen", the section name is announced politely and the focus is on its heading.
- Given the section "Einstellungen" fails to load or is loading, then it shows that state with its next action (P-09, P-10) while the section "Profil" stays usable; saving settings works as before (US-ACC-02).
- Given "Konto" is opened, then the settings load as their own part, so the initial JavaScript does not carry them (QG-U6). Invitations to friends stay in "Freunde" (US-SOZ); "Konto" has no section for them.
- Given the main destinations, then care phases (US-PHA-01, US-PHA-03), the own care profile (US-BES-09) and locations and light zones (US-LIC) are not destinations of their own: "Pflegephasen", "Pflegeprofil" and "Standorte und Licht" are no entries of the navigation.
- Given the view "Pflanzen" of the "Sammlung", then below the switch I can group my plants "Alle", "Nach Pflegephase" or "Nach Standort", the address names the grouping so that back, forward and a copied link lead to the same view, and the choice keeps the focus on the control and is announced politely. _Superseded by US-QS-19 (2026-10-29): the grouping is chosen in the layer "Ansicht" (`?sheet=view`), not below the switch; the groups are chosen from a row and their plants are paged instead of stacked._
- Given I choose "Nach Pflegephase", then the expected phase and the target location per plant show as before, including "Jetzt umgestellt" (US-PHA-01, US-PHA-03), under the same main heading, and the count line names the number of plants with a phase; with no plant that has a phase, the view says what to do next (P-09).
- Given I choose "Nach Standort", then my plants stand in groups, one per location in alphabetical order, each heading naming the location, its light zone and the number of plants; plants without a known location form the last group "Standort unbekannt", and an unknown zone reads "Zone unbekannt" (P-08, P-10). _Superseded by US-QS-19 (2026-10-29) where it stacks all groups: the groups are chosen from a row of choices with their counts and one group pages at a time; the order, the names "Standort unbekannt" and "Zone unbekannt" stay._
- Given the view "Pflanzen", when I choose "Standorte verwalten" (US-QS-19: "Standorte und Lichtzonen verwalten" in the layer "Ansicht"), then the existing management of locations and light zones opens inside the "Sammlung" as a view of its own with its heading, a button "Zurück zur Sammlung" and its own empty, loading and error states with their next actions (US-LIC, P-09, P-10); the address names the open view, back leads to the plants with the same grouping, and the focus moves to the heading of the view that appears.
- Given the section "Einstellungen" of "Konto", then it ends with a link "Standorte und Lichtzonen verwalten" that opens this management in the "Sammlung".
- Given the profile of a species (in the catalog, reached from the species view of the "Sammlung"), then below the profile a section "Mein Pflegeprofil" shows the catalog value and my deviation side by side for this species only (US-BES-09); when I keep no specimen of the species, the section says so and names the next action (create a specimen with "Diese Art wählen"), and the section loads as its own part.
- Given a link or bookmark to the former addresses of "Pflegephasen", "Pflegeprofil" or "Standorte und Licht", when I open it, then I land on the plants grouped by care phase, on the species view of the "Sammlung" (the entry point to the species and so to the care profile of a species; a keeper without a chosen species finds the next step there) or on the plants with the management of locations open, the focus stays where it was, and the former addresses are no entries of the navigation.
- Given the "Sammlung" is opened, then the management of locations and light zones, the care phases and the care profile load only when they are chosen, so the initial JavaScript does not carry them (QG-U6).
- Given the main destinations, then the species catalog (US-BES-01) is not a destination of its own: "Arten" is no entry of the navigation, and "Entdecken" has a switch at the top between "Vorschläge" (the suggestion cards, US-ENT-01) and "Katalog" (search, species profiles and the proposal of a species), under one main heading "Entdecken".
- Given the destination "Entdecken", when I open it, then the mode comes from the address (`view=suggestions` or `view=catalog`), else from the last choice remembered on this device, else it is "Vorschläge"; the address wins over the memory, an unknown value counts as missing, and a storage that fails changes nothing.
- Given the destination "Entdecken", when I choose a mode, then the address names it so that back, forward and a copied link lead to the same mode, the choice is remembered on this device, announced politely, and the focus stays on the control; the switch is two toggle buttons reachable and operable by keyboard, each a target of at least 44 px.
- Given the mode "Katalog", then the names of the search, of a species profile and of the proposal are section headings (h2) below the main heading, and the species chosen with "Diese Art wählen" still leads to the form of a specimen (US-BES-02), also on the way from a bought wish (US-WUN-05).
- Given a link or bookmark to the former address of "Arten" (`/species`), when I open it, then I land on "Entdecken" in the mode "Katalog", the address is replaced (back does not return to it), the focus stays where it was, and the former address is no entry of the navigation.
- Given a link or bookmark to the profile of one species below the former address (`/species/<id>`), when I open it, then the same profile opens at `/discover/species/<id>` (decision: the profile keeps being a page of its own with a way back, it moves below "Entdecken" so that "Entdecken" stays the current destination and the page title "Artenprofil" is unchanged); links inside the app (Pokédex, wishes) use the new address.
- Given "Entdecken" is opened, then the suggestion cards and the catalog load only when they are chosen, so the initial JavaScript does not carry them (QG-U6); an animation library for the cards would load only with the suggestions (ADR 0011).
- Given the component catalog (Storybook), then page stories show the real screens "Heute", "Sammlung" (each mode), "Entdecken" (each mode), "Freunde" and "Konto" with fixture data and no network, in light and dark and at 360 px and 1280 px; they pass the conformance run (QG-U5) and are not part of the production bundle.

Decision and tokens: ADR [0011](../../adr/0011-redesign-direction-greenhouse.md), E-24.

### US-QS-15 · One screen per layer · 🟨 new

As a **plant keeper** I want every main destination to fit on one screen and open its topics as layers above it, so that I find things without scrolling through a long page.

Acceptance criteria:

- Given a viewport of 360 x 640 px or larger (starting value, assumption), when I open a main destination, then its overview fits between the app bar and the navigation without page scroll and shows a summary, the next action (P-09) and at most 6 entries into its topics (starting value, assumption).
- Given an overview, when I open a topic, then it opens as a layer above it (a bottom sheet below 768 px, a pane beside the list from 1024 px; a dialog in between); the address names the layer (`?sheet=<topic>`), so Back closes it and a reload or a copied link reopens it; focus moves to the layer heading and returns to the control that opened it when it closes; Escape closes it.
- Given a list longer than its region (plants, species, wishes, offers, friends), then it shows pages of whole entries with "Zurück" and "Weiter", the position "Seite n von m", and swipe as an alternative to the buttons (threshold 48 px, starting value, assumption); the page is in the address (`?page=n`); a page outside the range shows the nearest valid one; a changed filter or search starts at page 1; the new page is announced politely.
- Given one object (plant, friend, offer), when I open it, then its detail is a layer with tabs instead of one long column, and the active tab is in the address.
- Given a layer, then it has at most one filled primary action; other actions are outline buttons, rows or tiles.
- Given help text in a layer, then at most one line shows; more opens behind "Mehr erfahren".
- Given free text longer than its region (privacy notice, accessibility statement, AI log), then only that region scrolls and it does not pass the scroll on to the page. Forms are not an exception (owner decision 2026-10-30): a long form is split into groups that open as layers, as the settings do (US-QS-17).
- Given 400 % zoom or 200 % text size, then content that no longer fits scrolls inside its region instead of being cut off (WCAG 1.4.4, 1.4.10); this is the one exception to "no page scroll".
- Given `prefers-reduced-motion: reduce`, then layers and pages change without sliding.
- Given a number with its unit or a count, then number and unit never break apart and digits in counts and measurements are tabular.

State of implementation: the building blocks exist in `app/packages/web` (`LayerSheet` and `useLayer` for the layers, `LayerHost` as the frame of a destination with layers, `Pager` for the pages, the attribute `data-fit-screen` for the one-screen frame (DS-61, CSS only; the shell knows no routes), `RouteFocus` ignoring `?sheet`, `?page` and `?lpage` so a layer or a page change never moves the focus to the heading (one fix, tested with Escape returning to the opener), touch defaults in the base layer; rules DS-58 to DS-63 in the design system reference), with tests and stories. No destination uses them yet, so every criterion stays open until the destinations are converted (the objects with tabs, the help text rule and the unit rule come with those conversions). Status 🟨 because the building blocks are in place. "Heute" is the first destination to use them (US-QS-18). Measured 2026-10-30 at 360×640 with 50 plants: the views did not yet fit (ratio of content to available height up to 1.78); fixed in #976 (the frame rule had nested `:has`, which browsers drop; it is now valid), to be measured again after the merge. Final measurement 2026-10-30 on `dev` fa489e92 (`docs/records/test-logs/qs-one-screen.md`): 50 of 50 views and layers fit 360×640 and 390×844 without page or inner scroll, and from 1024 px every layer opens as a 384 px pane beside the content (5 of 5). At 200 % text every destination scrolls inside its region and the Entdecken card no longer clips (#1008), but four views still break horizontally (#1019), so the status stays 🟨. Issue #1026 (2026-10-30): from 1024 px each destination with layers renders one `LayerHost` frame at its top (Heute, Sammlung, Entdecken, Freunde, Einstellungen and the species profile), and an open layer's pane starts at the top of the content and is as tall as the viewport less the frame's padding; the Einstellungen layers sit beside the settings list, and while one is open at 1280 px the Konto index yields to keep the list readable. Known open case: with a pane open, the Sammlung wishlist can still scroll the page at 1440 px because its list column is 320 px wide; this waits for the wider shell cap (#1027).

### US-QS-16 · "Heute" is the home screen · 🟨 new

As a **plant keeper** I want the app to open on "Heute", so that I see at once what needs my care and the introduction, hints and locked functions are not a page of their own that I have to leave first.

Decision (owner, 2026-10-29, after a UI review): the former start page "Start" is dropped; its onboarding parts (US-ONB-01, US-ONB-05, US-ONB-07) moved to "Heute".

Acceptance criteria:

- Given I am signed in, when I open the app, its address `/` or the product name in the app bar, then "Heute" shows; `/` is replaced by `/today` (Back does not return to `/`), and no view is called "Start" any more.
- Given a new account without a plant, when I open "Heute", then the first-plant guide shows in place of the day's tasks, with the same steps and "Überspringen" as before (US-ONB-01); after skipping, "Heute" shows the day's tasks, after saving the guide names the next step as before.
- Given a calm hint is due (US-ONB-07: `first_plant_saved`, `function_unlocked`), then it shows on "Heute" as the same quiet note with "Okay", above the day's tasks, with the same rules (calm mode, style, 7 days, dismissal per account).
- Given announced locked functions (US-ONB-05), then "Heute" lists them as before as rows "Noch nicht geöffnet" with mark and way, below the day's tasks; calm mode and switched-off functions show nothing.
- Given a link or bookmark to `/`, then it lands on "Heute"; the unknown-address fallback leads to "Heute" too.
- Given "Heute" is opened, then the introduction loads as its own chunk with "Heute" and the hint note only when a hint is due, so the initial JavaScript does not carry them (QG-U6). Assumption: the guide itself is part of the introduction chunk, because a separate chunk for it pushed the initial bundle over its budget by 0.4 kB (nested lazy loading, 2026-10-29); revisit when the budget is reviewed.
- Given the number of plants cannot be read, then "Heute" still shows the day's tasks without the introduction, so the view is never blank (P-10).

State of implementation: `/` and the fallback are `<Navigate to="/today" replace />` in `routes.tsx`; the brand link leads to `PATHS.today` with the name "PflanzenDéx, zu Heute"; the view `start` and `PATHS.start` are gone. `TodayIntro` (`web/src/shell/today-intro`) wraps the sections of `TodayArea`: guide (`first-plant-guide`), note (`HintNote`, own chunk), `LockedRows`. Measured 2026-10-30 (`docs/records/test-logs/qs-one-screen.md`): "Heute" fits 360×640 and 390×844. Status 🟨: the first-plant guide does not have its own chunk yet (initial bundle budget).

### US-QS-17 · "Konto" is an index of its sections · 🟨 new

As a **plant keeper** I want "Konto" to be a short list of its parts instead of eight stacked sections, so that I find a setting without scrolling a long page on my phone (owner decision 2026-10-29, after a UI review that measured 14 phone screens).

Acceptance criteria:

- Given I open "Konto" on a phone (360x640 px, starting value, assumption), then it fits without page scroll: a profile row (name, e-mail), the sections as rows, each with its name and its current value where one exists (Einstellungen: display name and time zone; Erinnerungen: on or off; Erfolge: hidden in calm mode or the count; KI-Clients: the number of clients; the others without a value), and a row "Abmelden…"; an unknown value reads "unbekannt" (P-08).
- When I choose a row, then the section opens as a view of its own at `/account/<section>` (`profile`, `settings`, `achievements`, `reminders`, `ai-clients`, `measured`, `functions`, `data`) with one main heading, a way back "Konto" and the focus on its heading; Back returns to the index with the focus on the row I came from.
- Given a link or bookmark to a former address `/account#<anchor>`, when I open it, then the matching section opens and the address is replaced (back does not return to it).
- Given "Abmelden…", when I choose it, then a confirmation opens (sheet on a phone, dialog on a large screen) with "Abmelden", "Auf allen Geräten abmelden" and a way to cancel.
- Given a wide screen (1280 px), then the index stands beside the open section and marks the current one by more than colour.
- Given a section is loading, empty or failing, then it shows that state with its next action (P-09, P-10); each section loads as its own part (QG-U6).
- Given the section "Einstellungen" (owner decision 2026-10-30, option B), then it fits 360x640 px without page scroll as a list of six groups, each row with its name and its current value: "Profil" (display name and time zone), "Benachrichtigungen" ("n von m an"), "Datenschutz und Empfehlungen" ("Standard" or what is on), "Wie nutzt du die App?" (the chosen style, with calm mode while it is on), "Wunschliste" ("mind. n je Zone") and "Licht" ("Standard-Schwellen" or "eigene Schwellen"), plus the link "Standorte und Lichtzonen verwalten"; an unknown value reads "unbekannt" (P-08). Forms are no exception to US-QS-15's rule of one screen: its single scroll exception stays long free text.
- When I choose a group, then it opens as a layer (US-QS-15) at `?sheet=profile|notifications|privacy|style|wishlist|light`, so Back closes it and a reload or copied link reopens it; a closed layer loads nothing. Switches (notifications, privacy and recommendations, calm mode, the style choice) save at once and confirm it; "Profil", "Wunschliste" and "Licht" have their own "Speichern" and send the stored profile with only their fields changed (the API saves the profile as a whole). The privacy layer shows one line of help and the rest behind "Mehr erfahren".
- Given a group is loading or failing, then the state shows in its row or layer only, with the German text of the error code (P-10); a refused save keeps the input or the switch where it was.
- Given any view, then no footer line shows the version; the section "Was die App kann" shows the app version ("unbekannt" when it is not known, P-08).

State of implementation: measured 2026-10-30: the index was 1.13 at 360×640; its rows are now denser (44 px targets, no gap) with a smaller profile row (#976). Final measurement 2026-10-30 (`docs/records/test-logs/qs-one-screen.md`): the index, the list of six groups and all six group layers fit 360×640 and 390×844; at 200 % text the row labels stay at 15 px (#1019). Status 🟨 until that fix, a real phone and a screen reader pass (#638, #636).

### US-QS-18 · "Heute" fits one screen and opens its topics as layers · 🟨 new

As a **plant keeper** I want "Heute" to show what needs my care on one screen and open each topic as a layer, so that I see the day at a glance instead of scrolling through a long page.

Decision (owner, 2026-10-29, after a UI review): no page scroll, layered content, long lists paged. "Heute" was 6.8 phone screens long (treatments, watering and hints as sections, one identical warning card per overdue treatment).

Acceptance criteria:

- Given a viewport of 360 x 640 px (starting value, assumption), when I open "Heute" with open items, then it fits without page scroll and shows the date, a summary of the open items per category (counts as text, colour only as an extra cue), the single most urgent item ("Jetzt dran") with its action, and one tile per category ("Behandeln", "Gießen", "Fehlt noch") with its count; further tasks of the day's list (phase deviations, etiolated plants, buffer, equipment checks) are one opener "Weitere Aufgaben" with their count (`?sheet=tasks`).
- Given I choose a tile, then its items open as a layer (`?sheet=treatments|watering|hints`) using the layer of US-QS-15, ordered by urgency and paged (starting values: 3 treatments, 4 plants to water, 3 hints per page) when they do not fit; each item keeps its existing actions ("Erledigt" and planning, US-BEH-01 to US-BEH-03; "Gegossen", US-MON-05; fixing a hint, US-BES-08, US-PHA-03).
- Given a former section address `/today#behandlungen`, `/today#giessen` or `/today#fehlt-noch`, or the former addresses of "Behandlung" and "Hinweise", when I open it, then the matching layer opens and the address is replaced; an unknown anchor changes nothing.
- Given an overdue item, then its state is a short chip ("10 Tage überfällig") instead of a repeated heading and sentence; number and unit never break apart (non-breaking space) and digits in counts are tabular.
- Given nothing is open, then "Heute" says so and names the next step (P-09); a category that is loading or fails keeps its state on its tile and in its layer with a retry (P-10) while the rest stays usable.
- Given the introduction of US-QS-16 applies (new account, calm hint, locked functions), then it still shows on "Heute"; the locked functions are one row "n Funktionen noch nicht geöffnet" that opens a layer (`?sheet=locked`) with the rows (US-ONB-05).
- Given a wide screen (from 1024 px), then the open layer stands beside the overview as a pane.

State of implementation: `TodayArea` (`web/src/components/routing/areas/today-area`) shows `TodayPage` (the `today` module: title, date, most urgent item, opener for the rest) with a summary and tiles (`today-overview`) and holds the layers `LayerSheet` for `treatments` (`TreatmentsPage host`), `watering` (`WateringList`) and `hints` (`HintsPage host`); their lists use `Pager`. The counts come from the same requests as the lists (the `count` mode of `TreatmentsPage`, `WateringList` and `HintsPage`, one cached copy each), so no new API route exists. `TodayArea` marks its root with `data-fit-screen`. `CollapsedLockedRows` (`shell/unlock`) is the row and its layer; it lives in the chunk of the introduction because the initial bundle has no headroom (QG-U6). Measured 2026-10-30: 1.78 at 360×640; "Jetzt dran" is now one compact row (chip, short text, one action; the date once, small) and the repeated lines are gone, the tiles are one row of three, the anniversary is a compact row and the further tasks share one row with the later treatments, so everything stands above the fold (#976). Final measurement 2026-10-30 (`docs/records/test-logs/qs-one-screen.md`): "Heute" and its three layers fit 360×640 and 390×844; at 200 % text the chip of "Jetzt dran" is squeezed beside its button (#1019). Status 🟨 until that fix, a real phone and a screen reader pass (#638, #636).

### US-QS-19 · Sammlung "Pflanzen" fits one screen with paged tiles · 🟨 new

As a **plant keeper** I want my plants as a page of compact tiles instead of a long column of cards, so that I see my collection at a glance on the phone without scrolling.

Decision (owner, 2026-10-29, after a UI review): the mode "Pflanzen" was 27 phone screens for 50 plants; long lists are paged (US-QS-15), not scrolled. Arten, Wunschliste and Equipment are not part of this story.

Acceptance criteria:

- Given a viewport of 360 x 640 px (starting value, assumption), when I open the mode "Pflanzen", then it fits without page scroll: the heading with the count, one row of modes, one insight row about the light zones and a page of compact plant tiles.
- Given the tiles, then each shows the photo or the initial of the name, the name, the light zone as text and one state ("Behandeln" for an open treatment, "Vergeilt/dünn", "Gesund", or "unbekannt" when there is no measurement, P-08); the plants are paged with `Pager` (page size 6 below 768 px, 12 from 768 px, 16 from 1024 px; starting values, assumption) and the page is in the address.
- When I choose "Ansicht", then a layer (`?sheet=view`) holds the grouping ("Alle", "Nach Pflegephase", "Nach Standort"; still in the address as `group=`), the sorting if one exists (none yet) and "Standorte und Lichtzonen verwalten"; a changed grouping starts at page 1.
- Given a grouping, then I choose the group from a row of choices, each with its count ("Standort unbekannt" and "Zone unbekannt" as before; the care phases for "Nach Pflegephase"), the group is in the address (`part=`), and its plants page as above; "Jetzt umgestellt" of the phase grouping keeps working (US-PHA-03).
- When I choose the light-zone insight row, then a layer (`?sheet=zones`) shows the distribution per zone with the thinnest zone named in text, the note about cutting light in one line and the way to the management.
- When I choose a tile, then the plant opens the way it does today, with its card and the same actions, as a layer (`?sheet=plant-<id>`); a detail layer with tabs is a later story (US-QS-15). _Superseded by US-QS-23 (2026-10-29): the layer has tabs instead of the long card._
- Given archived plants, then the insight row also leads to the archive in a layer (`?sheet=archive`), so nothing disappears silently (P-10).
- Given no plant, loading or an error, then the mode shows that state with its next action (P-09, P-10).

State of implementation: `PlantsScreen` (`web/src/collection/plants-screen`) with `PlantTile`, the layer "Ansicht" and the zone insight; `PagedGroups` (`components/shared/responsive/paged-groups`, with the row `GroupChoices`) holds the groups and their pages and is reused for the care phases; `Pager` got `listClassName` for a grid. The mode "Pflanzen" asks the frame to fit one screen with `data-fit-screen` (CSS `:has` in `tokens.css`), so the app shell needs no code for it (QG-U6). The module `collection` exports `CollectionPage`, `PlantsViewOpener` and `PlantsViewLayer` as plain lazy wrappers (no `part` switch); `care` imports `PagedGroups` directly. Final measurement 2026-10-30 (`docs/records/test-logs/qs-one-screen.md`): the mode and its layers "Lichtzonen" and "Ansicht" fit 360×640 and 390×844; at 200 % text the mode switch, the header action, the tiles and "Weiter" leave the screen horizontally (#1019). Status 🟨 until that fix, a real phone and a screen reader pass (#638, #636).

### US-QS-20 · "Freunde" fits one screen and opens its parts as layers · 🟨 new

As a **plant keeper** I want "Freunde" to show what matters on one screen and open each part as a layer, so that I add a friend or answer a request without scrolling through a page of four sections (US-QS-15).

Decision (owner, 2026-10-29, after a UI review): the page of 13.6 phone screens becomes an overview; invitation, request, news, friends and sharing are layers. The exchange (US-SOZ-09) and the match deck (US-TAU-01) keep their views.

Acceptance criteria:

- Given 360 x 640 px (starting value, assumption), when I open "Freunde", then it fits without page scroll and shows: the heading, one filled action "Freund hinzufügen", tiles "Anfragen" and "Neu bei Freunden" with counts and tiles "Tauschbörse" and "Passende Angebote", a row "Meine Freunde" with the number of friends, a row "Was Freunde sehen" with the current choice ("Alles privat" or "n von m Exemplaren geteilt"), and one line of help ("Ohne deine Freigabe sieht niemand etwas.") with "Mehr erfahren". The tiles for the exchange and the matching offers show no count, because the swap data is not loaded here (assumption).
- Given "Mehr erfahren", then the full explanation of friends and sharing opens as a layer (`?sheet=help`).
- Given I choose "Freund hinzufügen", then a layer (`?sheet=add`) offers "Einladen" (create and copy the code, US-SOZ-01) and "Code eingeben" (send a request) as two tabs with the existing behaviour; a refused code shows its German text by code at the field (FR-QG-11, P-10).
- Given I choose "Anfragen", "Neu bei Freunden", "Meine Freunde" or "Was Freunde sehen", then each opens as a layer (`?sheet=requests|news|friends|sharing`) with the existing content (US-SOZ-02 to US-SOZ-05); lists longer than the layer are paged with the pager (US-QS-15); a layer loads its data only while it is open.
- Given "Tauschbörse" or "Passende Angebote", then they lead to their existing views and show the count of the open offers of friends and of the offers that match my wishlist; while a count loads or fails, the tile says so (P-10).
- Given calm mode (US-ACH-08, US-TAU-07), then the tiles show their names without counts.
- Given a function that is locked (US-ONB-05), then its tile keeps its place, carries the text mark of the navigation ("Noch gesperrt" or "Bald") instead of a count and leads to the lock page at its address, as the address does.
- Given no friend yet, then the screen says so and names "Freund hinzufügen" as the next step (P-09); a part that is loading or fails to load shows that state (P-10).
- Given a layer, then it has at most one filled primary action: "Annehmen" is the quiet filled kind of button and the other actions are outline buttons (US-QS-15).

State of implementation: `FriendsPage` (`web/src/social/pages/friends-page`) with `friend-tiles` and `friend-layers`; calm mode arrives through `CalmGate` (`components/routing/areas/shared/simple-routes/calm-gate`, shared with the match deck), and the route of "Freunde" moved into `socialRoutes`. The page marks its root with `data-fit-screen`. The tiles "Tauschbörse" and "Passende Angebote" show the count of the open offers of friends (`GET /exchange/offers`) and of the matching cards (`GET /exchange/match`), the same existing requests as their views, none in calm mode and none while "Tauschen" is locked; the route keys in `socialRoutes` are `exchange`, `match` and `friends`. Status 🟨 until a real phone check. Final measurement 2026-10-30 (`docs/records/test-logs/qs-one-screen.md`): "Freunde" and the layer "Freund hinzufügen" fit 360×640 and 390×844, and nothing is clipped at 200 % text. Status 🟨 until a real phone and a screen reader pass (#638, #636).

### US-QS-21 · "Entdecken" fits one screen and opens its parts as layers · 🟨 new

As a **plant keeper** I want "Entdecken" to fit one screen in both modes and to open filters and the proposal as layers, so that I search the catalog without scrolling a page that was 3.5 phone screens long (owner decision 2026-10-29, after a UI review; applies US-QS-15 to US-QS-14).

Acceptance criteria:

- Given a viewport of 360x640 px (starting value, assumption), when I open "Entdecken" in either mode ("Vorschläge" or "Katalog"), then it fits without page scroll: the heading, the mode switch and the content of the mode.
- Given "Katalog", then the search field and a page of compact results (name, scientific name and one fact each) show; the results are paged with the pager of US-QS-15 and the page is in the address (`?page=n`); a new search or a changed filter starts at page 1; the filters live in a layer (`?sheet=filters`) and the chosen ones show as removable chips.
- When I choose a result, then the species profile opens as before (its own page with a way back, US-QS-14), and "Diese Art wählen" still leads to the form of a specimen (US-BES-02).
- Given "Art vorschlagen", then the proposal form opens as a layer (`?sheet=propose`) with one filled primary action; a refusal shows its text by error code (FR-QG-11).
- Given "Vorschläge", then the deck stays as it is, its empty state names the next action (P-09), and help is one line.
- Given no result, loading or an error, then the region shows that state with its next action (P-09, P-10).

State of implementation: in the mode "Katalog" (`SpeciesSearch`, `HitList` with three rows per page as a starting value, `FiltersLayer` with difficulty and "Nur meine Vorschläge" applied to the loaded hits, `FilterChips`, the proposal in a `LayerSheet`) the criteria for the search, paging, filters, chips and the proposal layer are implemented and tested. The fit at 360x640 px was calculated from the row heights, not yet measured in a browser, and the mode "Vorschläge" was not changed (its deck fitted already), so the status stays 🟨. Measured 2026-10-30: 1.75 at 360×640; the card now takes the remaining height, the photo shrinks first, collapsed it shows the essentials with "Mehr" for facts, sources and reasons, and "Nein / Später / Ja" stay in view (#976). Final measurement 2026-10-30 (`docs/records/test-logs/qs-one-screen.md`): "Vorschläge" and "Katalog" fit 360×640 and 390×844; at 200 % text the suggestion card scrolls with its buttons (#1007, #1008), while in "Katalog" "Art vorschlagen" is cut off and the search field shrinks (#1019). Status 🟨 until that fix, a real phone and a screen reader pass (#638, #636).

### US-QS-22 · Sammlung "Arten", "Wunschliste" and "Equipment" fit one screen · 🟨 new

As a **plant keeper** I want the modes "Arten", "Wunschliste" and "Equipment" to show a page of compact entries and open everything else as a layer, so that I find a species, a wish or my equipment without scrolling through a screen full of blocks (US-QS-15).

Decision (owner, 2026-10-29, after a UI review): "Arten" was 10.7 phone screens (a three-line progress block, search, chips with a paragraph about the ones that do not work yet, tall collector cards), "Wunschliste" 2.6 and "Equipment" several sections. Long lists are paged, not scrolled; help text is one line; each layer has one filled primary action. The plant detail is not part of this story (US-QS-23).

Acceptance criteria:

- Given a viewport of 360 x 640 px (starting value, assumption), when I open "Arten", "Wunschliste" or "Equipment", then the mode fits without page scroll: the heading with its count line, the mode row, one row of controls and a page of compact entries (or tiles).
- Given "Arten", then the progress is one row ("Blüher · 41 gefangen"; the total only when it is known, otherwise one line says that it follows once the species tree exists, P-08); the row opens the layer "Fortschritt" (`?sheet=progress`) with the rank bar, the next rank, the orders and the milestones.
- Given "Arten", then search and the button "Filter" sit in one row; a filter that cannot be used yet ("Fehlend", "Artenarm") is not shown as a chip, its reason is in the layer "Filter" (`?sheet=filters`), which also holds the chips "Alle", "Gefangen" (and "Artenarm" once the genus counts exist) and the sorting.
- Given the caught species, then each is a compact entry (name, German name where known, catch date) and the entries are paged with `Pager`; the sorting "Familie" groups them with `PagedGroups` and keeps the count "n / m" with m "unbekannt" without the tree (P-08); a species opens its details as a layer (`?sheet=species-<name>`, decision: a layer, not the former in-place view) with the link "Zum Artprofil"; the detail layer replaces the former history handling of the in-place view.
- Given the collector cards of the species tree (US-POK-01), then they are a row "Sammlerkarten" with their number that opens the layer `?sheet=cards`, where the cards are paged; species that do not count yet (US-POK-06) are a row "Noch nicht gezählt" with their number that opens a layer (`?sheet=uncounted`) naming the next action of each.
- Given the arrangement "Schwierigkeit", then the species are compact entries (name, difficulty, light zone), the easiest first, paged the same way; a species opens its comparison values (botanical name, watering, substrate, pruning, success criterion; "unbekannt" for a missing value, US-BES-05) as a layer.
- Given "Wunschliste", then the open wishes are compact rows ranked as before (US-WUN-01, US-WUN-03, US-WUN-05), each with its rank, title, target zone, difficulty and its actions "Gekauft" and "Verwerfen", paged; a row opens the full card (picture, reasoning, why it stands here, "Bild speichern", sharing with friends) as a layer (`?sheet=wish-<id>`).
- Given "Wunschliste", then "Wunsch erfassen" is the one filled primary action and opens the form as a layer (`?sheet=new-wish`); the bought and the discarded wishes (`?sheet=bought`, `?sheet=discarded`) and the hints about duplicate, unfitting and replenished wishes (`?sheet=hints`, with a count) are outline buttons in the same row and open layers with their existing content; nothing is hidden without a way to it (P-10).
- Given "Equipment", then its parts are tiles with counts on one screen: "Equipment" (what I own), "Kosten", "Bedarf", "Lampen und Zonen", "Sensoren" and "Wünsche"; each opens a layer (`?sheet=items|costs|needs|lamps|sensors|wishes`) with its existing content, long lists paged; "Equipment erfassen" is the one filled primary action and opens the form as a layer (`?sheet=new`); "Gekauft" on an equipment wish opens that form prefilled (US-EQU-08).
- Given a layer with a list, then the list is paged with its own address part (`?lpage=n`) so that it does not compete with the page of the screen behind it; a layer mounts its content and loads its data only while it is open.
- Given a mode that is empty, loading or failing, then it shows that state with its next action (P-09, P-10): "Art fangen" or "Exemplar anlegen" for the species, "Wunsch erfassen" for the wishes, "Equipment erfassen" for the equipment.
- Given a layer, then it has at most one filled primary action (US-QS-15).

State of implementation: the modes use `Pager` and `LayerSheet`; the screens are `PokedexPage`, `DifficultyPage`, `WishlistPage` and `EquipmentPage` in their modules; `CollectionArea` asks the frame to fit one screen for every mode (`data-fit-screen`, as US-QS-19). Equipment belongs to the epic EQU and ships with R5; its screen layout ships with the other modes because the mode exists in the "Sammlung" already. Status 🟨 until a real phone check. Measured 2026-10-30: 1.20 at 360×640; the progress is one line (details in its layer), the arrangement is a select beside the title, and species entries have a neutral border with a chevron (ADR 0017, #976). Final measurement 2026-10-30 (`docs/records/test-logs/qs-one-screen.md`): "Arten", "Wunschliste" and "Equipment" fit 360×640 and 390×844; at 200 % text the mode switch and "Weiter" leave the screen horizontally (#1019). Status 🟨 until that fix, a real phone and a screen reader pass (#638, #636).

### US-QS-23 · A plant opens as a layer with tabs · 🟨 new

As a **plant keeper** I want a plant to open as a layer with tabs, so that next to the plant I measure, water or treat it with one hand and find the rest one layer deeper, without scrolling through one long card (US-QS-15, P-11).

Decision (owner, 2026-10-29, after a UI review): layered content (overview, then topic, then detail, then action), one filled primary action per layer, no page scroll. The long card of US-BES-06 is replaced by the tabs; what it showed and did stays reachable.

Acceptance criteria:

- Given the plants of the Sammlung, when I choose a tile, then the plant opens as a layer (`?sheet=plant-<id>`, as before) with the name, its chips (light zone, location, open treatment; an unknown value reads "Zone unbekannt" or "Standort unbekannt", P-08) and the tabs "Überblick", "Verlauf", "Pflege" and "Standort"; the active tab is in the address (`&tab=ueberblick|verlauf|pflege|standort`, an absent or unknown value means "Überblick"), a tab change replaces the entry so Back leaves the layer in one step, and a reload or a copied link opens the same tab.
- Given "Überblick", then it fits the layer without scroll on a phone (360 x 640 px, starting value, assumption) and shows: the latest photo or a placeholder as a thumbnail, the last measurement with its date, the growth trend from the own history only (P-08, never against species averages; etiolated growth never counts as success), the state, the open treatment, the species and status, and one filled primary action "Messen"; "Gießen" (US-MON-05) and "Behandeln" are outline buttons, and "Behandeln" leads to the tab "Pflege".
- Given "Verlauf", then the measurements and their photos are paged with `Pager` (3 per page, starting value, assumption), newest first; the page has its own address part (`verlauf=n`), so the list behind the layer keeps its page.
- Given "Pflege", then the open treatments of this plant (with "Erledigt", US-BEH-02, US-BEH-03), the planning of a treatment with this plant ticked (US-BEH-01), the done treatments, the care phase with "Jetzt umgestellt" (US-PHA-01, US-PHA-03) and the own care profile of its species (US-BES-09) show with their existing actions; a plant without a care phase reads "unbekannt" and says where to enter the period.
- Given "Standort", then the location and the light zone with its source show ("unbekannt" where unknown), with the actions to change them: "Lichtzone ändern" (US-LIC-02) and the choice of a location from the own locations (US-PHA-03; without a location it leads to the management).
- Given the rarer actions (markers US-BES-03, catch date US-BES-11, repot of a cutting US-BES-04, archive US-BES-07), then they sit in a menu "Mehr" at the top of the layer, beside the chips, each closing the layer and opening its existing flow; archiving keeps its confirmation form (P-10).
- Given a part that loads or fails, then the tab shows that state with its next action ("Erneut versuchen", P-09, P-10); each part of "Pflege" loads and fails on its own.
- Given a wide screen (from 1024 px), then the layer stands beside the tiles (US-QS-15).
- Given the layer, then it has one filled primary action at most ("Messen", only on the overview); every write goes through the existing validating operation (P-03).

State of implementation: `PlantLayer` (`web/src/collection/plants-screen/plant-layers/plant-layer`) with the tabs "Überblick", "Standort" and the frame of "Pflege". The parts that belong to other modules arrive as slots wired by `CollectionArea` (`PlantSlots`; `collection` does not know `care` or `monitoring`): `PlantGrowth`, `PlantHistory` and `PlantCare` (`care/plant-detail`) and `WaterAction` (`monitoring`). `Pager` got `param` and `replace` for a pager inside a layer; `TreatmentForm` got `chosen`. The facts of the former card (`Measurement`, `Treatment`, `Provenance`) are reused from `specimens/cards/specimen-card`. Status 🟨 until a real phone check of the fit at 360 x 640 px (jsdom has no layout, so the fit is checked by structure only: no scroll area inside the overview). Measured 2026-10-30: inner 1.12 at 360×640; growth and trend are one line, state and species share a row, and an overdue treatment reads "N Tage überfällig" through the shared helper (#976). Final measurement 2026-10-30 (`docs/records/test-logs/qs-one-screen.md`): the plant layer fits 360×640 and 390×844 (the desktop pane was checked with five other layers, not with this one). Status 🟨 until a real phone and a screen reader pass (#638, #636).

### US-QS-24 · One word per concept, one line of help, numbers that read well · 🟨 new

As a **plant keeper** I want every thing in the app to have one name, help to be one line and numbers to read as one piece, so that I do not wonder whether "Bestand" and "Sammlung" are two places and no value jumps or breaks in the middle (US-QS-15, P-09).

Decision (owner, 2026-10-29, after a UI review against the Web Interface Guidelines): the review found several words for one thing, paragraphs above the content, numbers split from their units ("seit 10 / Tagen"), digits that jitter and "..." instead of "…". The term table below is the single source for the German UI words; the glossary in `00-product-overview.md` stays the English source of the concepts.

| Glossary term   | UI word                                         | Words that are no longer used                  | Reason                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | ----------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Collection      | Sammlung                                        | Bestand, "im Bestand", "Zum Bestand"           | The destination and its tab already read "Sammlung"; a second word made keepers look for a second place.                                                                                                                                                                                                                                                          |
| Specimen        | Pflanze                                         | Exemplar, Exemplare                            | Keepers say "Pflanze"; "Exemplar" sounds like a catalog. The contrast to the species is carried by "Art" ("eine Pflanze dieser Art"), so "Exemplar" is not needed even where the distinction matters.                                                                                                                                                             |
| Species         | Art                                             | Spezies, Sorte                                 | Unchanged, "Art" is already the only word.                                                                                                                                                                                                                                                                                                                        |
| Light zone      | Zone <n>, the lowest "Zone 1 · Stecklingslicht" | "Lampe <n>" as a zone label, "Standard-Lampen" | Zones are places, lamps are equipment (EQU); the number is the stable handle. A default-style stored name ("Lampe 2", "Zone 2") reads "Zone 2"; a name the keeper chose stays exactly as typed and is never rewritten (no migration), new accounts and the demo seed get "Zone 1 · Stecklingslicht", "Zone 2", "Zone 3", "Zone 4". Helper: `zoneLabel` in `core`. |
| Wishlist (mode) | Wunschliste                                     | Wunschzettel, "Wünsche" as the name of a list  | The mode and the list are "Wunschliste".                                                                                                                                                                                                                                                                                                                          |
| Wish (entry)    | Wunsch, Wünsche                                 | Wunschzettel                                   | One entry is a "Wunsch"; the plural names the entries, not the list.                                                                                                                                                                                                                                                                                              |

Acceptance criteria:

- Given any view, then each concept has one German UI word from the term table; a test fails when a retired word appears in a UI text (it also catches "Lampe <n>" used as a zone label; it scans the string literals of the `.ts` and `.tsx` files and the `.de.json` files of the web package; an explicit, commented exception list is allowed only for quoted prototype or legal texts and for dated release notes).
- Given a layer or an overview, then help text is at most one line; a longer explanation opens behind "Mehr erfahren".
- Given a number with a unit (cm, Lux, Tage, %, kB, ...) or a date range, then they never break apart (a non-breaking space through the shared helper `keepTogether`/`withUnit`), and counts, measurements, dates and money use tabular digits.
- Given any date, file or month field, then it shows German text and no browser-locale English: dates as `TT.MM.JJJJ` with the value kept as the local calendar date `YYYY-MM-DD` (NFR-08), a file as the button "Foto wählen" ("Datei wählen" for non-images) with "Kein Foto gewählt", a month as a select with German month names; a dev seed species shows a German source text (#1033).
- Given a text with an omission or a follow-up action ("Wird geladen …", "Pflanze wählen …"), then it uses the ellipsis character "…", never three dots (a test scans the texts).

State of implementation: the term table is applied across `web`, the German texts of `core` (`ERROR_TEXTS`, hints) and the e2e specs; error codes are unchanged. `lib/text-rules/term-table.ts` holds the retired words and the exception list, `retired-words.test.ts` and `number-unit.test.ts` check them; `MoreHelp` (`components/ui/display/more-help`) is the "Mehr erfahren" block for the layers of light zones. `tabular-nums` stays a per-view class on counts, measurements and dates (a global rule would also change digits in running text and headings). Not yet: the remaining paragraphs in forms. Status 🟨 until then.

## Non-functional requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                    | Status |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| NFR-01 | **Data format:** fields have fixed, validated types (number, date, enum). Free text carries only content, no logic.                                                                                                                                                                                                                                                            | ⬜     |
| NFR-02 | **Input without editing files:** everything goes through forms, buttons or the keeper's AI client.                                                                                                                                                                                                                                                                             | ⬜     |
| NFR-03 | **Single source:** species knowledge stands once in the catalog; specimens carry only deviations.                                                                                                                                                                                                                                                                              | ⬜     |
| NFR-04 | **Live derivation:** ownership, distribution, phases, trends are computed from raw data; no second copy is maintained.                                                                                                                                                                                                                                                         | ⬜     |
| NFR-05 | **No invented numbers** (P-08).                                                                                                                                                                                                                                                                                                                                                | ⬜     |
| NFR-06 | **Nothing disappears silently** (P-10).                                                                                                                                                                                                                                                                                                                                        | ⬜     |
| NFR-07 | **Instruction for action instead of data graveyard** (P-09).                                                                                                                                                                                                                                                                                                                   | ⬜     |
| NFR-08 | **Time zones:** all calendar dates are local dates of the user; phase calculation and reminders use the time zone of the user profile. No shift through UTC (solves B-01).                                                                                                                                                                                                     | 🟨     |
| NFR-09 | **Tenant isolation:** test that user A can never query or change data of user B, without friendship and sharing (P-04).                                                                                                                                                                                                                                                        | ⬜     |
| NFR-10 | **Security:** sign-in via an established service, not built ourselves (E-03). Sessions revocable. Input validated, file uploads checked for type and size.                                                                                                                                                                                                                     | ⬜     |
| NFR-11 | **Privacy (GDPR):** legal bases and consents documented, hosting in the EU (assumption, E-01), data processors named, deletion concept, data export. Privacy policy and imprint before the first external user.                                                                                                                                                                | ⬜     |
| NFR-12 | **Performance:** "Heute" and the collection view are usable for 100 specimens without noticeable waiting time (assumption, on a phone with an average network).                                                                                                                                                                                                                | ⬜     |
| NFR-13 | **Accessibility:** the product conforms to WCAG 2.1 level AA per EN 301 549 V3.2.1 (E-23): operation by keyboard alone, contrast, alternative texts for photos (species/specimen name), status never only via color or emoji. App-level behavior in US-QS-08 to US-QS-13, component rules in `docs/guides/reference/design-system.md`, checks in QG-U1 and QG-U5 (`FR-QG-09`). | ⬜     |
| NFR-14 | **Language:** UI initially German; display `DD.MM.YYYY`, storage ISO. Texts are exchangeable (later translation).                                                                                                                                                                                                                                                              | ⬜     |
| NFR-15 | **Backups and restore:** regular backup of user data and photos, restore tested.                                                                                                                                                                                                                                                                                               | ⬜     |
| NFR-16 | **Costs in view:** operating costs (hosting, storage, load from AI connections) are measured and shown per user, so that `13-Business-Case.md` is based on data. Until the measurement exists (TE-10), the operator enters the real monthly hosting cost by hand and the overview divides it by the active accounts (US-ACC-05).                                               | ⬜     |
| NFR-17 | **External sources** (Wikipedia, Wikidata, GBIF, OpenTree) are queried throttled and cached; failure of a source blocks no user function.                                                                                                                                                                                                                                      | 🟨     |
| NFR-18 | **Observability:** errors and failed jobs are visible (log, alarm to the operator), without logging user data in plain text.                                                                                                                                                                                                                                                   | ⬜     |

## Principles check per epic

| Question                          | Care (BES–BEH) | Pokédex                        | Social                          | Reminders                       |
| --------------------------------- | -------------- | ------------------------------ | ------------------------------- | ------------------------------- |
| Trigger without remembering?      | Reminder (MON) | Catch automatically from stock | Notification on need for action | yes                             |
| Fixed, validated format?          | yes            | yes                            | yes                             | yes                             |
| Check against deviation?          | ⚠️ in "Today"  | Catalog/enrichment gaps        | Sharing hints                   | Sensor "silent"                 |
| Idempotent?                       | yes            | yes                            | yes (swap states)               | yes (once per occasion and day) |
| Human delivers only human things? | yes            | yes                            | yes                             | yes                             |
| Says what to do?                  | yes            | "N more: …"                    | Requests with action            | yes                             |
