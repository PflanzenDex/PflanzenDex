# 22 – Epic ONB: Introduction and Staged Unlocking

Goal: the app introduces itself by doing, not by explaining. A new keeper reaches the first plant within a minute, meets the other functions when they become useful, and always sees what exists, why something is not open yet and how to open it. Keepers who want everything at once get everything at once.

Prototype reference: none. Origin: user feedback from the first test of the web app (2026-10-17): the onboarding was not intuitive and partly in the wrong order. Decided by the PO the same day (all principles below are "assumption, decided by the PO", revisable). Builds on ACC (US-ACC-03 guided onboarding, US-ACC-02 profile), QS (US-QS-09 guidance, US-QS-14 five main destinations, NFR-13), ACH (calm mode US-ACH-08), DEV (feature switches US-DEV-06) and the epics whose functions are staged (WAC, BEH, WUN, ENT, EQU, SOZ, TAU, KI, ACH).

Delimitation from ACC-03: ACC-03 is the one-time wizard that exists today. ONB replaces its order and its scope (US-ONB-01, US-ONB-02); the story ID and its acceptance criteria that still hold (skippable, never an error, returning keepers) stay valid.

Delimitation from DEV-06: the **feature switch** is the operator's decision (`social`, `ai`, `recommendations`): a function that is switched off does not exist for anybody and is **never announced** as "coming soon". An **unlock** is the keeper's own staging: the function exists, it is only introduced later. The two never mix (FR-ONB-03).

Delimitation from ACH: no levels, ranks, titles, points or badges for using the app. An unlock is a door that opens, not a reward that is earned (FR-ONB-08). Calm mode (US-ACH-08) switches the hints off, not the information.

## Problem

Found in the code of the current onboarding (`app/packages/web/src/shell/onboarding-wizard`, `app/packages/core/src/account/onboarding.ts`, `app/packages/web/src/shell/start-page`):

1. **Wrong order:** the wizard asks locations, then light zones, then the first plant (`onboardingSteps`). The keeper must understand the structure of the app (what is a light zone, which lamp level?) before the first experience, and the third step is only a button that leaves the wizard for the species catalog. The reward comes last, the work first.
2. **Explanation instead of doing:** every step needs an intro text ("Übernimm die vier Standard-Lampen oder passe sie an und lege eigene Zonen an. Ändern kannst du alles später …"). A step that needs such a text is badly designed; sensible defaults would make the questions unnecessary.
3. **Nagging after skipping:** whoever skips gets permanent cards on the start page ("Du hast noch keinen Standort angelegt", "… keine Lichtzonen"). They cannot be dismissed, are not tied to calm mode, and "Einstieg beenden" is remembered only per device (local storage), not per account.
4. **Everything at once:** a new account sees the whole navigation (Heute, Sammlung, Entdecken, Freunde, Konto) and all functions with an empty collection. Nothing is staged and nothing says which function becomes useful when.
5. **One path for everybody:** the same three steps for the person with two plants and for the person who brings fifty. There is no way to say "I know what I want, show me everything".

## Terms

| Term              | Meaning                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keeper style      | Account setting with two values: `few` ("ein paar Pflanzen pflegen") and `many` ("viel verwalten, alles sofort"). Chosen at the start, changeable at any time (DM-ONB-01). No level, no rank. |
| Unlock            | The moment a staged function is introduced to this account. Open, locked or unlockable (see Lock state).                                                                                      |
| Lock state        | Per function and account: `open` (usable), `locked` (not yet, with reason and way) or `unlockable` (the condition is met or the keeper may open it now by one tap). Derived live (FR-ONB-01). |
| Unlock rule       | The condition of one function: a count, a time since the first plant, or both, with the way to meet it. Starting values in the table below.                                                   |
| Reason and way    | The two parts of every lock text: why it is not open ("Tauschen: lege 3 Pflanzen an") and what opens it ("noch 2 Pflanzen", "noch 112 Tage", "jetzt freischalten"). Always both (US-ONB-05).  |
| Function overview | The fixed page "Was die App kann" (account, section help) listing every function with its state (US-ONB-06).                                                                                  |
| Hint              | A short, dismissible note at the place where it helps; at most once per occasion (US-ONB-07). Not a tour, not a modal.                                                                        |

## Unlock rules (starting values, assumptions)

Decided by the PO, not measured (P-08). Counts are active specimens; days count from the first specimen (its local date, NFR-08). The rules live in one table in the domain logic (US-ONB-04). Style `many` opens every row at once.

