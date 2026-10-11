# 10 – Epic SOZ: Social (Friends, Feed, Swapping)

Goal: collecting and caring become shared. The plant keeper sees what friends have newly collected and can swap plants and cuttings without their collection becoming public.

Replacement: replaces `../prototype/11-social.md`. Dropped: the "hub" as a separate exchange layer and the requirement that the vault stay the source of truth. In the app friends, sharing settings and swaps are **built-in functions** on shared data storage. That simplifies the handover considerably (one transaction instead of reconciling two vaults).

## Terms

| Term            | Meaning                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Friend          | Another keeper with a **confirmed** friendship (mutual).                                                         |
| Sharing setting | Per specimen: `private` (default) or `friends`.                                                                  |
| Offer           | Specimen or cutting that a keeper offers to friends for swapping or giving away.                                 |
| Swap            | Process request → acceptance → handover. Giving away without a counterpart ("gifting") is a swap without return. |
| Provenance      | Note on the recipient's specimen: from whom, when.                                                               |

## User stories

### US-SOZ-01 · Request a friendship · ✅ new

Acceptance criteria:

- "Invite friend" creates an invitation link or code that I pass on outside the app.
- If someone redeems it (with or without an existing account), a request with the display name arrives at the inviter. Not yet a friendship.
- A code is single-use and expires after 7 days; expired or used codes are clearly rejected.
- No self-invitation; a duplicate request creates no second one.
- There is no open user search; friends find each other only via invitation (FR-SOZ-08).

Assumptions, decided by the PO (revisable):

- A friend code is 24 characters of the same code alphabet as the access invitation (US-ACC-05), shown in groups of four and typed case-insensitively. It is not an access invitation: it needs an existing account, and with registration by invitation switched on the newcomer first needs an access invitation.
- A refused redemption (own code, request or friendship with the person exists in either direction) does not use the code up. Redeeming the same code again as the same account returns the existing request and writes nothing.
- Unknown, used and expired codes are rejected with their own error (`friend.unknown_code`, `friend.code_used`, `friend.code_expired`); unlike the access invitation this reveals nothing worth protecting, because the person holds the code.
- Both sides store the display name of the other side at the time of the request; a side without a display name is stored as unknown (P-08). After an ended friendship a new request is allowed and reuses the stored rows.
- Open requests are visible only to their two sides, with the display name and nothing else (P-04, P-05). The number of open codes per account is not limited yet (assumption: no abuse expected; revisit with US-SOZ-12).

### US-SOZ-02 · Answer a friendship request · 🟨 new

Acceptance criteria:

- Open requests appear in the app and as a notification (US-SOZ-12).
- Accepting makes the friendship effective on both sides. Declining discards silently; the other side learns only "not accepted".
- Before acceptance only the display name is visible, no collection.

Assumptions, decided by the PO (revisable):

- Declining sets both sides to `declined`. The decliner's list shows nothing of it; the sender sees "Nicht angenommen" next to the name, with no reason and no time. The entry stays until the sender gets a new request accepted or declined with a new code (a new code replaces it); a way to dismiss it comes with US-SOZ-03.
- Only the receiver of a request can answer. An id that is unknown, belongs to another account or to a request the caller sent answers `friend.request_not_found`, so existence does not leak (P-04).
- Answering twice the same way writes nothing; answering the other way afterwards is refused with `friend.request_answered` (no taking back an answer; ending a friendship is US-SOZ-03).
- Accepting stores the same start time on both rows; there is no accept-timeout and no limit of open requests.
- The page "Freunde" (navigation entry, path `/friends`) combines US-SOZ-01 and US-SOZ-02: open requests, confirmed friends (name and since when only), invite with a code, enter a code. It shows no collection data and no counts against each other (P-05, FR-SOZ-11).
- The notification about an open request is US-SOZ-12 and not part of this story.

### US-SOZ-03 · Manage friends and end a friendship · 🟨 new

Acceptance criteria:

- "Friends": list with display name, start, number of shared caught species.
- Ending immediately withdraws collection, feed and offers from both sides. Own data and completed swaps (incl. provenance) remain.
- Open swap requests with the person are canceled (`canceled`). The other side is not actively notified.

