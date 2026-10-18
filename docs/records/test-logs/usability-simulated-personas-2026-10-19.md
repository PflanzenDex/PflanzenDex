# SIMULATED PERSONAS, NOT A USER TEST

Usability walkthrough of the introduction and unlocking (epic ONB, US-ONB-08) by an agent that plays five personas against the locally running app. This is a heuristic review. **No human took part, no timing is a human timing, and nothing here counts as agreement or disagreement of real users.** It does **not** close US-ONB-08 (the test with 3 to 5 casual users using `template-onboarding-usability.md` is still open). Where this log says "the person" it means a persona played by the agent.

**Date:** 2026-10-19
**App:** `origin/dev` @ `92704a32`, own worktree `docs/onb-08-simulated-personas`, no product code changed.
**Environment:** WSL2/Linux, Node 25.8 (the repo asks for 24), PostgreSQL 16 container on port 54823 with its own database (not the shared test database on 54329), API port 55323, web (Vite) port 55823, Keycloak 26.8 from `make auth-up` (port 18081, shared), Chromium via Playwright MCP. Locale de-DE, Europe/Berlin.
**Changes at runtime that are not in the repo:** (1) API and Vite were started by hand with the worktree ports (`make dev` ignores them, issue #904); (2) the port 55823 was added to the Keycloak web client with `web-port.mjs` (needed `KC_ADMIN_PASSWORD` in the environment, #904); (3) the species catalog was filled with `npm run seed:catalog -w @pflanzendex/api` (51 dev seed species; a fresh database has none); (4) first and last names were set for `test2` and `test3` through the Keycloak admin API, and the account `kira` was created the same way, to avoid the forced profile form (#904).
**Method:** real sign-in through Keycloak, then the tasks below through the UI (accessibility tree, clicks, keyboard, a few `evaluate` calls to read texts, sizes and focus). Screenshots in `usability-simulated-personas-2026-10-19/`. Legend for severity: **blocked** (the task cannot be finished), **confused** (finished or nearly, but misleading, hidden or needs outside explanation), **cosmetic**. Leading criterion: a step that needs an instruction is designed wrong.

## Personas and accounts

| Persona                                     | Account | Width              | Tasks                                                                                                  |
| ------------------------------------------- | ------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| Anna: casual, two houseplants, no knowledge | `test`  | 390 px             | first plant, measurement, find "Was die App kann", locked function, calm mode                          |
| Ben: power user, wants speed                | `test2` | 1440 px (then 390) | first plant, style "many", more plants, overview, locations, offer for friends                         |
| Clara: swaps with friends                   | `test3` | 390 px             | unlock Friends, friend request, wish, `/friends/match`, request an offer                               |
| Kira: keyboard and screen reader            | `kira`  | 1280 px            | Tab, Enter, Space only: sign-in, first plant, lock page; focus, names, roles, contrast, reduced motion |
| Phone pass                                  | all     | 390 px             | no horizontal scroll, tap targets, reading order (Anna and Clara ran on the phone width)               |

## Results by persona

### Anna (390 px)

| Task                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                  | Severity | Issue      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------- |
| Enter the app           | Landing page with "Konto anlegen" and "Anmelden", sign-in through Keycloak. The seeded account first had to fill a profile form (test-setup artefact, `a02-profile-required-mobile.jpg`).                                                                                                                                                                                                                                               | cosmetic | #904       |
| First plant             | "Schritt 1 von 2: Art wählen", one field and one sentence; then "Schritt 2 von 2: Pflanze speichern". 2 steps by construction (target at most 3). Interactions from the landing page to the saved plant: 7 (sign-in 3 incl. profile form, search, hit, "Weiter", "Pflanze speichern"). Wall-clock about 78 s including tool latency: **not a measurement**. "Lichtbedarf: Lampe 3 (laut Art)" is unexplained for someone without lamps. | confused | #897       |
| After saving            | "Fensterblatt ist angelegt", "Wo steht sie?" (one choice), two filled primary buttons, then a second question "Wie nutzt du die App?" and the next-step button "Miss deine Pflanze". The place silently changed the zone to Lampe 2 (see Sammlung card). Answers give no feedback.                                                                                                                                                      | confused | #895       |
| Sammlung with one plant | Lock rows say "lege deine erste Pflanze an" although the plant exists (stale until reload); the plant card is below a lock block, a hint and a light distribution chart ("dünnste Zone").                                                                                                                                                                                                                                               | confused | #892, #897 |
| Measurement             | "Was messen? Höhe." is clear; form works, "Gespeichert: 12,5 cm am 19.10.2026."; five empty stat rows come first, a 90-day message follows the first value.                                                                                                                                                                                                                                                                             | cosmetic | #901       |
| Find "Was die App kann" | On the phone nothing visible leads to it; Konto is about 12,600 px tall, the section starts near 8,100 px. Reached only by typing the address. The overview itself is good: every function with state, one sentence and an action.                                                                                                                                                                                                      | confused | #893       |
| Locked function         | "Freunde" in the bottom bar says "Noch gesperrt"; the lock page gives reason and way ("lege noch 4 Pflanzen an") and "Jetzt freischalten", but not what the function is. One tap opens it; the opened page is a long wall of text.                                                                                                                                                                                                      | confused | #898, #899 |
| Calm mode               | Checkbox "Ruhemodus" (44 px label, status "Ruhemodus ist an.") works; "Erfolge" disappears. The overview still lists and offers the three achievement functions.                                                                                                                                                                                                                                                                        | confused | #894       |

### Ben (desktop, then phone)

| Task                             | Result                                                                                                                                                                                                                                                                                                                      | Severity | Issue |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| First plant, style "many"        | Same two steps; "Später" for the place, then "Ich verwalte viel, zeig mir alles". Afterwards no lock rows, no "Noch gesperrt" label, the overview says "Alles ist offen. Weiter zu Heute" (works as specified).                                                                                                             | none     |       |
| More plants                      | "Weiteres Exemplar: Art wählen" leaves Sammlung for Entdecken, Katalog, a species page with 15 fields, "Diese Art wählen", then a form with six fields. About 6 interactions and 3 pages per plant instead of the 2 steps of the first one. Only two plants were created, not "many".                                       | confused | #896  |
| Locations and light zones        | "Standorte und Lichtzonen" lists Lampe 1 to 4 and "Zuhause, Lampe 2, innen"; the page is dense but fits a power user. Default location carries a zone, which overrides species light.                                                                                                                                       | confused | #895  |
| Overview (`/account#funktionen`) | Cold load lands about 5,900 px above the section; the section list highlights the right entry while the settings form is on screen.                                                                                                                                                                                         | confused | #893  |
| Offer for friends                | Select specimen, inline "Jetzt für Freunde freigeben", "Angebot erstellen": 3 interactions, clear.                                                                                                                                                                                                                          | none     |       |
| Friend request                   | Code generated on `/friends`, request from Clara shown with "Annehmen/Ablehnen". Accepting worked (status "Du bist jetzt mit Clara Tausch befreundet."). The mouse click on "Annehmen" did not fire twice in this browser session while a DOM click did; cause not determined (tool or app), **not reported as a finding**. | none     |       |

### Clara (390 px)

| Task                        | Result                                                                                                                                                                                                                                                                        | Severity    | Issue      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| Unlock Friends, add friend  | Lock page, "Jetzt freischalten", "Code eingeben", "Anfrage senden", status "Anfrage gesendet. Sobald die Person sie annimmt, seid ihr befreundet." (clear).                                                                                                                   | none        |            |
| Wishlist                    | Row "Noch gesperrt" above a usable wishlist; the form has seven free-text fields; saving a wish removes the row. Typing the Latin name matched the friend's offer later.                                                                                                      | confused    | #898, #902 |
| Start page                  | "Freunde haben 1 neue Pflanze: Ben Power: 1 × Efeutute" shows after the friendship (good P-09 signal).                                                                                                                                                                        | none        |            |
| Swap cards `/friends/match` | Card "Efeutute, von Ben Power · Steckling · Tauschen, Auf deiner Wunschliste: Epipremnum aureum", buttons Nein, Später, Ja, with a three-sentence explanation. Tap "Ja": "Das ist dein eigenes Angebot. Du kannst es nicht selbst anfragen." The same on `/friends/exchange`. | **blocked** | #891       |

### Kira (keyboard and screen reader, 1280 px)

| Check                    | Result                                                                                                                                                                                                                             | Severity | Issue |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| Sign-in and first plant  | Entire flow with Tab, Space, Enter: search, hit (aria-pressed), "Weiter", "Pflanze speichern". Focus moves to the step heading on each step and to "Bogenhanf ist angelegt". Skip link "Zum Inhalt springen" is the first stop.    | none     |       |
| Focus visibility         | Every tested control showed a ring (box-shadow), no element had a bare `outline: none` without a ring.                                                                                                                             | none     |       |
| Names and roles          | Landmarks, headings and buttons have names (accessibility tree); the hit list is a labelled list ("Treffer"); locked navigation items read "Freunde, Noch gesperrt" (text, not only colour).                                       |          |       |
| Announcements            | Step changes use `role=status`; the search results and the selection are not announced (empty live regions); disabled "Weiter" has no reason.                                                                                      | cosmetic | #903  |
| Lock page                | Title stays "PflanzenDéx"; focus is on BODY on arrival (7 Tab presses to the button); after Enter the button vanishes and focus falls back to BODY; the status message is announced.                                               | confused | #900  |
| Contrast                 | Computed text colour against the nearest background on the first-plant screen and the collection (213 elements, no opacity or gradient handling): no text below 4.5:1 (3:1 for large text). This is a rough check, not an axe run. | none     |       |
| `prefers-reduced-motion` | With the preference on, every transition is `0.001s` (global override); no running animation found.                                                                                                                                | none     |       |
| Targets and overflow     | Phone width: no horizontal scroll on the pages visited; interactive elements at least 44 px high except the 20 px checkbox boxes, which sit in 44 px labels.                                                                       | none     |       |

## Summary of findings

| ID   | Severity | Priority | Issue | Title                                                                                        |
| ---- | -------- | -------- | ----- | -------------------------------------------------------------------------------------------- |
| F-01 | blocked  | P1       | #891  | Friend's swap offer cannot be requested ("Das ist dein eigenes Angebot")                     |
| F-02 | confused | P2       | #892  | Lock texts are stale after the first plant is saved                                          |
| F-03 | confused | P2       | #893  | "Was die App kann" not reachable on a phone; cold-load anchor lands in the wrong place       |
| F-04 | confused | P2       | #894  | Calm mode: overview still lists and offers the achievement functions                         |
| F-05 | confused | P2       | #895  | First plant: place step silently replaces the light need; two primary buttons compete        |
| F-06 | confused | P2       | #896  | Second and later plants take a longer, different path                                        |
| F-07 | confused | P2       | #897  | Jargon and explanation paragraphs (Lampe, Vergeilt, Soll-Standort, Fangdatum, Ruhemodus)     |
| F-08 | confused | P2       | #898  | Lock page without purpose; locked wishlist is usable below its lock row                      |
| F-09 | confused | P2       | #899  | Friends and exchange: next step buried                                                       |
| F-10 | confused | P2       | #900  | Lock page: no document title, focus lost after unlocking                                     |
| F-11 | cosmetic | P3       | #901  | Measure screen: empty stat rows first, 90-day message after the first value                  |
| F-12 | cosmetic | P3       | #902  | Wish form: seven free-text fields, no picker                                                 |
| F-13 | cosmetic | P3       | #903  | Search results not announced; disabled "Weiter" without reason                               |
| F-14 | confused | P2       | #904  | Local dev setup: ports, `web-port.mjs` path, seeded users, empty catalog (process, epic DEV) |

Counts: 1 blocked, 10 confused, 3 cosmetic (14 issues, all Release R1). The Priority and Release fields were set on the board "PflanzenDex Roadmap"; the label is `epic:ONB` (`epic:DEV` for F-14).

## Against the targets of US-ONB-08

| Target                                     | Observation (simulated, not measured)                                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| At most 3 steps to the saved first plant   | 2 steps by construction ("Schritt n von 2"). Three more decisions follow on the same card (place, style, next action) before the person reaches the collection.    |
| Median at most 90 s                        | Not measurable by an agent. Anna's run took about 78 s wall-clock including tool latency; it says nothing about people.                                            |
| No help text or outside explanation needed | The two first-plant steps need none. The words "Lampe", "Lichtbedarf" and the place question already raise questions (F-05, F-07); later screens carry paragraphs. |

## What could not be checked

- Everything a person does: hesitation, reading, wrong turns, the 90-second target, abandonment, whether wording is understood. All of it is open until the real run.
- A real screen reader (NVDA, VoiceOver, TalkBack); only the accessibility tree, focus order and live regions were read. No axe run, no dark mode, no forced-colours mode, no zoom to 200 percent, no widths other than 390, 1280 and 1440 px, no real phone, no touch or swipe gestures (the match cards were operated with buttons).
- Ben's "many plants, lamps and zones": only two plants and the default zones were created. Photos, treatments, equipment, AI access, push reminders, the dismissible hints of US-ONB-07 and the second-plant place question (US-ONB-02) were not walked through. Discover (swipe suggestions) was not opened.
- The swap request itself (F-01 blocks it): counter-offers, acceptance and hand-over were not reached. Whether F-01 is a product defect or a result of the local database owner (superuser) is not confirmed.
- Registration of a new account with email confirmation (accounts were created through the Keycloak admin API), invitation-only mode, the operator area "Einstieg".
- Browser tool behaviour: in several sessions mouse and keyboard input stopped reaching the page until the browser was restarted, and a few clicks (for example "Annehmen", "Abmelden" right after load) had no effect while the same action by DOM click worked. These were treated as tool artefacts and are not findings; every result above was reproduced or read directly from the page.

## Open points

- Run the usability test with 3 to 5 casual users on the real app (`template-onboarding-usability.md`) after F-02, F-05 and F-06 are decided; this log cannot replace it.
- Confirm or rule out F-01 with a production-like database owner role.
- Link this log in the release PR next to the later human run (US-DEV-06).