| Function                                        | Epic     | Open when (style `few`)                                | Always also opened by                   | Never announced when            |
| ----------------------------------------------- | -------- | ------------------------------------------------------ | --------------------------------------- | ------------------------------- |
| Today, collection, species catalog, light zones | BES, LIC | always                                                 | -                                       | -                               |
| Measuring, photos, growth, treatments           | WAC, BEH | the first plant exists                                 | tap "unlock"                            | -                               |
| Pokédex                                         | POK      | the first plant exists                                 | tap "unlock"                            | -                               |
| Wishlist and Discover                           | WUN, ENT | 28 days after the first plant, or 5 plants             | tap "unlock"                            | -                               |
| Equipment and recommendations                   | EQU      | 3 plants, or 28 days after the first plant             | tap "unlock"                            | switch `recommendations` is off |
| Friends and swapping (incl. swipe matching)     | SOZ, TAU | 5 plants                                               | tap "unlock", or an invitation (SOZ-01) | switch `social` is off          |
| AI access                                       | KI       | 5 plants                                               | tap "unlock"                            | switch `ai` is off              |
| Care rhythm                                     | ACH-04   | 28 days of history                                     | tap "unlock"                            | calm mode is on                 |
| Anniversaries                                   | ACH-06   | 365 days after the first plant (the first anniversary) | tap "unlock"                            | calm mode is on                 |
| Year in review                                  | ACH-07   | 365 days after the first plant                         | tap "unlock"                            | calm mode is on                 |

An account that already owns data when the rules ship counts every row whose condition it meets as open, and is set to style `many` (FR-ONB-06). A function whose data already exists (a wish, a friend) is open whatever the rule says (P-10).

## User stories

### US-ONB-01 · Start with the first plant · 🟨 new

As a **new plant keeper** I want to begin with my first plant and nothing else, so that I see the app work within a minute.

Acceptance criteria:

- Given a new account (no active and no archived plant, `isNewAccount`), when it opens the app, then the first screen is "Deine erste Pflanze": a name (or a photo) and a species search; saving creates the specimen. No location and no light zone is asked before.
- Given I type a name or pick a species, then the light need is prefilled from the species (care profile, US-BES-09) and shown as a value I may change, never as a question; given the species is unknown, it says so (P-08) and the field stays empty.
- Given a photo, then it is attached to the specimen as its first photo (US-WAC-01); a photo is optional and a name alone is enough.
- The flow has at most 3 steps (name or photo, species, save) and every step shows "Schritt n von m" (US-QS-09); going back keeps what I entered. No step needs an explanatory paragraph; at most one short hint at the place, in German, of at most 12 words (starting value).
- Given I save, then I land on the new plant and the app names one next action (P-09), e.g. "Miss deine Pflanze" (US-ONB-05 shows what is open now).
- Given I skip the first plant, then the start page shows the normal "first plant" action (US-ACC-03) and nothing else is blocked; the choice is stored per account, not per device (US-ONB-07, done).
- Given a returning keeper (all plants archived), then this flow is not shown; "next plant" stays the next action (US-ACC-03).
- Measurable (US-ONB-08): median time from first open to the saved first plant at most 90 seconds, at most 3 steps.
- Status: replaces the order of ACC-03 (locations, zones, first plant) by first plant first.

State of implementation: a new account (`isNewAccount`) opens the start page on "Deine erste Pflanze" with two steps, each marked "Schritt n von 2" (species search by name, then "Pflanze speichern"); no location and no light zone is asked or loaded. The light need is the zone derived live from the species (`zoneDerive`, shown as "Lampe 2 (laut Art)" in a select the keeper may change); only a changed zone is sent as the specimen's own zone, the derived one is never stored (P-01). A new account without light zones gets the standard lamps silently (`POST /light-zones/defaults`, the minimum of US-ONB-02). After saving the page names "Miss deine Pflanze" and opens the collection. The permanent start-page cards for missing locations and zones, and the old steps "Standorte" and "Lichtzonen", are removed. "Überspringen" shows the normal first-plant action (US-ACC-03). **Open:** the free name and the optional first photo (step 1 of the criteria: the specimen has no free name yet, only species and marker, and photos exist only on measurements, US-WAC-05); landing directly on the new plant instead of the collection; the measurement of US-ONB-08; the question "Wo steht sie?" and the default location "Zuhause" (US-ONB-02).

### US-ONB-02 · Places and light come later, with sensible defaults · 🟨 new

As a **plant keeper** I want the app to take care of locations and light zones with good defaults, so that I am not asked for structure before I have anything to put in it.

Acceptance criteria:

