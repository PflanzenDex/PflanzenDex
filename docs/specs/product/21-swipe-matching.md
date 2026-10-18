# 21 – Epic TAU: Swipe Matching for Swapping

Goal: swapping cuttings and plants becomes as light as Discover (ENT). The keeper swipes through the **open offers of friends that match their own wishlist** and answers Yes, No or Later. Only "Yes" creates a swap request. If a friend wants something of the keeper in return, the card says so, without ranking and without a score.

Prototype reference: none, idea of the PO from 2026-10-17. Builds on SOZ (friends US-SOZ-01/02, offers US-SOZ-08, exchange US-SOZ-09, answering US-SOZ-10, handover US-SOZ-11), WUN (wish DM-WUN-01, privacy FR-WUN-07), ENT (card and deck style, US-ENT-01), QS (accessibility NFR-13, US-QS-14), ACH (calm mode US-ACH-08) and DEV (feature switch `social`, US-DEV-06).

Delimitation from ENT: Discover suggests **species from the shared catalog** to fill the wishlist. TAU shows **concrete offers of friends** that already match a wish. The two never mix: a card in TAU is an offer of a friend, not a catalog species.

Delimitation from SOZ-09: the swap exchange (US-SOZ-09) stays the complete list with filters. TAU is a second, faster view on the same data and the same request operation; it adds no new way to reach strangers or to see more of a friend than the exchange shows.

Delimitation from the non-goals in `16`: no leaderboards, no ranking of friends or offers, no chat, no selling for money, no strangers (FR-SOZ-11).

## Problem

1. **The list is work:** the swap exchange (US-SOZ-09) shows every open offer of all friends. With a few friends and many offers the keeper scrolls past most of them to find the one that matches a wish.
2. **A wish is matched by eye:** the hint "on your wishlist" exists, but nothing collects the matching offers in one place.
3. **A "no" is not allowed to cost anything:** declining an offer in the exchange simply leaves it in the list again and again.
4. **Mutual interest is invisible:** a swap works best when both sides want something, but neither side can see this before one of them asks.

## Terms

| Term             | Meaning                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Match card       | Open offer of a friend (US-SOZ-08) whose species is on the keeper's own wishlist with status `Wishlist`, shown as a card. Not to be confused with a Discover suggestion (epic ENT). |
| Match deck       | The sequence of match cards the keeper has not decided on yet. Limited by the offers that exist, no endless feed.                                                                   |
| Yes / No / Later | Request the offer (US-SOZ-09) / not interested / decide later.                                                                                                                      |
| Fit reason       | The verifiable fact why a card appears: the wish and the species it names (US-TAU-04).                                                                                              |
| Fits both ways   | The giver also wants something the keeper offers: the keeper has an open offer whose species the giver marked as wanted for friends (US-TAU-05) or has an open request on.          |
| Later list       | The keeper's own list of cards answered with "Later" or "No", reachable at any time (US-TAU-06).                                                                                    |

## User stories

### US-TAU-01 · See matching offers of friends as cards · 🟨 new

As a **plant keeper** I want to see the open offers of my friends that match my wishlist one by one as a card, so that I find a swap without scrolling through the whole exchange.

Acceptance criteria:

- Given a friend has an open offer (US-SOZ-08) and its species is on my wishlist with status `Wishlist` (compared by the folded Latin name, as in the hint of US-SOZ-09), when I open the match deck, then the offer appears as a card.
- Given an offer matches no wish of mine, then it does not appear in the deck (it stays in the swap exchange).
- The card shows: species (German and Latin name), the giver's display name, type (`cutting | plant | offshoot`), mode (`swap | give away`), wish and note of the offer, photo (if shared), health details and dormancy hint as in US-SOZ-09, and the fit reasons (US-TAU-04). No percentage, no "match" score, no stars.
- Given the offer is mine, or the giver is not a confirmed friend (any more), or the offer is no longer open, then it never appears (P-05).
- Order: oldest open offer first, then giver name, then species. The order is fixed for the same data (FR-TAU-05) and contains no ranking.
- Given I am on a 360 px viewport, then one card fills the width and the three actions are reachable with one thumb (NFR-13, US-QS-14).

### US-TAU-02 · Answer with Yes, No or Later · 🟨 new

As a **plant keeper** I want to answer a card with buttons or a swipe, so that deciding is quick and works without a gesture.

Acceptance criteria:

- Actions: **No** · **Later** · **Yes**, always as buttons with a text label, additionally by swipe gesture on the phone (left = No, right = Yes, up or down = Later). Status is never conveyed by color or icon alone (NFR-13).
- Given I use a keyboard or a screen reader, then every action is reachable and announced with species and giver ("Yes: request Echeveria elegans from Anna"); the result of an action is announced as text (FR-TAU-08).
- Given `prefers-reduced-motion: reduce`, then the card leaves without motion and the next card appears at once (US-QS-14).
- Given I answered, when I press "Undo" (shown for the next card), then my last answer is taken back, as long as it was No or Later; a Yes is a request and is withdrawn in "Requests" (US-SOZ-10), not here.
- Given a swipe is shorter than the threshold or ends in a scroll, then no answer is recorded (starting value of the threshold: 40 percent of the card width, assumption).
- After the last card: "Done for now. N requested, M for later." with the next step (open "Requests" or the Later list, P-09).

