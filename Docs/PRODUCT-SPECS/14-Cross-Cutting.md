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

### US-QS-04 · Deviations become visible · ⬜ (prototype ✅)

Acceptance criteria:

- Wrong location, overdue treatment, buffer undercut, etiolated last measurement, data gaps appear as a warning with an instruction for action (P-09).
- Data that would be missing in an evaluation (specimen without species, without location) appears in a warning list (P-10).

### US-QS-05 · Privacy and control · ⬜ (prototype ✅ partly)

As a **plant keeper** I want to know and determine what happens with my data.

Acceptance criteria:

- Information, export and complete deletion of the account (see `US-ACC-04`).
- Photos are freed of EXIF/GPS before storage and reduced to a maximum size (prototype: long side 1600 px, quality 82).
- Location, growth notes, treatments, prices and financial data are never transmitted to friends or partners (FR-SOZ-01, FR-EQU-08).
- A page "What is measured?" names usage measurement and click counting; without consent nothing is counted.

### US-QS-06 · Sources and licenses · ⬜ (prototype ✅)

Acceptance criteria:

- Wikipedia texts and images (CC BY-SA) are shown with source link and license statement (FR-POK-07).
- User images remain the property of the user; passing on only after sharing.
- Partner links are labeled (FR-EQU-05).

### US-QS-07 · Usable on mobile · ⬜ new

As a **plant keeper** I want to operate the app on the phone next to the plant.

The look and the components that make this possible are governed by the design system (`DESIGN-SYSTEM.md`, enabler TE-17, gates QG-U4 to QG-U6).

Acceptance criteria:

- All everyday flows (measuring with photo, confirming watering/location, ticking off treatment, Today list) can be operated with one hand and without horizontal scrolling.
- The app is installable (home screen) and shows the last loaded data when there is no network; write actions are buffered and delivered when the network returns, without duplicate entry (`US-QS-03`).
- Photo capture directly from the camera.

### Accessibility (US-QS-08 to US-QS-13)

The conformance target is **WCAG 2.2 level AA** as adopted by **EN 301 549 V4.1.1** (published 2026-09-02, chapters 9 web and 11 software; decision E-23). The stories below turn that target into checkable behavior at app level. Component-level rules (focus ring, 44 px targets, contrast, overlays) stay in `DESIGN-SYSTEM.md` (DS-15 to DS-20, DS-37, DS-38, DS-40) and the gates QG-U1 and QG-U5. The bracketed numbers name the WCAG 2.2 success criteria a criterion covers. The criteria of US-QS-08 to US-QS-12 are **standing criteria**: once done, they hold for every view, flow and control added later. The Definition of Done (FR-QG-10, item 11) and the gate QG-U7 (FR-QG-24) enforce them on every story, so accessibility is not a one-time effort.

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
- Given light and dark mode, then every colour pair of the design tokens meets WCAG 2.2 AA (4.5:1 text, 3:1 boundaries and focus) and a test fails when a token has no checked pair.
- Given `prefers-reduced-motion: reduce`, then no non-essential motion runs (no route transition, no list entry, no swipe animation) and every state change is still visible.
- Given a screen change, a list that appears or a completed action, then the change is animated with the shared motion tokens (starting values: 120, 200 and 320 ms, assumption), using `transform` and `opacity` only.
- Given the first load of the app, then the initial JavaScript stays within the budget of QG-U6 and the Lighthouse scores do not get worse than before the redesign; code for animation that only one screen needs loads with that screen.
- Given any view, then it keeps its next action for empty, error and loading states (P-09) and shows "unbekannt" for unknown values (P-08).
- Given the main destinations, then my plants (US-BES) and the species I caught or still miss (US-POK) are one destination "Sammlung" with a switch at the top between "Pflanzen" and "Arten"; there is no separate "Bestand" or "Pokédex" destination and the page has one main heading.
- Given the destination "Sammlung", when I choose "Arten", then the species view shows, the address names the view so that back, forward and a copied link lead to the same view, and the species view is loaded only then.
- Given a link to the former address of the Pokédex (including any path below it), when I open it, then I land on the species view of the "Sammlung"; the former address of the collection still shows my plants.
- Given I chose a view before, when I open "Sammlung" without a view in the address, then the view from my last choice on this device shows; when the address names a view, then the address wins; when the device cannot remember (private mode), then the plants show and nothing breaks.
- Given I switch the view with the keyboard or a screen reader, then every choice is a target of at least 44 px, the selected one is marked by more than colour, the focus stays on the switch, and the new view is announced politely (US-QS-10).
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