- Given a new account, then the default four light zones (US-LIC-01) and one location "Zuhause" exist from the start; nothing is asked and nothing is shown as missing (US-ACC-03: never an error).
- Given my first plant is saved, then one question follows at the plant, once: "Wo steht sie?" with the existing locations and light zones as choices and "Später" (P-09); it is a hint (US-ONB-07), not a step.
- Given I choose a place, then the plant gets that location and light zone (US-LIC-02); "Später" leaves it open and the plant is shown as "ohne Standort" with the way to set it, never as an error.
- Given I add a second plant, then the question is asked again only if the first answer was "Später" and I did not dismiss the hint (US-ONB-07).
- Given I open "Standorte verwalten", then locations and zones can be renamed, added and removed as today (US-LIC-01, US-LIC-02); the defaults are normal data, owned by the account (P-04), and removing them is allowed when no specimen uses them.
- The permanent start-page cards "Du hast noch keinen Standort" and "… keine Lichtzonen" are removed; the information is the plant's own hint (US-ONB-07).
- Status: replaces the steps "Standorte" and "Lichtzonen" of ACC-03.

State of implementation: the four default lamps (since US-ONB-01) and one location "Zuhause" (indoor, no zone) are laid out silently when the first plant flow needs them, only for an account that has none; an account with a location gets no second one. After saving the first plant, the plant page of the flow shows the question "Wo steht sie?" with the own locations; a location without a light zone also offers the zone to set ("Licht bei Zuhause", "Keine Angabe" by default, never invented). "Hier steht sie" sets the location of the plant, "Später" leaves it open without any error. Each location is named with the light it stands under ("Balkon (Lampe 4)"), a single location is text and not a choice, and the save says what was stored ("Standort gespeichert: Zuhause, Lampe 2."), so the zone of the location never replaces the light need unseen (P-10); the answer to "Wie nutzt du die App?" is confirmed the same way. "Miss deine Pflanze" is the one primary button. The permanent cards are gone and the locations page is unchanged. **Open:** asking again for a second plant after "Später" (the hint registry and the dismissal state exist since US-ONB-07, the question at the second plant is not wired); creating the defaults at registration instead of in the first-plant flow; the "ohne Standort" wording on the plant itself (today "Standort fehlt" in phases and the Hinweise tab).

### US-ONB-03 · Choose how I use the app · ✅ new

As a **plant keeper** I want to say once whether I tend a few plants or manage many, so that the app fits me and I can change my mind.

Acceptance criteria:

- Given a new account, then the choice is a single question with two answers on the screen after the first plant is saved: "Ich pflege ein paar Pflanzen" (`few`) and "Ich verwalte viel, zeig mir alles" (`many`). It can be skipped; skipping means `few`.
- Given the account setting "Wie nutzt du die App?" (profile, US-ACC-02), then I can switch the style at any time; the change takes effect at once.
- Given style `many`, then every function is open at once (all rows of the unlock rules, except those switched off by the operator, FR-ONB-03), no hint is shown (US-ONB-07) and nothing is announced as "coming soon".
- Given I switch from `many` to `few`, then functions I already used or unlocked stay open (P-10); only functions I have not met yet follow the rules again.
- Given I switch from `few` to `many`, then all locked functions open and the unlock dates are recorded as the switch date.
- The style has no name like level, rank, title or badge anywhere in the app, in the feed or for friends (FR-ONB-08); friends never see it (P-05).
- Status: stored as DM-ONB-01; changing it is a validating operation (P-03).

State of implementation: the table `account_style` (DM-ONB-01, migration `0081`, same-account row rule, isolation test) holds `few | many` and the local date of the last choice; the migration sets every account that exists to `many` (FR-ONB-06), an account without a row counts as `few`. The validating operation `onboarding.set_style` stores the choice; from `few` to `many` it first records the switch date as unlock date (`source = style_many`, table `account_unlock`) of every function that is locked at that moment, so a switch back to `few` takes nothing away (P-10). `GET /onboarding/style` answers `{ style, chosen }` (`chosen` is false until the question is answered or skipped); `PUT /onboarding/style` with `{ style, timeZone }` sets it (an unknown style gives `input.invalid`). The lock routes of US-ONB-05 now read the stored style instead of the fixed `many`. The web asks the question once, at the plant page after the first plant is saved and the place question is done ("Wie nutzt du die App?", two answers, "Später" stores `few`), and offers the same choice in the profile under "Konto" (saved at once, with a confirmation). No name like level or rank appears; the style is not part of any friend or feed view (P-05). Calm mode needs no special case here: the question and the setting mention no achievement, and the announcement rule of US-ONB-05 stays in `unlockState`. Hints that are skipped under `many` belong to US-ONB-07.