### US-TAU-03 · A request arises only from Yes · 🟨 new

As a **plant keeper** I want a swap request to be created only when I say Yes, so that nobody is bothered by a swipe that I did not mean.

Acceptance criteria:

- Given I answer **Yes**, then exactly one swap request arises with the operation of US-SOZ-09 (same checks, states and limits, DM-SOZ-03); for the mode `swap` the request has an open return (free text empty), which I can complete in "Requests".
- Given I already have an open request on this offer, then Yes creates no second one (US-SOZ-09: one open request per offer) and the card says "Already requested".
- Given the offer was withdrawn, reserved or handed over in the meantime, then Yes creates nothing, the card says why ("Offer is no longer available") and the card moves to the Later list as unavailable (P-10).
- Given I answer **No** or **Later**, then no request, no notification and no change reaches the giver (FR-TAU-02).
- Writing happens only through the validating operations (P-03). The request is the record of the Yes; no second copy of it is stored (NFR-04).
- The giver is notified about the request as for any request (US-SOZ-12), with nothing that tells them the request came from a swipe.

### US-TAU-04 · Understand why a card appears · 🟨 new

As a **plant keeper** I want to see why an offer is shown to me, so that I trust the deck.

Acceptance criteria:

- Every card names its reason from my own data: "On your wishlist: <species>" (the wish by name, US-WUN-01). More than this is not claimed.
- Given the wish has a note or reasoning, then the reasoning is shown as written by me, never rewritten.
- Given the species of the offer is unknown to the catalog ("Art unbekannt", P-08), then the card shows the name as the giver entered it, labels it as unchecked and offers no further reason.
- No comparison with species averages, no similarity guess by genus or family: the match is the species of the wish and nothing else (P-08).
- Reasons arise from the domain logic, never from a model (P-01).

### US-TAU-05 · See that it fits both ways · ⬜ new

As a **plant keeper** I want to see when the giver also wants something I offer, so that I can propose a fair swap.

Acceptance criteria:

- Given the giver has an open request on one of my open offers, or has marked a wish as "visible to friends as wanted" (DM-TAU-02) whose species is one of my open offers, when the card of the giver's offer appears, then it shows the chip "Fits both ways" and the sentence "<Giver> wants <species> from you" naming my offer.
- Given the giver has neither, then no chip appears and nothing is said about the giver's wishes: a wish that is not marked stays private (FR-WUN-07, P-05).
- The chip is a fact, not a rating: cards that fit both ways are **not** moved to the front (FR-TAU-06). The deck order stays that of US-TAU-01.
- Given the card fits both ways and I answer Yes, then the request proposes my matching offer as the counter-offer (US-SOZ-09) and I can change it before sending (one extra confirmation step, not a second swipe).
- The mutual matching is optional for the giver: marking a wish as visible is a deliberate action per wish, off by default (assumption, decided by the PO), and can be taken back at any time; the chip then disappears at the next view.

### US-TAU-06 · Find Later and No again · 🟨 new

As a **plant keeper** I want to find the cards I answered with Later or No, so that nothing disappears silently.

Acceptance criteria:

- Given I answered **Later**, then the offer stays in the Later list with the answer date (local date, NFR-08) and shows again in the deck on the next day (starting value: 1 day, assumption), until I answer it with Yes or No.
- Given I answered **No**, then the offer does not show in the deck again, but stays findable in the list "Declined" with the answer date and a button "Reconsider" that puts it back into the deck (P-10).
- Given an offer ends (withdrawn, handed over to someone else, friendship ended), then its entry stays in the list marked "not available" with the reason, and is removed only by me ("Remove from list"), never silently (P-10).
- Given the keeper's wish is no longer on the wishlist (bought or discarded), then the entry shows "Wish is done" and the offer leaves the deck (US-WUN-03).
- The lists are private: the giver sees neither No nor Later (FR-TAU-02).
- Every list and every empty list says what to do next (P-09).

### US-TAU-07 · Respect the social switch, calm mode and empty states · 🟨 new

As a **plant keeper** I want the match deck to follow my settings and to tell me what to do when it is empty, so that it never nags or dead-ends.

Acceptance criteria:

- Given the feature switch `social` is off (globally or for my account, US-DEV-06), then the match deck, its entry point and its API are absent like the rest of the social functions; the data of earlier answers is kept and shown again when the switch is on.
- Given calm mode is on (US-ACH-08), then the deck shows no celebration, no animation beyond the card change, no counters like "N requested" and no push; the chip "Fits both ways" stays, because it is information and not a reward.
- The deck is a mode of the destination "Freunde" next to the swap exchange (US-QS-14: at most five main destinations; no new one).
- Given there is no card, then the empty state names the reason and the next step (P-09): no friends yet ("Invite a friend", US-SOZ-01); wishlist empty ("Add a wish", US-WUN-01 or "Discover", ENT); no friend offers anything ("Open the swap exchange"); everything decided ("Open the Later list").
- Given I am offline, then the deck shows the last loaded state with "As of DD.MM.YYYY" and answers are not possible until the connection is back (FR-SOZ-03).
- No notification is sent for new match cards (FR-TAU-09).