Assumptions, decided by the PO (revisable):

- "Number of shared caught species" counts the species the friend has shared with me (US-SOZ-04) that I have caught too. Only shared specimens can be counted, so the number comes with US-SOZ-04; until then the list shows name and start only. It is shown as a plain number next to the name, never as a ranking or a comparison between friends (FR-SOZ-11); a friend who shares nothing shows "unknown", not 0 (P-08).
- Either side can end a confirmed friendship; both rows become `ended` in one transaction and keep the start and the stored display names. Only a confirmed friendship can be ended; ending twice writes nothing; an id that is unknown, foreign or still a request is `friend.not_found` (P-04).
- Ending withdraws everything that is visible only between friends from both sides at once: what a friend sees is always read through a confirmed friendship (P-05), so no data has to be deleted. The screen asks first and says what happens, including that what was already delivered cannot be retrieved (P-10). The other side is not notified and no longer finds the person in its list.
- A new request with a new code can restart an ended friendship; the old sharing settings do not come back by themselves (they are per specimen and checked against the friendship each time).
- Canceling open swap requests with the person belongs to the swap module (US-SOZ-10) and is checked there against the friendship status; it does not exist yet.

### US-SOZ-04 · Decide what friends see · 🟨 new

Acceptance criteria:

- Per specimen: `Share = private | friends` (default private) and `Share_Photos = on | off`.
- Private means: not in the collection, not in the feed, not in friends' counts.
- At most the following are shared: species (Latin + German), specimen name, caught date, status (cutting yes/no), the latest photo (only with `Share_Photos`). **Never** shared: location, measurement notes, treatments, markers, prices, wishlist, financial data.
- A global switch "Everything private" suspends all sharing settings without deleting them.
- Withdrawing takes effect immediately for future retrievals. What has already been delivered cannot be retrieved (note in the dialog).
- Bulk action: "Share all specimens of this species".

Assumptions, decided by the PO (revisable):

- A row in `sharing` means "shared with friends"; no row means private. Every specimen is private by default and nothing is written for that. `Share_Photos` is stored with the row (default off) and is off for a private specimen; withdrawing deletes the row, so the photo choice has to be made again when sharing again. The switch has nothing to act on before photos exist (US-WAC-05) and is not offered on the page yet.
- Friends read a shared specimen only through a confirmed friendship, checked in the database on every retrieval (`friend_shares()`): ending a friendship (US-SOZ-03) withdraws everything at once and deletes nothing; a new friendship does not bring old settings back by itself but they apply again, because the rows were never deleted (the owner can withdraw them first). A friend who shares nothing and a stranger look the same: an empty list (P-05).
- The global switch "Everything private" (profile, US-ACC-02) is applied when friends read: while it is on, friends see nothing; the sharing rows stay and apply again when it is switched off.
- What a friend gets is a whitelist: species (Latin and German name, only of approved catalog species: a private proposal stays unknown), the specimen name, caught date, cutting yes/no and the photo flag. A marker is part of the stored specimen name (DM-BES-03), so a specimen with a marker is shown under the species name alone; the marker is never shared. Archived specimens are never shown and cannot be shared; withdrawing them works.
- Only the keeper's own, active specimens can be shared; a foreign or unknown id is `specimen.not_found` (P-04). The bulk action shares every active specimen of the species in one transaction and answers how many it changed (0 is shown, not hidden, P-10).
- "Number of shared caught species" (US-SOZ-03) = species the friend shares with me that I have caught too (active specimens, compared by the Latin name); `null` = unknown when the friend shares nothing, never 0 by guess (P-08); shown as a plain number, no comparison between friends (FR-SOZ-11).
- Withdrawing takes effect for the next retrieval; the page says that what was already delivered cannot be retrieved. The consumers of the sharing (feed, counts in the feed, the collection view of a friend, US-SOZ-05 to US-SOZ-07) read it through `friendView` and do not exist yet; `GET /friends/:id/shared` is the one door they use.

### US-SOZ-05 · See which new plants friends have collected · 🟨 new

Acceptance criteria:

- Block "New among friends": events, newest first, per event: friend, species, date, photo if applicable, type.
- Types: **New species caught** (the species was not yet in the friend's Pokédex), **New specimen**, **New cutting**, **Potted**, **Swapped** (only if I am involved or both parties are my friends).
- Only specimens with `Share = friends` create events. The date is `Caught_At`, otherwise "unknown" (never guessed, P-08).
- Sharing an old specimen creates **no** event "new today", but carries its actual date.
- Events are summarized by species, friend and day ("N specimens").
- Default period 30 days. Filters: by friend, only "New species".

Assumptions, decided by the PO (revisable):

- The feed is derived on every request from what friends share (`friendView`), never stored (P-01, DM-SOZ-04): so it exists only through a confirmed friendship, never while a friend has "Everything private" on, and never shows a private specimen. It reads no table of another module.
- "New species caught" is judged by what the friend shares: a species is new on the earliest dated day among the shared specimens of that species, because the rest of the friend's collection is private. A species that is unknown to friends (a private catalog proposal) is never "new species". Precedence of the types: a cutting is "New cutting", the first specimens of a species "New species", every other one "New specimen".
- "Potted" and "Swapped" (assumption, decided by the PO): "Potted" is the repot day of a shared specimen. The repot operation records the keeper's local calendar day in `specimen.repotted_at` (migration 0047; the client sends the time zone, NFR-08); a repot without a known day, or one before this change, adds no event (P-08). The event is dated that day and summarized per species and day. "Swapped" is a handed-over swap (US-SOZ-11) the viewer took part in with a **current friend**: the port `SwappedSource` of `social` is filled by the app root from the viewer's own swap rows (ADR 0012), dated by the handover instant as the viewer's local day, one event per species and day, needing no sharing and shown even while the friend is "Everything private" because the viewer is involved. The second case of the criterion ("both parties are my friends") would need the swap rows of two other accounts and is not built: the feed would reveal a swap between two friends that neither of them agreed to show me (P-05). A swap with a former friend stays in the swap history (US-SOZ-13), not in the feed. The photo is missing until friends' photos exist (decided for US-SOZ-09).
- The date of an event is `Caught_At`; the period counts calendar days back from today in the viewer's time zone (today and the 29 days before, NFR-08). A shared specimen without a known date cannot be placed in a period: such events are listed after the dated ones as "Datum unbekannt" instead of vanishing (P-08, P-10).
- Events of the same friend, species, day and type are summarized ("N Exemplare"). The filter offers 7, 30 and 90 days (the API accepts 1 to 365), a friend, and "only new species". Ordering: newest first, then friend name, then species; no ranking and no comparison between friends (FR-SOZ-11). Every state says what to do next (P-09).
- The block "Neu bei Freunden" sits at the top of the page "Freunde". The banner and the "seen" state are US-SOZ-06.

### US-SOZ-06 · "New among friends" since my last visit · ✅ new

Acceptance criteria:

- "Seen" state per account on the server; on the first visit silent creation, no banner.
- Banner "Friends have N new plants: …" stays until "Okay".
- If the data is missing (no network), the block shows the last state with "As of DD.MM.YYYY" (FR-SOZ-03).

Assumptions, decided by the PO (revisable):

- "New" means visible to me since my last "Okay": the later of the moment the specimen was shared and the start of the friendship, not the catch date. An old specimen that is shared today is new to me today; a friend I made today shows everything as new once, and what I saw before is never new again. The seen state is one instant per account (`feed_seen`), private to it (P-04).
- The first visit creates the state silently: the banner is empty and the app marks the feed as seen up to the instant it read. There is no banner for what was shared before the person looked.
- "Okay" marks the feed as seen up to the instant the banner was read (`asOf`), not up to now: what became visible in between is still new. The state only moves forward and never past now; repeating the call changes nothing.
- The banner names friend and species with a count and nothing else (P-05); it shows nothing for private specimens, while a friend has "Everything private" on, or after the friendship ended. It stays until "Okay". It is shown on the start page and on the page "Freunde"; on the start page a failed load stays quiet (the page "Freunde" says it, P-10).
- Offline (FR-SOZ-03): the screens show the last loaded copy; every answer carries the instant it was read and the banner and the feed show it as "Stand: DD.MM.YYYY", so an older copy is recognizable. "Okay" needs a connection and is disabled without one (the write buffer of US-QS-10 is not used for it, because the banner would still say "new" afterwards).
- The server clock and the database clock are assumed to agree to the second; the comparison uses instants, not calendar dates (a visit is a moment, not a day).

### US-SOZ-07 · View and compare a friend's collection · 🟨 new

Acceptance criteria:

- The shared collection appears as collector cards in the style of US-POK-01; "caught" means: the friend has a shared active specimen.
- Per card "you have it" or "you lack it" (from my ownership, US-POK-06). Filters "I lack", "We both have".
- No rank or leaderboard comparison (FR-POK-11). Facts are shown, no rating.
- Shared equipment appears as the friend's device list (US-EQU-12).

Assumptions, decided by the PO (revisable):

- The view has its own address per friend (`/friends/<friendship id>`, reached by "Sammlung ansehen" in the friend list) and reads only through `friendView`: only what the friend shares, only through a confirmed friendship, nothing while "Everything private" is on (P-05). `GET /friends/:id/collection` derives the cards on every request; an id that is not one of my friends is `friend.not_found`.
- A card is one species the friend shares: Latin and German name, the number of shared specimens (cuttings counted separately), the earliest known catch date ("unbekannt" without one, P-08) and "Du hast sie" / "Du hast sie nicht" from my own active specimens, compared by the Latin name. A species that is unknown to friends (a private proposal) cannot be compared: the card says "Vergleich unbekannt" and is neither lacked nor shared.
- The cards follow the look of the collector cards (US-POK-01) but not their data: the Pokédex cards come from the catalog tree (number, genus size, light zone), while a friend's card only carries what the friend shares. "Caught" means the friend shares an active specimen of the species.
- Filters: "Alle", "Ich habe nicht" (`iHave` is false), "Wir haben beide" (true); cards with an unknown comparison show under "Alle" only. No rank, no leaderboard, no rating, no comparison between friends (FR-SOZ-11, FR-POK-11). Every state says what to do next (P-09); an empty filter points back to "Alle".
- "Auf die Wunschliste" on a species I lack records a wish by the Latin name through the existing wishlist operation, so its duplicate check applies; the wish does not yet record that a friend suggested it (no source field on the wish, US-WUN).
- The friend's device list (US-EQU-12) does not exist yet; the page says so. Everything else of the story is done.

### US-SOZ-08 · Offer a plant or cutting for swapping · 🟨 new

Module: the exchange (SOZ-08 to SOZ-11, SOZ-13) is its own module `swap` (ADR `docs/adr/0012-swap-module.md`, assumption decided by the PO): two-sided swap rows, states that only move forward, the handover only after both confirmations in one transaction, the cancelation when a friendship ends (SOZ-03) by a hook that the app root wires plus a lazy check on every transition.

Acceptance criteria:

- From the specimen card, "Offer for swapping" creates an offer: `Species`, specimen, `Type` (`cutting | plant | offshoot`), `Mode` (`swap | give away`), optional `Wish` and `Note`.
- Visible only to friends. A specimen has at most one open offer.
- Offering requires `Share = friends`; otherwise the dialog offers to set the sharing setting.
- **Health details:** automatically "treatment open" or "last treated: reason, date" from the treatments, without agent and notes. A specimen with an open pest treatment is offered only after explicit confirmation.
- Phase hint "currently dormancy phase", if applicable.
- Notice on species protection (e.g. CITES-listed cacti/orchids) when offering (FR-SOZ-09).
- Withdrawing at any time (`withdrawn`); open requests are canceled.

Assumptions, decided by the PO (revisable):

- The module is `swap` (ADR 0012). The offer is a tenant table of the giver; friends read open offers only through a database function of US-SOZ-09, never through the table. Health details and the dormancy phase are derived on every read (P-01).
- Entry point: until the specimen card of the redesigned "Sammlung" offers it, the dialog "Zum Tausch anbieten" lives on the page "Tauschbörse" (`/friends/exchange`, button "Zur Tauschbörse" on the page "Freunde"); the page is no destination of its own in the navigation. The button on the specimen card is open.
- An offer needs `Share = friends` of the specimen (`offer.not_shared`); the dialog shows this and offers to set the sharing with one tap. Only the keeper's own, active specimen can be offered; a foreign one is `specimen.not_found`, an archived one `specimen.archived`; a specimen has at most one open or reserved offer (database rule, `offer.already_open`).
- The treatments carry no pest category, so every open treatment counts as "treatment open": such a specimen is offered only after the explicit confirmation (`confirmTreatment`, `offer.treatment_open`). The health details name "Behandlung offen" or "Zuletzt behandelt: <reason>, <date>", never the agent and never a note; without any treatment the text is "Keine Behandlung bekannt", which does not say "healthy" (P-08).
- The phase hint "Zurzeit in der Ruhephase" comes from the care phase list of today in the viewer's time zone (NFR-08); a specimen without a phase shows none.
- The plant law notice (FR-SOZ-09) is one static text that mentions CITES as an example and says it is no legal advice; it informs and never blocks. There is no list of protected species in the system, so none is invented (P-08).
- Withdrawing works at any time while the offer is open or reserved, repeating it changes nothing, a handed-over offer is `offer.not_active`; withdrawn offers stay in the list (P-10). Canceling the open requests comes with the requests (US-SOZ-09, US-SOZ-10).
- Limits (assumption, starting values): wish 1 to 200 characters, note 1 to 500.

### US-SOZ-09 · See offers from friends and request them · 🟨 new

Acceptance criteria:

- "Swap exchange": open offers of all friends with species, type, mode, health details, photo (if shared), chip "you lack it".
- Filters: light zone of the species (fits my distribution, US-LIC-02), "you lack it", type.
- "Request" creates a swap. For `swap` I can attach one of my own specimens with `Share = friends` as a counter-offer or leave the return open (free text).
- Only one open request from me per offer; own offers cannot be requested.
- If the species is on my **wishlist**, a hint appears; the list itself is not transmitted (FR-WUN-07).

State of implementation: partly done. The page "Tauschbörse" shows "Angebote von Freunden" above the dialog of US-SOZ-08 (`GET /exchange/offers?timeZone=…[&type=…][&lack=true]`): species (German and Latin name, "Art unbekannt" while the species is not approved or unknown, P-08), giver (the name stored for the friend), type, mode, wish, note, health details (reason and date only, never agent or note, P-05), the dormancy hint, the chip "Fehlt dir" (the species is not among the caught ones; unknown for an unknown species) and the hint "Steht auf deiner Wunschliste" (asked per species through the port `WishHints`, never the list itself, FR-WUN-07; a wish counts when its folded name equals the folded Latin name, assumption). Filters: type and "you lack it". What a friend shows is decided by the database function `friend_offers()` (migration 0044, like `friend_shares()`): both friendship rows confirmed, the specimen shared with friends, the offer open, nothing while the owner has "Everything private" on; own offers never appear, a stranger sees nothing. "Anfragen" runs the validating operation `swap.request` (`POST /offers/:id/request`, `Idempotency-Key`) which calls the function `request_swap()`: both sides of the swap are written in one transaction (table `swap`, one row per side, `swap_id` shared, DM-SOZ-03; the giver's row is written as the giver by switching the account inside the function). For the mode `swap` the requester may attach one own specimen with `Share = friends` as the counter-offer (name copied into both rows) and/or free text (1 to 500 characters), or leave the return open; a gift takes no counter-offer (`swap.counter_not_allowed`, `swap.counter_not_shared`, `specimen.not_found`). Only one open request per requester and offer (`swap.already_requested`, a partial unique index); an own offer is `swap.own_offer`; an offer that is not an open, shared offer of a confirmed friend, also a foreign or unknown id, is `offer.not_found` and reveals nothing; a withdrawn offer is `offer.not_active`. The offer on the list then reads "Angefragt". Assumptions, decided by the PO (revisable): the filter by light zone (fits my distribution, US-LIC-02) stays out on purpose as long as there is no documented rule for "fits" (P-08); the photo of the offered specimen is not delivered in this phase, only the flag `photosShared` (access through the friendship can follow the pattern of US-WAC-05 later, P-05). **Missing:** the light zone filter (no rule for "fits"), the friend's photo (see above) and the manual test protocol; answering, the later states and the history are US-SOZ-10, US-SOZ-11 and US-SOZ-13.

### US-SOZ-10 · Answer a swap request · 🟨 new

Acceptance criteria:

- Actions: **Accept**, **Decline** (optionally with a reason), **Propose something else** (change the counter-offer).
- Accepting sets the offer to `reserved`; further requests for the same offer are declined automatically ("already given").
- If an acceptance is withdrawn before the handover, the offer goes back to `open`; the other side is notified.
- States exactly `requested → accepted → handed over`, terminal `declined`, `canceled`, `withdrawn`. Transitions only in this direction (DM-SOZ-03).

State of implementation: partly done. "Anfragen" on the page "Tauschbörse" shows both sides (`GET /swaps`): "Anfragen an dich" (I am the giver) and "Deine Anfragen" (I am the requester), each with the state in words, the counter-offer, the reason of a decline and the cause of an automatic end ("Schon vergeben", "Ihr seid nicht mehr befreundet", "Das Angebot wurde zurückgezogen"). The giver can **accept**, **decline** (optional reason, up to 200 characters), **propose something else** (the counter-offer is replaced by free text on both sides, the request stays open; the requester sees "Vorschlag von <name>") and, once accepted, **withdraw the acceptance** (`cancel`); the requester can **withdraw** a request or an acceptance. All through the validating operation `swap.answer` (`POST /swaps/:id/answer`, `Idempotency-Key`) which calls the function `answer_swap()` (migration 0045): both rows change in one transaction. Accepting sets the offer to `reserved` (it leaves the exchange list) and declines the other open requests for it automatically with the cause `already_given`; withdrawing or canceling an acceptance sets the offer back to `open`. States only move forward (`requested -> accepted`, terminal `declined`, `canceled`, `withdrawn`); repeating an action that already holds changes nothing; a wrong state is `swap.wrong_state`, the other side's action `swap.not_allowed`, an unknown or foreign id `swap.not_found` (P-04). Withdrawing an offer cancels its open and accepted requests on both sides in the same transaction (`cancel_swaps_for_offer()`, cause `offer_withdrawn`). Ending a friendship cancels the open swaps with that friend (cause `friendship_ended`): the hook `afterEnd` of `friend.end`, which the app root fills with `cancel_orphaned_swaps()` (`social` never imports `swap`, ADR 0012), plus the check of the friendship on every transition and when the list is read, so a failing hook never leaves a living swap behind a dead friendship. **Missing:** the active notification of the other side (no notification exists yet: US-SOZ-12, epic MON; today the other side sees the state when it opens the page), the handover (US-SOZ-11), the history view (US-SOZ-13) and the manual test protocol.

### US-SOZ-11 · Confirm the handover, update collection and Pokédex · 🟨 new

Acceptance criteria:

- The handover counts only when **both** sides have confirmed "handed over".
- **Giver:** the specimen is archived (US-BES-07) with `Archived_Reason: "Swapped with <display name>"` or `"Gifted to <display name>"`. It is thus missing from distribution, phases, Pokédex ownership.
- **Recipient:** a new specimen is created under the rules of US-BES-02/03 (naming rule, marker), `Caught_At` = handover date (local), `Provenance` set, `Share = private`. For `cutting`/`offshoot`: `Status = Cutting` and cutting light (US-BES-04); for `plant` the species' zone applies.
- The recipient catches the species in the Pokédex automatically; "Newly caught" applies (US-POK-12).
- Measurements, treatments and location of the giver are **not** passed on; the recipient starts with an empty history.
- Both see the swap in the history (US-SOZ-13) and as an event "Swapped" in the feed.
- **Atomic:** archiving and creating run in one transaction. If one fails (e.g. name conflict), the swap stays at `accepted` and reports the reason; there is never a half state (FR-SOZ-05).

State of implementation: partly done. An accepted swap shows "Übergabe bestätigen" (giver) and "Erhalt bestätigen" (recipient) on the page "Tauschbörse"; each side confirms once (`POST /swaps/:id/handover { timeZone, marker? }`, `Idempotency-Key`, operation `swap.handover`); after my confirmation the card says who is awaited. The first confirmation is recorded on both rows (`confirm_handover()`, migration 0046) and nothing else happens; the confirmation that completes it runs **one transaction** (`runHandover` in `db/src/swap`): the giver's specimen is archived as the giver with the reason "Getauscht mit <name>" or "Verschenkt an <name>" (US-BES-07; the name is the one stored at the request, local date in the confirming person's time zone, NFR-08), the recipient gets a new specimen of the same species as the recipient (`asAccount`, the connection-taking functions `archiveSpecimenOn`, `createSpecimenOn`, `listSpecimensOn` of `collection`) under the naming rule (DM-BES-03): `Caught_At` = the local handover date, status `plant` for the type plant and `cutting` for cutting and offshoot (US-BES-04: cutting light follows from the status), location from the recipient's own care profile through the target-location port (growth location for a cutting, location of the current phase for a plant; unknown without a profile, P-08; the giver's location is never used), `Share = private` (no sharing row), nothing but the species is passed on (no measurements, treatments or location); `finish_handover()` then moves both rows to `handed_over`, records the specimen given and the one received (the provenance "from <name>" is derived from the received specimen's swap row, shown with the history, US-SOZ-13) and marks the offer `handed_over`. A refused step (taken name, species not visible to the recipient, specimen gone, marker missing) rolls everything back: the swap stays `accepted`, nobody's collection changes, the last confirmation is not kept, and the error names the reason (`specimen.name_taken`, `species.not_found`, `specimen.not_found`, `specimen.marker_required`, ...; P-10). Assumption, decided by the PO (revisable): the recipient names the marker for the new specimen at the own confirmation when the naming rule asks for one (the species is in the collection already; the field "Kennzeichen" on the card), and the markers of further existing specimens are not asked in the handover (it refuses with `specimen.markers_missing`: assign them in the collection first). The Pokédex derives the catch from the new specimen (nothing stored twice, P-01). **Missing:** the event "Swapped" in the feed (the feed types "Potted" and "Swapped" belong to US-SOZ-05, a port of `social` filled by the app root), the history view and the display of the provenance (US-SOZ-13), the manual test protocol.

### US-SOZ-12 · Be notified about news · 🟨 new

Acceptance criteria:

- Triggers: new friendship request, request for my offer, acceptance/decline of my request, the other side confirmed the handover.
- New feed events trigger **no** individual message, only the banner (US-SOZ-06).
- Delivery by the rules of epic MON (US-MON-01, -08): only when action is needed, once per occasion and day. Without push, "Today" shows open points.

Assumptions, decided by the PO (revisable):

- Push and mail are not built: the channel decision E-10 ("web push + optional email") is a recommendation for release R3, and the delivery machinery (reminders, device registration, mail sending, quiet hours, US-MON-01 and US-MON-08) does not exist. This story therefore delivers the in-app part only; the channel stays on the owner's list (E-10) and a message needs the reminders of epic MON.
- The in-app notice is "Du hast N offene Freundschaftsanfragen: <names>" with the way to the answer ("Anfragen ansehen"), shown on the start page above the banner about new plants (US-SOZ-06). It is derived on every visit from the open incoming requests, so it needs no state and disappears when they are answered. Only the display name is named (P-05). A failed load stays quiet there; the page "Freunde" lists the requests and says if it cannot load them (P-10).
- Not yet notified: the acceptance or decline of my own request (the sender sees the friend in the list, or "Nicht angenommen" under "Anfragen", US-SOZ-02), the triggers of the swap module (request for my offer, answer, the other side confirmed the handover: US-SOZ-08 to US-SOZ-11 do not exist), and the central "Today" list: its items are specimen-bound and `today` does not depend on `social` in the module matrix, so open requests are not part of it; changing the matrix is a reviewed decision of its own.
- New feed events trigger no individual message, only the banner (unchanged, US-SOZ-06). The switch "friends" of the notification settings (US-ACC-02) is saved and will apply to push and mail; the in-app notice is not switched off by it, because it is no message.

### US-SOZ-13 · Swap history · ✅ new

Acceptance criteria:

- "Swap history": completed and canceled processes with date, friend, given/received, status.
- The history remains after ending the friendship; the friend appears with the stored display name.
- A received specimen shows "from <display name>" (provenance).

State of implementation: done (the manual test protocol is missing). "Tauschverlauf" on the page "Tauschbörse" (`GET /swaps/history`) lists the finished swaps of the account (handed over, declined, canceled, withdrawn), newest first, each with the date (the handover instant, else the last decision, else the request; shown as the keeper's local calendar date, NFR-08), the friend ("Gegeben an <name>" / "Erhalten von <name>"), species ("Art unbekannt" while unknown, P-08), type, mode, the status in words, the reason of a decline and the cause of an automatic end. Open requests are not history, they stay on the requests list (US-SOZ-10). The friend is the display name stored in the swap row at the request, so the history stays unchanged after the friendship ended and a friend without a name reads "einem Freund" (P-08); a swap whose friendship ended is canceled first (the lazy check of ADR 0012). Each account reads only its own rows (P-04). The received specimen carries its provenance: the port `ProvenanceSource` of the cards (`collection` defines it, `swap` implements it from `received_specimen_id` of the handed-over swap row; no extra table) gives each specimen card of the recipient the line "Erhalten von <name> am <date>"; the giver's archived specimen has no card (US-BES-07). Assumption: the date of the card line is the UTC date of the handover instant.

## Data model

### DM-SOZ-01 Friendship

`Account A`, `Account B`, `Status` (`requested | confirmed | ended`), `Since`, stored display names of both sides.

### DM-SOZ-02 Offer

`Giver`, `Specimen`, `Type`, `Mode`, `Wish`, `Note`, `Health` (derived), `Status` (`open | reserved | handed over | withdrawn`), `Created_At`.

### DM-SOZ-03 Swap

`Offer`, `Requester`, `Counter-offer` (specimen or free text), `Status` (`requested | accepted | handed over | declined | canceled | withdrawn`), `Confirmed_Giver`, `Confirmed_Recipient`, timestamp per transition.

### DM-SOZ-04 Event (derived)

`Account`, `Type`, `Species`, `Specimen`, `Date`, `Photo?`. Computed from shared specimens, not freely maintained (NFR-04).

## Requirements

| ID        | Requirement                                                                                                                                                                                                       | Status                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| FR-SOZ-01 | **Private by default:** without a sharing setting no specimen, photo or location leaves the account (P-05).                                                                                                       | ⬜                        |
| FR-SOZ-02 | All social data lives in the shared data storage of the app; there is no separate "hub" any more. Access only via account and friendship (NFR-09).                                                                | ⬜                        |
| FR-SOZ-03 | If a data source fails (no network), social blocks show the last state with a note.                                                                                                                               | ⬜                        |
| FR-SOZ-04 | Swap states, sharing filters and feed derivation are pure logic with tests (P-01).                                                                                                                                | ⬜                        |
| FR-SOZ-05 | The handover is atomic: archiving at the giver and creating at the recipient in one transaction.                                                                                                                  | ⬜                        |
| FR-SOZ-06 | Changes run only through validating operations (P-03).                                                                                                                                                            | ⬜                        |
| FR-SOZ-07 | No invented data: date and catch status come from shared specimens; "unknown" instead of guessing (P-08).                                                                                                         | ⬜                        |
| FR-SOZ-08 | Display names are freely chosen and no proof of identity. Friendship and swap require the mutual confirmation of the person; no open user search.                                                                 | ⬜                        |
| FR-SOZ-09 | **Plant law and health:** notices on species protection and pest infestation when offering. They do not prevent offering and replace no legal review. Shipping across national borders is not part of the system. | ⬜                        |
| FR-SOZ-10 | Deletion: a keeper can delete and export their social data completely (US-ACC-04). Completed swaps remain with the partner with the stored display name.                                                          | ⬜                        |
| FR-SOZ-11 | Out of scope: chat between friends, public profiles, leaderboards, selling for money, shipping handling, groups.                                                                                                  | ⬜ (deliberate, see E-07) |

## Open questions

1. Is `private`/`friends` per specimen enough, or are friend groups ("close friends") needed?
2. Should there later be a **comment/question function** on the offer (instead of external coordination)? Deliberately out of scope as long as there is no chat.
3. Selling for money deliberately excluded; confirm (E-07).