### US-ONB-04 · Unlock rules as pure domain logic · ✅ new

As a **developer** I want the unlock rules in one pure function, so that menu, start page, overview and AI client always agree.

Acceptance criteria:

- Given the keeper style, the counts (active specimens), the local date of the first specimen, the calm mode, the manual unlocks, the operator's feature switches and the local date of today, when the function runs, then it returns for every function of the table the lock state (`open | locked | unlockable | switched_off`), the reason and the way as data (counts or days, no text; the German text comes from a message table, FR-QG-11).
- Given the same input and the same date, then the result is the same (FR-ONB-01); the function has no I/O and no clock of its own (the date is passed in, NFR-08, `date-and-timezone`).
- Given style `many`, then every function the operator has not switched off is `open`.
- Given a function with existing data or a manual unlock, then it is `open` regardless of the rule.
- Given a day count, then it uses calendar dates in the keeper's time zone: "noch 112 Tage" is `unlock date - today`, never a duration in hours.
- Tests: one per row of the table and per boundary (4 / 5 plants, day 27 / 28 / 29, first plant archived or deleted: history stays, so days still count from the first specimen ever created); every test carries the story ID (P-06).
- Given an unknown function id, then the function refuses with a stable code (FR-QG-11), nothing is silently open.

State of implementation: `unlockState` and `unlockStates` in `app/packages/core/src/account/unlock/` take the style, the active specimen count, the local date of the first specimen, today's local date, calm mode, the effective switches, the manual unlocks and the functions with existing data. The registry `UNLOCK_FUNCTIONS` (18 functions in navigation order, each with epic, destination, rule and optional switch) and the rule table `UNLOCK_RULES` hold the starting values. A met rule or a manual unlock or existing data gives `open`; an unmet rule gives `locked` with the conditions (`reasons`), one way per condition (add plants, wait until a calendar date, add the first plant) and `mayUnlockNow`. A switched-off function is `switched_off` and never announced, whatever else is true. Calm mode does not change the state; it only sets `announced` to false for the three ACH functions (US-ONB-05). An unknown id gives `onboarding.unknown_function`. The state `unlockable` is part of the type but not produced yet: the table reads "open when", so a met rule is `open`, and every locked function already offers the tap (`mayUnlockNow`); US-ONB-05 decides whether a met rule needs the keeper's tap first. Persistence of the style (US-ONB-03) and of manual unlocks (DM-ONB-02) is not part of this story: the function takes them as input. No API route and no UI.

### US-ONB-05 · See what is locked, why and how to open it · ✅ new

As a **plant keeper** I want a function I cannot use yet to stay visible with the reason and the way, so that nothing is hidden and I know what to do next.

Acceptance criteria:

- Given a function is `locked`, then its entry in the navigation or on the start page stays visible, marked "Bald" or "Noch gesperrt" (text, not only color or icon, NFR-13), and opening it shows a short page with the reason and the way, e.g. "Jahresrückblick: noch 112 Tage" or "Tauschen: lege 3 Pflanzen an". Never a blank page, never an error, never a 404 (P-09).
- Given a function is `unlockable`, then the page offers "Jetzt freischalten"; one tap opens it and stores the unlock (DM-ONB-02); it is never revoked.
- Given any locked function, then I can unlock it by tap at any time, even when its rule is not met; the page then says in one sentence what may still be empty ("Du hast noch keine Freunde: Freunde einladen").
- Given the switch `social`, `ai` or `recommendations` is off, then the function has no entry and no "coming soon" (FR-ONB-03).
- Given calm mode is on, then the entries of Care rhythm, Anniversaries and Year in review are not shown (US-ACH-08), also not as locked.
- Given at most five main destinations (US-QS-14), then a locked destination (Entdecken, Freunde) keeps its place and order in the navigation (US-QS-09: order and names do not change); locked parts inside a destination show as a row with the same marking.
- Given a direct link to a locked function (bookmark, AI client), then the page described above opens; the API answers with the stable code `onboarding.locked` and the same data (reason, way) and never hides the function (FR-ONB-02).
- No countdown pressure: no animation, no colour alarm, no sound; the text is a plain fact (FR-ONB-08).

Decision of the PO: a met rule is `open` at once and needs no extra tap, so the state `unlockable` stays unused; `locked` functions offer "Jetzt freischalten" (the tap, `mayUnlockNow`). A switched-off function is never announced.