## Data model

### DM-TAU-01 Swipe answer (private, per account)

`Account`, `Offer` (reference into DM-SOZ-02), `Answer` (`no | later`), `Answered_At` (local date, NFR-08), `Reconsider_At?`. Tenant table of the keeper (P-04). A Yes is not stored here: it is the swap request (DM-SOZ-03). Whether a card is open, requested, for later or declined is **derived** on every read from the offer, the request and this answer (NFR-04).

### DM-TAU-02 Wanted for friends (extension of DM-WUN-01)

`Visible_To_Friends` (yes / no, default **no**) per wish with `Type: Plant`. Only the species name of a wish with this flag is readable by friends, through a database function and only for the question "does this friend want one of the species I offer", never the list (FR-WUN-07). Never shown in the feed.

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                                 | Status          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| FR-TAU-01 | Matching, order and reasons are pure domain logic without I/O with tests (P-02, P-06). Deck, list and AI client use the same logic.                                                                                                                         | 🟨              |
| FR-TAU-02 | **Private by default:** only confirmed friends, only offers they have shared (`Share = friends`), never strangers. The answers No and Later and the wishlist are invisible to friends (P-05, FR-WUN-07). Tenant isolation is tested (P-04, NFR-09).         | 🟨              |
| FR-TAU-03 | A swap request arises only from an explicit Yes through the operation of US-SOZ-09; no operation creates a request from a swipe without it, and a gesture alone never sends anything irreversible without the visible undo or confirmation of US-TAU-02/05. | ⬜              |
| FR-TAU-04 | No invented values: the fit is the species of a wish and nothing else; unknown stays "unknown" (P-08).                                                                                                                                                      | 🟨              |
| FR-TAU-05 | Same data, same date and same viewer yield the same deck in the same order.                                                                                                                                                                                 | ✅              |
| FR-TAU-06 | No ranking, no score, no percentage, no sorting of friends or offers by popularity or match strength; "Fits both ways" is a chip, not an order (FR-SOZ-11, P-08).                                                                                           | ⬜              |
| FR-TAU-07 | Every view says what to do next, including every empty state (P-09). Nothing disappears silently: Later, No and ended offers stay findable until the keeper removes them (P-10).                                                                            | 🟨              |
| FR-TAU-08 | Accessibility (NFR-13): all actions as buttons with text, operable by keyboard, announced by screen reader, 360 px layout, targets large enough, reduced motion respected; the swipe is only an extra.                                                      | ⬜              |
| FR-TAU-09 | Out of scope: endless feed, notifications about new match cards, matching against strangers or the public, rankings, chat, selling for money, matching by genus or family, suggestions of species the giver does not offer (that is ENT).                   | ⬜ (deliberate) |
| FR-TAU-10 | Hidden with the feature switch `social` (US-DEV-06) and under calm mode as described in US-TAU-07; dates are local dates (NFR-08).                                                                                                                          | 🟨              |

## Assumptions, decided by the PO (revisable)

- Fit is exact species only (folded Latin name, as in US-SOZ-09); no genus or family fallback, so that every reason is checkable (P-08).
- "Later" returns after 1 day, the swipe threshold is 40 percent of the card width (starting values, not measured).
- "Fits both ways" counts a friend's open request on my offer, or a wish the friend deliberately marked as visible; unmarked wishes are never read (P-05). The default is off.
- Yes on a card that fits both ways proposes my matching offer as the counter-offer, with one confirmation step.
- Release R5 (after the exchange and Discover are in use) and priority P3 (rule of thumb in `CLAUDE.md`); the owner may overrule.
- The deck lives in the destination "Freunde" next to the exchange; it is no new main destination.

## Open questions

1. **Wish visibility:** is a per-wish flag the right grain, or should one setting "friends may see which species I look for" per account be enough?
2. **Later interval:** 1 day is a starting value; adjust after real use?
3. **Group of offers:** should the deck also show offers without any matching wish, in a separate mode "Everything"? Today this is the swap exchange (US-SOZ-09).

## Risks

| Risk                                                            | Countermeasure                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Few friends and few offers: the deck is empty most of the time. | Honest empty state with next steps (US-TAU-07); the exchange stays the full list.                                   |
| A swipe sends a request by accident.                            | Buttons first, swipe threshold, undo for No and Later, withdraw in "Requests", confirmation when fits both ways.    |
| Mutual matching leaks a friend's wishlist.                      | Opt-in per wish, default off, only the yes/no question per own offer, contract test for the output (QG-D2).         |
| Swiping turns swapping into a game that pressures friends.      | No ranking, no counters in calm mode, no notification, the giver sees only a normal request (FR-TAU-02, FR-TAU-06). |
