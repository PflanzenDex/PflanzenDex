# 14 – Epic QS: Cross-Cutting (Privacy, Security, Mobile, Quality)

Non-functional requirements for all epics. All ⬜. The yardstick is the product principles P-01 to P-11 (`00-Product-Overview.md`).

## User stories

### US-QS-01 · Nothing depends on remembering · 🟨 (prototype 🟡)

As a **plant keeper** I want the system to report need for action itself.

Acceptance criteria:

- Phase changes, due treatments, overdue measurements and wishlist buffer trigger a reminder (epic MON) without the app being opened.
- The start page "Today" shows the same items (one source, `FR-MON-03`).

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

State of implementation: photos are freed of EXIF/GPS and reduced (long side 1600 px, quality 82) before storage and served only to their owner (US-WAC-06). Friends see only the whitelisted facts of shared specimens (US-SOZ-04); a test proves for every friend view (shared specimens, friend collection, friend list, feed, feed banner) that location, measurement notes and treatments of a shared specimen never reach the friend. The section "Was wird gemessen?" on the page Konto names what is recorded: no click counting, no usage analytics and no advertising or analytics services; the time of the last activity is stored on every sign-in and the operator sees only the number of active accounts of the last 30 days (US-ACC-05); images of collector cards and suggestions are loaded by the device directly from Wikimedia. **Open:** information, export and deletion of the account (US-ACC-04, release R3); whether the count of active accounts needs a consent or rests on the operator's legitimate interest (owner decision).

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

The conformance target is **WCAG 2.2 level AA** as adopted by **EN 301 549 V4.1.1** (published 2026-09-02, chapters 9 web and 11 software; decision E-23). The stories below turn that target into checkable behavior at app level. Component-level rules (focus ring, 44 px targets, contrast, overlays) stay in `docs/guides/reference/design-system.md` (DS-15 to DS-20, DS-37, DS-38, DS-40) and the gates QG-U1 and QG-U5. The bracketed numbers name the WCAG 2.2 success criteria a criterion covers. The criteria of US-QS-08 to US-QS-12 are **standing criteria**: once done, they hold for every view, flow and control added later. The Definition of Done (FR-QG-10, item 11) and the gate QG-U7 (FR-QG-24) enforce them on every story, so accessibility is not a one-time effort.

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
- Given a flow with more than one step (onboarding, creating a specimen, measuring with photo), then every step shows "Schritt n von m" and its name, going back keeps what I already entered, and I am never asked twice for data I gave in the same flow (3.3.7).
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

- Given the app is open to external users (stage 2), then a page "Barrierefreiheit" states the conformance target (WCAG 2.2 AA, EN 301 549), the date and method of the last check, the known gaps with a workaround each, and a contact for feedback; it is reachable from every view (same place as help, US-QS-09).
- Given I report a barrier, then the report reaches the operator as an issue with the label `accessibility`, I get a confirmation, and the operator answers within a stated period (starting value: 14 days, assumption).
- Given a release into `main`, then the known gaps on the page match the open issues with the label `accessibility` (nothing disappears silently, P-10).
- Given the legal check of E-23 finds the app in scope of the BFSG, then the page also carries the information the BFSG requires for services, before the first external user.

### US-QS-14 · Modern, calm and fast-feeling interface · ⬜ new

As a **plant keeper** I want the app to look modern and feel quick on the phone and on a large screen, so that checking my plants is pleasant every day.

Acceptance criteria:

- Given a viewport of 360 px, then the main destinations are reached from a bottom bar with at most five items; from 768 px a navigation rail and from 1280 px a labelled sidebar show the same destinations from one list.
- Given my account has no role, when I open the app at 360 px, then the bottom bar shows the five destinations "Heute", "Sammlung", "Entdecken", "Freunde" and "Konto" and no "Mehr".
- Given my account has the role reviewer or operator, when I open the app at 360 px, then the bar still holds at most five slots: "Heute", "Sammlung", "Entdecken", "Freunde" and "Mehr", and the drawer "Mehr" holds "Konto" and the role-only entries "Prüfliste" and "Betreiber" (owner decision 2026-10-08, issue #607); from 768 px the rail and the sidebar show "Konto" and the role-only entries as separate items.
- Given light and dark mode, then every colour pair of the design tokens meets WCAG 2.2 AA (4.5:1 text, 3:1 boundaries and focus) and a test fails when a token has no checked pair.
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
- Given the destination "Sammlung", when I choose "Wunschliste", then my open wishes show ranked by the space need of their target zone with their actions (US-WUN-01, US-WUN-03, US-WUN-05), a wish with an unknown target zone stands at the end and says so (P-08), and the count line names the number of open wishes; the address names the mode, the mode is remembered per device and the address wins as for the other modes, and the wishlist is loaded only then.
- Given the species view of the "Sammlung", when I choose the arrangement "Schwierigkeit", then the species with an active specimen show side by side, the easiest first, with "unbekannt" for a missing value (US-BES-05), under the same main heading; the address names the arrangement, and choosing "Pokédex" shows the caught and missing species again.
- Given a link or bookmark to the former addresses of "Wunschliste" or "Artenvergleich", when I open it, then I land on the wishlist mode or on the species view arranged by difficulty of the "Sammlung", the focus stays where it was, and the former addresses are no entries of the navigation.
- Given a missing species in the Pokédex offers "Auf die Wunschliste" (US-POK-09), when I choose it, then the wishlist mode of the "Sammlung" opens.
- Given I switch between the modes or the arrangements with the keyboard or a screen reader, then every choice is at least 44 px, the choice is marked by more than colour, the focus stays on the control and the new view is announced politely; a mode that is loading, empty or failing keeps its next action (P-09, P-10).
- Given the main destinations, then treatments (US-BEH) and the hints about incomplete plants (US-BES-08) are not destinations of their own: "Heute" shows them as sections after "Jetzt dran", in the order "Jetzt dran", "Behandlungen", "Fehlt noch", each named by a heading below the one main heading of the page.
- Given the section "Behandlungen", then I see the open dates by urgency with "Erledigt" (US-BEH-02, US-BEH-03), plan new ones in a form that opens as a sheet on a phone and as a dialog on a large screen (US-BEH-01), and reach the done treatments per plant (US-BEH-03).
- Given the section "Fehlt noch", then each hint names what is missing and offers the action that fixes it, including choosing a location for a plant without one right there (US-BES-08, US-PHA-03).
- Given a link or bookmark to the former addresses of "Behandlung" or "Hinweise", when I open it, then I land on "Heute" at the matching section, the section name is announced politely and the focus is on its heading; the former addresses are no entries of the navigation.
- Given one of the sections is empty, fails to load or is loading, then it shows that state with its next action (P-09, P-10) while the other sections stay usable.
- Given "Heute" is opened, then the sections load as their own parts, so the initial JavaScript does not carry them (QG-U6).
- Given the main destinations, then "Konto" and "Einstellungen" are one destination "Konto" with one main heading and the sections "Profil" (name, e-mail, ways to sign out; US-ACC-01) and "Einstellungen" (display name, time zone, notifications, privacy; US-ACC-02) in this order, each named by a heading below the main heading; "Einstellungen" is no entry of the navigation.
- Given a wide screen (1280 px), then a list of the sections beside them links to each section and marks the current one by more than colour; on a small screen the sections are stacked without the list.
- Given a link or bookmark to the former address of "Einstellungen", when I open it, then I land on "Konto" at the section "Einstellungen", the section name is announced politely and the focus is on its heading.
- Given the section "Einstellungen" fails to load or is loading, then it shows that state with its next action (P-09, P-10) while the section "Profil" stays usable; saving settings works as before (US-ACC-02).
- Given "Konto" is opened, then the settings load as their own part, so the initial JavaScript does not carry them (QG-U6). Invitations to friends stay in "Freunde" (US-SOZ); "Konto" has no section for them.
- Given the main destinations, then care phases (US-PHA-01, US-PHA-03), the own care profile (US-BES-09) and locations and light zones (US-LIC) are not destinations of their own: "Pflegephasen", "Pflegeprofil" and "Standorte und Licht" are no entries of the navigation.
- Given the view "Pflanzen" of the "Sammlung", then below the switch I can group my plants "Alle", "Nach Pflegephase" or "Nach Standort", the address names the grouping so that back, forward and a copied link lead to the same view, and the choice keeps the focus on the control and is announced politely.
- Given I choose "Nach Pflegephase", then the expected phase and the target location per plant show as before, including "Jetzt umgestellt" (US-PHA-01, US-PHA-03), under the same main heading, and the count line names the number of plants with a phase; with no plant that has a phase, the view says what to do next (P-09).
- Given I choose "Nach Standort", then my plants stand in groups, one per location in alphabetical order, each heading naming the location, its light zone and the number of plants; plants without a known location form the last group "Standort unbekannt", and an unknown zone reads "Zone unbekannt" (P-08, P-10).
- Given the view "Pflanzen", when I choose "Standorte verwalten", then the existing management of locations and light zones opens inside the "Sammlung" as a view of its own with its heading, a button "Zurück zur Sammlung" and its own empty, loading and error states with their next actions (US-LIC, P-09, P-10); the address names the open view, back leads to the plants with the same grouping, and the focus moves to the heading of the view that appears.
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

## Non-functional requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                                              | Status |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| NFR-01 | **Data format:** fields have fixed, validated types (number, date, enum). Free text carries only content, no logic.                                                                                                                                                                                                                                                                      | ⬜     |
| NFR-02 | **Input without editing files:** everything goes through forms, buttons or the keeper's AI client.                                                                                                                                                                                                                                                                                       | ⬜     |
| NFR-03 | **Single source:** species knowledge stands once in the catalog; specimens carry only deviations.                                                                                                                                                                                                                                                                                        | ⬜     |
| NFR-04 | **Live derivation:** ownership, distribution, phases, trends are computed from raw data; no second copy is maintained.                                                                                                                                                                                                                                                                   | ⬜     |
| NFR-05 | **No invented numbers** (P-08).                                                                                                                                                                                                                                                                                                                                                          | ⬜     |
| NFR-06 | **Nothing disappears silently** (P-10).                                                                                                                                                                                                                                                                                                                                                  | ⬜     |
| NFR-07 | **Instruction for action instead of data graveyard** (P-09).                                                                                                                                                                                                                                                                                                                             | ⬜     |
| NFR-08 | **Time zones:** all calendar dates are local dates of the user; phase calculation and reminders use the time zone of the user profile. No shift through UTC (solves B-01).                                                                                                                                                                                                               | 🟨     |
| NFR-09 | **Tenant isolation:** test that user A can never query or change data of user B, without friendship and sharing (P-04).                                                                                                                                                                                                                                                                  | ⬜     |
| NFR-10 | **Security:** sign-in via an established service, not built ourselves (E-03). Sessions revocable. Input validated, file uploads checked for type and size.                                                                                                                                                                                                                               | ⬜     |
| NFR-11 | **Privacy (GDPR):** legal bases and consents documented, hosting in the EU (assumption, E-01), data processors named, deletion concept, data export. Privacy policy and imprint before the first external user.                                                                                                                                                                          | ⬜     |
| NFR-12 | **Performance:** the start page "Today" and the collection view are usable for 100 specimens without noticeable waiting time (assumption, on a phone with an average network).                                                                                                                                                                                                           | ⬜     |
| NFR-13 | **Accessibility:** the product conforms to WCAG 2.2 level AA as adopted by EN 301 549 V4.1.1 (E-23): operation by keyboard alone, contrast, alternative texts for photos (species/specimen name), status never only via color or emoji. App-level behavior in US-QS-08 to US-QS-13, component rules in `docs/guides/reference/design-system.md`, checks in QG-U1 and QG-U5 (`FR-QG-09`). | ⬜     |
| NFR-14 | **Language:** UI initially German; display `DD.MM.YYYY`, storage ISO. Texts are exchangeable (later translation).                                                                                                                                                                                                                                                                        | ⬜     |
| NFR-15 | **Backups and restore:** regular backup of user data and photos, restore tested.                                                                                                                                                                                                                                                                                                         | ⬜     |
| NFR-16 | **Costs in view:** operating costs (hosting, storage, load from AI connections) are measured and shown per user, so that `13-Business-Case.md` is based on data. Until the measurement exists (TE-10), the operator enters the real monthly hosting cost by hand and the overview divides it by the active accounts (US-ACC-05).                                                         | ⬜     |
| NFR-17 | **External sources** (Wikipedia, Wikidata, GBIF, OpenTree) are queried throttled and cached; failure of a source blocks no user function.                                                                                                                                                                                                                                                | 🟨     |
| NFR-18 | **Observability:** errors and failed jobs are visible (log, alarm to the operator), without logging user data in plain text.                                                                                                                                                                                                                                                             | ⬜     |

## Principles check per epic

| Question                          | Care (BES–BEH) | Pokédex                        | Social                          | Reminders                       |
| --------------------------------- | -------------- | ------------------------------ | ------------------------------- | ------------------------------- |
| Trigger without remembering?      | Reminder (MON) | Catch automatically from stock | Notification on need for action | yes                             |
| Fixed, validated format?          | yes            | yes                            | yes                             | yes                             |
| Check against deviation?          | ⚠️ in "Today"  | Catalog/enrichment gaps        | Sharing hints                   | Sensor "silent"                 |
| Idempotent?                       | yes            | yes                            | yes (swap states)               | yes (once per occasion and day) |
| Human delivers only human things? | yes            | yes                            | yes                             | yes                             |
| Says what to do?                  | yes            | "N more: …"                    | Requests with action            | yes                             |