State of implementation (data and API): the table `account_unlock` (DM-ONB-02, migration `0079`, same-account row rule, isolation test) holds the keeper's decision; the validating operation `onboarding.unlock_function` stores it once (a second tap keeps the first date, nothing is deleted) and refuses an unknown or switched-off function with `onboarding.unknown_function`. `GET /onboarding/unlocks?timeZone=` lists every function that may be announced with state, reasons and ways as data (switched-off ones are missing); `GET /onboarding/unlocks/:id` answers `409 onboarding.locked` with the same data while locked; `POST /onboarding/unlocks/:id` with `{ timeZone }` unlocks. No other route checks a lock (FR-ONB-04). The keeper style is stored since US-ONB-03: existing accounts are `many` (FR-ONB-06), new ones start with `few`. `existingData` reads the account's own wishes (open or bought: Wishlist and Discover), friends and open requests (so a redeemed invitation too: Friends and Swapping), offers and swaps (Swapping) and equipment (P-10), through the ports of the owning modules; only existence matters. An invitation code that nobody has redeemed yet is not read (its table is not readable by the app role); US-ONB-03 must decide whether that counts before it stores `few`.

State of implementation (web): the app loads the states once (`GET /onboarding/unlocks`, refreshed after every write) and fails open: while they are missing or their request fails, nothing is marked (the lock is information, not a permission, FR-ONB-04). A locked destination (Freunde) keeps its place, order and name in the navigation and carries the text "Bald" (only time is missing) or "Noch gesperrt" (plants are missing) in the rail, the sidebar, the bottom bar and the drawer; its address (and the exchange, `/friends/exchange`) opens the lock page. The start page lists every announced locked function as a row "Noch nicht geöffnet" with the mark and the way ("Tauschen: lege noch 3 Pflanzen an", "Jahresrückblick: noch 112 Tage"), each linking to the lock page `/unlock/:id`. The lock page shows reason and way as plain facts and "Jetzt freischalten"; one tap stores the unlock, then a status message says in one sentence what may still be empty and the link "… öffnen" names the next step (P-09); a refusal stays visible with the German text of its code (P-10). An open or unknown function on that address shows a short page that links on, never a blank page. Functions with `announced=false` (calm mode) and switched-off ones get no row and no mark. No animation, colour alarm or sound (FR-ONB-08). The locked parts inside the destinations show as the same rows (`LockedRows` with `only`, wired into the areas by the routes): the modes Wunschliste and Ausrüstung in the Sammlung (above the mode, not while measuring or managing locations), AI access in "KI-Clients" and the three achievement functions in "Erfolge"; each row links to the lock page, nothing is blocked (FR-ONB-04). The API answers a direct request for a locked function with `409 onboarding.locked` and the same data. **Known limit:** the German texts of the reasons and ways are a web message table (`unlock-texts.ts`), not part of `ERROR_TEXTS`.

### US-ONB-06 · "Was die App kann": one fixed overview · ✅ new

As a **plant keeper** I want a place that lists everything the app can do, so that I find a function without remembering a tip.

Acceptance criteria:

- Given the section "Was die App kann" in the destination "Konto" (help; same place in every view, US-QS-09), then it lists every function of the app with its state: **aktiv**, **gesperrt** with reason and way (US-ONB-05) or **freischaltbar** with the button "Jetzt freischalten". Functions switched off by the operator are not listed (FR-ONB-03).
- Given a function is listed, then it names in one sentence what it is for and has a link that opens it (or its lock page).
- The list is derived from the same registry as the navigation and the unlock rules (FR-ONB-02): **Test:** every navigation function has an entry in the overview, and the path for style `many` (everything open) yields the same list with all entries `aktiv`. A new navigation function without an entry fails the test (P-06).
- The list is ordered by the navigation, not by state, and is the same for everybody (US-QS-09: stable names and order).
- Given calm mode, then the overview stays (it is information), without the entries named in US-ONB-05.
- Given the page is empty of locked functions (style `many`, or everything open), then it says "Alles ist offen" and names the next action (P-09).

