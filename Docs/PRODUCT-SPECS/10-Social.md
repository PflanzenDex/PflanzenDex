# 10 – Epic SOZ: Social (Friends, Feed, Swapping)

Goal: collecting and caring become shared. The plant keeper sees what friends have newly collected and can swap plants and cuttings without their collection becoming public.

Replacement: replaces `../PLANT-SYSTEM-SPECS/11-Social.md`. Dropped: the "hub" as a separate exchange layer and the requirement that the vault stay the source of truth. In the app friends, sharing settings and swaps are **built-in functions** on shared data storage. That simplifies the handover considerably (one transaction instead of reconciling two vaults).

## Terms

| Term            | Meaning                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| Friend          | Another keeper with a **confirmed** friendship (mutual).                                                       |
| Sharing setting | Per specimen: `private` (default) or `friends`.                                                                |
| Offer           | Specimen or cutting that a keeper offers to friends for swapping or giving away.                               |
| Swap            | Process request → acceptance → handover. Giving away without a counterpart ("gifting") is a swap without return. |
| Provenance      | Note on the recipient's specimen: from whom, when.                                                             |

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

### US-SOZ-03 · Manage friends and end a friendship · ⬜ new

Acceptance criteria:

- "Friends": list with display name, start, number of shared caught species.
- Ending immediately withdraws collection, feed and offers from both sides. Own data and completed swaps (incl. provenance) remain.
- Open swap requests with the person are canceled (`canceled`). The other side is not actively notified.

### US-SOZ-04 · Decide what friends see · ⬜ new

Acceptance criteria:

- Per specimen: `Share = private | friends` (default private) and `Share_Photos = on | off`.
- Private means: not in the collection, not in the feed, not in friends' counts.
- At most the following are shared: species (Latin + German), specimen name, caught date, status (cutting yes/no), the latest photo (only with `Share_Photos`). **Never** shared: location, measurement notes, treatments, markers, prices, wishlist, financial data.
- A global switch "Everything private" suspends all sharing settings without deleting them.
- Withdrawing takes effect immediately for future retrievals. What has already been delivered cannot be retrieved (note in the dialog).
- Bulk action: "Share all specimens of this species".

### US-SOZ-05 · See which new plants friends have collected · ⬜ new

Acceptance criteria:

- Block "New among friends": events, newest first, per event: friend, species, date, photo if applicable, type.
- Types: **New species caught** (the species was not yet in the friend's Pokédex), **New specimen**, **New cutting**, **Potted**, **Swapped** (only if I am involved or both parties are my friends).
- Only specimens with `Share = friends` create events. The date is `Caught_At`, otherwise "unknown" (never guessed, P-08).
- Sharing an old specimen creates **no** event "new today", but carries its actual date.
- Events are summarized by species, friend and day ("N specimens").
- Default period 30 days. Filters: by friend, only "New species".

### US-SOZ-06 · "New among friends" since my last visit · ⬜ new

Acceptance criteria:

- "Seen" state per account on the server; on the first visit silent creation, no banner.
- Banner "Friends have N new plants: …" stays until "Okay".
- If the data is missing (no network), the block shows the last state with "As of DD.MM.YYYY" (FR-SOZ-03).

### US-SOZ-07 · View and compare a friend's collection · ⬜ new

Acceptance criteria:

- The shared collection appears as collector cards in the style of US-POK-01; "caught" means: the friend has a shared active specimen.
- Per card "you have it" or "you lack it" (from my ownership, US-POK-06). Filters "I lack", "We both have".
- No rank or leaderboard comparison (FR-POK-11). Facts are shown, no rating.
- Shared equipment appears as the friend's device list (US-EQU-12).

### US-SOZ-08 · Offer a plant or cutting for swapping · ⬜ new

Acceptance criteria:

- From the specimen card, "Offer for swapping" creates an offer: `Species`, specimen, `Type` (`cutting | plant | offshoot`), `Mode` (`swap | give away`), optional `Wish` and `Note`.
- Visible only to friends. A specimen has at most one open offer.
- Offering requires `Share = friends`; otherwise the dialog offers to set the sharing setting.
- **Health details:** automatically "treatment open" or "last treated: reason, date" from the treatments, without agent and notes. A specimen with an open pest treatment is offered only after explicit confirmation.
- Phase hint "currently dormancy phase", if applicable.
- Notice on species protection (e.g. CITES-listed cacti/orchids) when offering (FR-SOZ-09).
- Withdrawing at any time (`withdrawn`); open requests are canceled.

### US-SOZ-09 · See offers from friends and request them · ⬜ new

Acceptance criteria:

- "Swap exchange": open offers of all friends with species, type, mode, health details, photo (if shared), chip "you lack it".
- Filters: light zone of the species (fits my distribution, US-LIC-02), "you lack it", type.
- "Request" creates a swap. For `swap` I can attach one of my own specimens with `Share = friends` as a counter-offer or leave the return open (free text).
- Only one open request from me per offer; own offers cannot be requested.
- If the species is on my **wishlist**, a hint appears; the list itself is not transmitted (FR-WUN-07).

### US-SOZ-10 · Answer a swap request · ⬜ new

Acceptance criteria:

- Actions: **Accept**, **Decline** (optionally with a reason), **Propose something else** (change the counter-offer).
- Accepting sets the offer to `reserved`; further requests for the same offer are declined automatically ("already given").
- If an acceptance is withdrawn before the handover, the offer goes back to `open`; the other side is notified.
- States exactly `requested → accepted → handed over`, terminal `declined`, `canceled`, `withdrawn`. Transitions only in this direction (DM-SOZ-03).

### US-SOZ-11 · Confirm the handover, update collection and Pokédex · ⬜ new

Acceptance criteria:

- The handover counts only when **both** sides have confirmed "handed over".
- **Giver:** the specimen is archived (US-BES-07) with `Archived_Reason: "Swapped with <display name>"` or `"Gifted to <display name>"`. It is thus missing from distribution, phases, Pokédex ownership.
- **Recipient:** a new specimen is created under the rules of US-BES-02/03 (naming rule, marker), `Caught_At` = handover date (local), `Provenance` set, `Share = private`. For `cutting`/`offshoot`: `Status = Cutting` and cutting light (US-BES-04); for `plant` the species' zone applies.
- The recipient catches the species in the Pokédex automatically; "Newly caught" applies (US-POK-12).
- Measurements, treatments and location of the giver are **not** passed on; the recipient starts with an empty history.
- Both see the swap in the history (US-SOZ-13) and as an event "Swapped" in the feed.
- **Atomic:** archiving and creating run in one transaction. If one fails (e.g. name conflict), the swap stays at `accepted` and reports the reason; there is never a half state (FR-SOZ-05).

### US-SOZ-12 · Be notified about news · ⬜ new

Acceptance criteria:

- Triggers: new friendship request, request for my offer, acceptance/decline of my request, the other side confirmed the handover.
- New feed events trigger **no** individual message, only the banner (US-SOZ-06).
- Delivery by the rules of epic MON (US-MON-01, -08): only when action is needed, once per occasion and day. Without push, "Today" shows open points.

### US-SOZ-13 · Swap history · ⬜ new

Acceptance criteria:

- "Swap history": completed and canceled processes with date, friend, given/received, status.
- The history remains after ending the friendship; the friend appears with the stored display name.
- A received specimen shows "from <display name>" (provenance).

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

| ID        | Requirement                                                                                                                                                                                                              | Status                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| FR-SOZ-01 | **Private by default:** without a sharing setting no specimen, photo or location leaves the account (P-05).                                                                                                              | ⬜                       |
| FR-SOZ-02 | All social data lives in the shared data storage of the app; there is no separate "hub" any more. Access only via account and friendship (NFR-09).                                                                       | ⬜                       |
| FR-SOZ-03 | If a data source fails (no network), social blocks show the last state with a note.                                                                                                                                      | ⬜                       |
| FR-SOZ-04 | Swap states, sharing filters and feed derivation are pure logic with tests (P-01).                                                                                                                                       | ⬜                       |
| FR-SOZ-05 | The handover is atomic: archiving at the giver and creating at the recipient in one transaction.                                                                                                                         | ⬜                       |
| FR-SOZ-06 | Changes run only through validating operations (P-03).                                                                                                                                                                   | ⬜                       |
| FR-SOZ-07 | No invented data: date and catch status come from shared specimens; "unknown" instead of guessing (P-08).                                                                                                                | ⬜                       |
| FR-SOZ-08 | Display names are freely chosen and no proof of identity. Friendship and swap require the mutual confirmation of the person; no open user search.                                                                       | ⬜                       |
| FR-SOZ-09 | **Plant law and health:** notices on species protection and pest infestation when offering. They do not prevent offering and replace no legal review. Shipping across national borders is not part of the system.       | ⬜                       |
| FR-SOZ-10 | Deletion: a keeper can delete and export their social data completely (US-ACC-04). Completed swaps remain with the partner with the stored display name.                                                                | ⬜                       |
| FR-SOZ-11 | Out of scope: chat between friends, public profiles, leaderboards, selling for money, shipping handling, groups.                                                                                                         | ⬜ (deliberate, see E-07) |

## Open questions

1. Is `private`/`friends` per specimen enough, or are friend groups ("close friends") needed?
2. Should there later be a **comment/question function** on the offer (instead of external coordination)? Deliberately out of scope as long as there is no chat.
3. Selling for money deliberately excluded; confirm (E-07).