Decision and tokens: ADR [0011](../decisions/0011-redesign-direction-greenhouse.md), E-24.

## Non-functional requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                                                                        | Status |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| NFR-01 | **Data format:** fields have fixed, validated types (number, date, enum). Free text carries only content, no logic.                                                                                                                                                                                                                                                | ⬜     |
| NFR-02 | **Input without editing files:** everything goes through forms, buttons or the keeper's AI client.                                                                                                                                                                                                                                                                 | ⬜     |
| NFR-03 | **Single source:** species knowledge stands once in the catalog; specimens carry only deviations.                                                                                                                                                                                                                                                                  | ⬜     |
| NFR-04 | **Live derivation:** ownership, distribution, phases, trends are computed from raw data; no second copy is maintained.                                                                                                                                                                                                                                             | ⬜     |
| NFR-05 | **No invented numbers** (P-08).                                                                                                                                                                                                                                                                                                                                    | ⬜     |
| NFR-06 | **Nothing disappears silently** (P-10).                                                                                                                                                                                                                                                                                                                            | ⬜     |
| NFR-07 | **Instruction for action instead of data graveyard** (P-09).                                                                                                                                                                                                                                                                                                       | ⬜     |
| NFR-08 | **Time zones:** all calendar dates are local dates of the user; phase calculation and reminders use the time zone of the user profile. No shift through UTC (solves B-01).                                                                                                                                                                                         | 🟨     |
| NFR-09 | **Tenant isolation:** test that user A can never query or change data of user B, without friendship and sharing (P-04).                                                                                                                                                                                                                                            | ⬜     |
| NFR-10 | **Security:** sign-in via an established service, not built ourselves (E-03). Sessions revocable. Input validated, file uploads checked for type and size.                                                                                                                                                                                                         | ⬜     |
| NFR-11 | **Privacy (GDPR):** legal bases and consents documented, hosting in the EU (assumption, E-01), data processors named, deletion concept, data export. Privacy policy and imprint before the first external user.                                                                                                                                                    | ⬜     |
| NFR-12 | **Performance:** the start page "Today" and the collection view are usable for 100 specimens without noticeable waiting time (assumption, on a phone with an average network).                                                                                                                                                                                     | ⬜     |
| NFR-13 | **Accessibility:** the product conforms to WCAG 2.2 level AA as adopted by EN 301 549 V4.1.1 (E-23): operation by keyboard alone, contrast, alternative texts for photos (species/specimen name), status never only via color or emoji. App-level behavior in US-QS-08 to US-QS-13, component rules in `DESIGN-SYSTEM.md`, checks in QG-U1 and QG-U5 (`FR-QG-09`). | ⬜     |
| NFR-14 | **Language:** UI initially German; display `DD.MM.YYYY`, storage ISO. Texts are exchangeable (later translation).                                                                                                                                                                                                                                                  | ⬜     |
| NFR-15 | **Backups and restore:** regular backup of user data and photos, restore tested.                                                                                                                                                                                                                                                                                   | ⬜     |
| NFR-16 | **Costs in view:** operating costs (hosting, storage, load from AI connections) are measured and shown per user, so that `13-Business-Case.md` is based on data. Until the measurement exists (TE-10), the operator enters the real monthly hosting cost by hand and the overview divides it by the active accounts (US-ACC-05).                                   | ⬜     |
| NFR-17 | **External sources** (Wikipedia, Wikidata, GBIF, OpenTree) are queried throttled and cached; failure of a source blocks no user function.                                                                                                                                                                                                                          | 🟨     |
| NFR-18 | **Observability:** errors and failed jobs are visible (log, alarm to the operator), without logging user data in plain text.                                                                                                                                                                                                                                       | ⬜     |

## Principles check per epic

| Question                          | Care (BES–BEH) | Pokédex                        | Social                          | Reminders                       |
| --------------------------------- | -------------- | ------------------------------ | ------------------------------- | ------------------------------- |
| Trigger without remembering?      | Reminder (MON) | Catch automatically from stock | Notification on need for action | yes                             |
| Fixed, validated format?          | yes            | yes                            | yes                             | yes                             |
| Check against deviation?          | ⚠️ in "Today"  | Catalog/enrichment gaps        | Sharing hints                   | Sensor "silent"                 |
| Idempotent?                       | yes            | yes                            | yes (swap states)               | yes (once per occasion and day) |
| Human delivers only human things? | yes            | yes                            | yes                             | yes                             |
| Says what to do?                  | yes            | "N more: …"                    | Requests with action            | yes                             |