State of implementation: the section "Was die App kann" (`/account#funktionen`, after "Was wird gemessen?", also in the in-page section list) is a lazy chunk of its own, wired in by the route because no area imports the shell. It reads the states the app already loads (`GET /onboarding/unlocks`), so it lists the registry in navigation order, the same list for `few` and `many`; switched-off functions are missing and, in calm mode, so are the entries that are not announced. Each row shows the name, the state word (**Aktiv**, **Freischaltbar** with "Öffnet sich von selbst: noch 28 Tage oder lege 5 Pflanzen an" and the button "Jetzt freischalten", **Gesperrt** when no tap may open it), one sentence of purpose (`function-purposes.ts`) and a link (the function, or its lock page while locked). One tap unlocks and says in one sentence what may still be empty (P-09); a failure stays visible with a retry (P-10). Without a locked function it says "Alles ist offen." with the link "Weiter zu Heute". The registry test (`function-overview.test.tsx`) fails when a navigation destination has no registry entry, or a registry function lacks name, purpose, address or empty-state text; the `many` path yields the same list with every entry `aktiv`.

### US-ONB-07 · Calm hints that can be dismissed · ✅ new

As a **plant keeper** I want hints to be short, rare and easy to dismiss, so that the app never nags.

Acceptance criteria:

- Given an occasion (first plant saved, plant without place, first measurement possible, a function unlocked by the rules), then at most one hint is shown for it, at the place where it helps, in at most 12 words (starting value). Occasions have fixed ids in the domain logic.
- Given I dismiss a hint ("Okay" or "Nicht mehr zeigen"), then it never returns for this occasion; the dismissal is stored per account (DM-ONB-03), not per device.
- Given a hint was shown and not dismissed, then it stays at most 7 days and then leaves without coming back (starting value, assumption); nothing is lost, the way stays in the function overview (US-ONB-06).
- Given at most one hint is visible at a time per view, then more than one occasion waits and shows later, in a fixed order.
- Given calm mode is on (US-ACH-08) or style `many`, then no hint is shown; the information stays in the overview and the lock pages.
- Given a function is looked for (search, direct link, the overview), then it is never held back by a hint or a tour: hints add, they never block (nothing hidden that is looked for).
- No modal, no tour with arrows, no blocking overlay, no confetti (FR-ONB-08); hints are announced as text for screen readers and reachable by keyboard (NFR-13).

State of implementation: the table `account_hint` (DM-ONB-03, migration `0082`, same-account row rule, isolation test) holds per account and occasion the local date the hint was first shown and the date of its dismissal; the end of the first-plant guide ("Einstieg beenden") is the same kind of row with the reserved id `first_plant_guide`, so it holds per account and no longer per device (the localStorage key is gone). The domain logic `pickHint` in `core` (module `account/onboarding/hint`) holds the fixed occasion order (`first_plant_saved`, `plant_without_place`, `first_measurement`, `function_unlocked`) and decides which single hint is due: none in calm mode or under style `many`, none after a dismissal, none once it was first shown more than 7 days ago (starting value, assumption), otherwise the first due in the fixed order. The validating operations `onboarding.show_hint` (keeps the first date) and `onboarding.dismiss_hint` store it; an unknown id gives `onboarding.unknown_occasion`. `GET /onboarding/hints?timeZone=&applicable=a,b` answers `{ hint, guideEnded }`, `PUT /onboarding/hints/:occasion` with `{ state: "shown" | "dismissed", timeZone }` stores it. The web shows the hint `first_plant_saved` ("Deine erste Pflanze ist da. Miss sie, dann siehst du ihr Wachstum.", at most 12 words, test) as a quiet note with "Okay" on the start page, loaded as its own chunk; it is no modal, no overlay and blocks nothing, a failed save keeps the note and says so (P-10). The other three occasions are wired in the web too, each as its own lazy chunk (`ContextHint`) that loads only when an occasion applies: `plant_without_place` and `first_measurement` at the list of plants (a plant without location; active plants and none measured yet), `function_unlocked` on the start page (a function staged by a rule is open). The server still decides which single one is due; texts are at most 12 words (test). The repeated question "Wo steht sie?" for a second plant is the hint `plant_without_place` plus the location choice of the create form (US-ONB-02); it returns only while a plant has no place and the hint is not dismissed. Keyboard order and the status announcement are tested (jsdom), not yet on a real screen reader. **Known limit:** an old local skip flag of a device is ignored, so one more offer of the guide is possible for an account without a plant.

### US-ONB-08 · Measure the introduction and test it with people · 🟨 new

As an **operator** I want to know whether the introduction works, so that it is improved with facts and not with guesses.

Acceptance criteria:

- Target values (starting values, assumptions, decided by the PO; not measured yet, P-08): median time from first open to the saved first plant at most 90 seconds; at most 3 steps; at most 25 percent of new accounts without a plant after 7 days; a person who has never seen the app needs no help text and no outside explanation to save the first plant.
- Given the targets, then they are read from existing data only (account creation date, date of the first specimen, count of steps by construction), aggregated for the operator, with no tracking of individuals, no third-party analytics and no event log of clicks (P-05, NFR-10).
- Given a release that changes the introduction, then a usability test with 3 to 5 casual users (people who do not keep plants regularly) runs on the real app with the protocol template `docs/records/test-logs/template-onboarding-usability.md` (skill `story-test-protocol`): task "Lege deine erste Pflanze an", no help allowed, observed: time, steps, places where the person hesitated or went wrong, questions asked, abandonment.
- The protocol records the results as observed. Results are never invented; empty cells stay empty. A finding becomes an issue labelled `epic:ONB`.
- The test is repeated after every change of the order or the unlock rules and its result is linked in the release PR (US-DEV-06).
- Status: the template ships with this epic, the first run belongs to the release in which US-ONB-01 ships.

State of implementation: the operator area (`GET /operator/introduction`, section "Einstieg" in "Betreiber", migration `0083`) shows the three measures against the targets from existing data only: the median seconds from the creation of an account to the creation of its first specimen, the share of accounts that are at least 7 days old and have no specimen (an archived one counts as a plant), and the steps of the guide by construction (`FIRST_PLANT_STEPS`). The window is the accounts created in the last 90 days (starting value). The database function `operator_introduction()` is `security definer`, checks the operator role again and returns counts and one median, never an account; no click and no event is stored, no third party is involved. It opens no row rule: it reads the first specimen of each account of the window under the normal row rule by taking over that account inside the function (migration `0084`; two-account tests show that no one else sees a foreign specimen). A figure with fewer than 5 accounts behind it is `NULL` already in SQL (also the count of accounts) and shows as "unbekannt (zu wenige Konten)", the target stays visible (P-08, P-05); `core` repeats the check. **Known limits:** the time starts at the creation of the account, not at the "first open" (which is not stored); accounts of the vault-era or before the new flow are inside the window until they age out. The protocol template `template-onboarding-usability.md` is complete for a run (task, time, steps, questions asked, hesitation, abandonment, findings with label `epic:ONB`). **Open:** the first usability run with 3 to 5 casual users on the real app has not taken place; no result is recorded and none is invented. The story stays 🟨 until that run is done and linked in a release PR.

## Data model

### DM-ONB-01 Keeper style (extension of the account settings)

`Account`, `Style` (`few | many`, default `few`), `Chosen_At?` (local date). One row per account; tenant data (P-04), private (P-05). Existing accounts get `many` when the rules ship (FR-ONB-06).

### DM-ONB-02 Manual unlock

`Account`, `Function` (id from the registry), `Unlocked_At` (local date), `Source` (`tap | style_many | existing_data`). Written only by the validating operation; never deleted by the app (P-10). The lock state itself is **derived** and never stored (NFR-04); only the keeper's decision is.

### DM-ONB-03 Dismissed hint

`Account`, `Occasion` (id), `Dismissed_At` or `Last_Shown_At` (local date). Used for "once per occasion" and the 7-day expiry of US-ONB-07. Tenant table.

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                           | Status          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| FR-ONB-01 | Lock states, reasons and ways are pure domain logic without I/O, derived live from counts, dates and settings, never stored; menu, start page, overview, API and AI client use the same function (P-02, NFR-04).                                      | ⬜              |
| FR-ONB-02 | One registry of functions drives navigation, overview and unlock rules. A test fails when a navigation function has no registry entry or no overview entry, and checks that the style `many` path lists the same functions (P-06).                    | ⬜              |
| FR-ONB-03 | Staged is not switched off: a function the operator switched off (`social`, `ai`, `recommendations`, US-DEV-06) is neither shown nor announced; an unlock never overrides a switch. A locked function is announced with reason and way, never hidden. | ⬜              |
| FR-ONB-04 | A lock only stages the introduction in the interface. It is no permission: operations, API and the AI client stay usable, tenant isolation and rights are unchanged (P-03, P-04, KI-R1); existing data always keeps its function open (P-10).         | ⬜              |
| FR-ONB-05 | Every lock, hint and empty state says what to do next (P-09). Nothing disappears silently: unlocked functions stay open, dismissed hints are findable in the overview (P-10).                                                                         | ⬜              |
| FR-ONB-06 | Migration: accounts that exist when the rules ship are set to style `many`, so nobody loses a function they use; new accounts start with `few` (forward-compatible, US-DEV-07).                                                                       | ✅              |
| FR-ONB-07 | No invented numbers: all thresholds are marked starting values in one table; the days left are calendar dates, an unknown date shows "unbekannt" (P-08).                                                                                              | ⬜              |
| FR-ONB-08 | No gamification of the introduction: no level, rank, title, points, streak, badge, confetti or leaderboard; no countdown pressure; no comparison with other keepers. Unlocks are not achievements (ACH) and are not shared with friends (P-05).       | ⬜              |
| FR-ONB-09 | Accessibility (NFR-13): lock markings and hints are text, reachable by keyboard and announced; 360 px layout; reduced motion respected (US-QS-14). Texts are German, kept in message tables.                                                          | ⬜              |
| FR-ONB-10 | Out of scope: guided tours with arrows, video tutorials, progress bars with percentages, reminders by e-mail or push to "finish setup", A/B tests on individuals, per-click analytics, unlocks sold or earned by money or activity points.            | ⬜ (deliberate) |

## Dependencies and build order

Decided by the PO. Priority P1 for the new order of the start, P2 for the rest; release R1 (assumption), so as early as possible and before the app is opened beyond the three start users (stage 2).

| Order | Story     | Priority | Release | Depends on              | Why here                                                             |
| ----- | --------- | -------- | ------- | ----------------------- | -------------------------------------------------------------------- |
| 1     | US-ONB-01 | P1       | R1      | US-ACC-03, US-BES-02    | The reported problem; reorders the start with the first plant first  |
| 2     | US-ONB-02 | P2       | R1      | US-ONB-01, US-LIC-01/02 | Removes the structure questions and the permanent nag cards          |
| 3     | US-ONB-04 | P2       | R1      | US-ACH-08, US-DEV-06    | Pure rules, no UI; basis for everything staged                       |
| 4     | US-ONB-03 | P2       | R1      | US-ACC-02, US-ONB-04    | Style setting before any function is locked                          |
| 5     | US-ONB-05 | P2       | R1      | US-ONB-04, US-QS-14     | Locks only ship together with reason, way and the unlock tap         |
| 6     | US-ONB-06 | P2       | R1      | US-ONB-04, US-ONB-05    | Fixed overview and the registry test                                 |
| 7     | US-ONB-07 | P2       | R1      | US-ONB-01, US-ACH-08    | Hints once the occasions exist                                       |
| 8     | US-ONB-08 | P2       | R1      | US-ONB-01               | Protocol template with the first story, first run before the release |

No lock ships before US-ONB-05 and US-ONB-06 (FR-ONB-02, FR-ONB-03): staging without transparency is not allowed.

## Assumptions, decided by the PO (revisable)

- Learning by doing: no step needs an explanation; at most a short hint at the place.
- Order by benefit: first plant first, locations and light zones later with defaults.
- Two keeper styles, chosen at the start, changeable at any time; no level, rank or title.
- Staging by count or time since the first plant; all thresholds in the table above are starting values (28 days, 3 and 5 plants, 365 days).
- Staged means announced: locked functions stay visible with reason and way, unlockable by tap at any time.
- Hints are quiet: dismissible, once per occasion, off in calm mode, nothing hidden that is looked for.
- Measurable targets (90 seconds, 3 steps, 25 percent without a plant after 7 days) are starting values.
- Release R1 and priorities P1 (US-ONB-01) and P2 (rest); the owner may overrule per ticket.

## Open questions

1. **Defaults:** is one location "Zuhause" the right default, or should the first plant's place be asked with a photo of the spot?
2. **Anniversaries:** the first anniversary is a date, not a count; it follows the year in review rule here. Is that right?
3. **Style for invited users:** should an account created by invitation start as `many` when the inviter has a large collection? Today: no, `few` for everybody.
4. **Existing test accounts:** FR-ONB-06 sets them to `many`; is that also right for the three start users?

## Risks

| Risk                                                               | Countermeasure                                                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Locks feel like a paywall or a level system.                       | Visible with reason and way, one tap to unlock, no gamification words (FR-ONB-08, US-ONB-05).              |
| A function is lost to a new keeper because it is hidden.           | Registry test, fixed overview, never a 404, direct links work (FR-ONB-02, US-ONB-05, US-ONB-06).           |
| Operator switch and unlock are confused.                           | Separate states `switched_off` and `locked`, test per combination (FR-ONB-03, US-ONB-04).                  |
| Default location and zones do not fit and bring wrong care advice. | Light need is shown as a value to change, unknown stays unknown, the place is a hint (US-ONB-01/02, P-08). |
| Thresholds are wrong for real keepers.                             | Starting values in one table, usability test and data after release (US-ONB-08).                           |
