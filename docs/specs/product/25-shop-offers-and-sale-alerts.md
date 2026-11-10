# 25 – Epic DEAL: Shop Offers and Sale Alerts

Goal: a keeper hears about plants on sale without searching for them. The keeper subscribes to shops and chooses per shop whether they want only the plants on their wishlist or all plant offers. Offers come first from community reports (no scraping), later from shops whose terms allow reading. A push arrives for a wishlist match, and every current offer is in one list.

Prototype reference: none. Owner interview 2026-11-05, issues #1356 to #1360 (the aggregator spike #1357 is registered as enabler TE-20 in `16-releases-and-decisions.md`). Builds on WUN (wishes and match scope, DM-WUN-01, US-WUN-01), BES (catalog for plant names, proposals and review US-BES-10), ENT (no Discover card for offers), MON (web push, decided channel E-10, ADR 0015), SOZ (friends for the visibility of reporter names, US-SOZ-01 and US-SOZ-04), EQU (no invented product data FR-EQU-09, no recommendations FR-EQU-06) and the switches of P-12 (US-ONB-09) and the operator's feature switches (US-DEV-06). Automatic reading depends on the open decision E-28.

Delimitation from SOZ: a shop offer is not an offer of a friend. It never appears in the swap exchange (US-SOZ-09) or in the match deck (epic TAU). The two share no list.

Delimitation from EQU: offers are information about a plant on sale. They are not recommendations, carry no ranking and no affiliate parameter (FR-DEAL-01, FR-DEAL-07).

Delimitation from VAR: the shop prices of a cultivar (US-VAR-06) are dated research examples. Shop offers here are one listing each, from a report or from a shop's own page, with validity. Neither fills the other.

## Problem

1. **Sales are found by chance.** A plant on sale at a discounter is seen once, in passing, and missed when it matters.
2. **Wishes do not reach the keeper.** The wishlist knows what is wanted, but nothing tells the keeper when a wished plant appears in a shop.
3. **Offers expire unseen.** A flyer is valid for a week; the keeper learns of it after it ended.
4. **Offers are not comparable by place.** Regional garden centres and nationwide chains appear in different places, if at all.

## Terms

| Term             | Meaning                                                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shop             | A place that sells plants: a chain or a local garden centre. Listed by the operator; proposals go through the review (US-DEAL-02).                                                         |
| Subscription     | The keeper's choice per shop: `wishlist only` ("nur Wunschliste") or `all plant offers` ("alle Pflanzenangebote") (US-DEAL-01).                                                            |
| Shop offer       | One plant on sale at one shop: plant, price, validity, source and link. Its source is a community report or a reading of the shop's page (US-DEAL-03, US-DEAL-06). Not a swap offer (SOZ). |
| Community report | A keeper's report of a plant offer seen in a store, with the store, the plant, the price, the validity and an optional photo (US-DEAL-03).                                                 |
| Reading          | Automatic extraction of plant offers from a shop's public weekly offer page or flyer, allowed by the shop's terms (US-DEAL-06).                                                            |
| Match scope      | Per wish: `exact` (this species or cultivar only) or `genus` (every plant of the genus). Unnamed mixes can be included in both (US-DEAL-04).                                               |
| Unnamed mix      | An offer whose plant is no species of the catalog, for example "Zimmerpflanzen-Mix". Marked by the report or by the reading.                                                               |
| Quiet hours      | A window in the keeper's time zone without pushes, default 21:00 to 08:00 (starting value). A match inside it arrives at its end (US-DEAL-05).                                             |
| Marked gone      | A keeper's "nicht mehr da" on a report. It ends the report for everyone (assumption, US-DEAL-03).                                                                                          |

## User stories

### US-DEAL-01 · Subscribe to shops and choose what I hear about · ⬜ new

Issue #1358. As a **plant keeper** I want to subscribe to shops and choose per shop whether I want only matches for my wishlist or all plant offers, so that I hear about plants on sale without noise.

Acceptance criteria:

- Given I subscribe to a shop with "nur Wunschliste", then I see and get only the offers of that shop that match a wish (US-DEAL-04).
- Given I subscribe to a shop with "alle Pflanzenangebote", then I see all plant offers of that shop, matching or not.
- Given I have no postal code, then regional offers are not shown, and the view says why ("Regionale Angebote brauchen eine Postleitzahl"), P-09. Nationwide offers are still shown.
- Given I enter a postal code, then it is private: nobody else sees it, it is used only to match regional offers, and I can remove it at any time (P-05).
- Given I end a subscription, then no further push comes for that shop. Offers already in the list stay until they expire, and I see that they are no longer followed (P-10).
- Given the list of my subscriptions, then only I can see it (P-05).

### US-DEAL-02 · Keep the shop list and approve proposed shops · ⬜ new

Issue #1358. As a **plant keeper** I want to propose a shop that is missing, also a local garden centre, so that everybody can subscribe to it once a reviewer approves it.

Acceptance criteria:

- Given the shop list, then it is kept by the operator (for example Lidl, Aldi Nord, Aldi Süd, Netto, Globus, Dehner, toom, Hornbach, Sunflower). Shops are data, not code.
- Given a keeper proposes a shop, then the proposal goes to the review queue (US-BES-10) and is visible only to its proposer until approved.
- Given a reviewer approves the proposal, then every keeper can subscribe to the shop.
- Given a reviewer rejects the proposal, then the proposer sees the reason and the shop does not appear in the list (P-10).
- Given a local shop, then it is stored with its name and its town. No street address is needed for the subscription.
- Given a shop is listed, then its automatic reading (US-DEAL-06) is off until the operator enables it for that shop.

### US-DEAL-03 · Report a plant offer I saw in a store · ⬜ new

Issue #1359. As a **plant keeper** I want to report a plant offer I saw in a store, so that other subscribers of that shop hear about it. This is the first source of offers and needs no scraping.

Acceptance criteria:

- Given I am signed in and see a plant on sale, when I report it with the store (for example "Lidl Mannheim-Neckarau"), the plant (a catalog species or cultivar, or free text), the price, the date until which it is valid (optional) and an optional photo, then it is listed for the subscribers of that shop.
- Given a subscriber of that shop opens the offers, then they see the report without my name, unless I am their friend (US-SOZ-01); then they see my name.
- Given I made 10 reports on the same local day (starting value, assumption), when I make an eleventh, then it is refused with a clear message and a stable error code (FR-QG-11), and nothing is saved.
- Given a report has a validity end date, then it leaves the list on that date. Without one, it leaves the list 3 days after it was reported (starting value, assumption). Where it was linked, the entry says "abgelaufen" (P-10).
- Given a report, when another keeper marks it "nicht mehr da", then it ends for everyone at once (assumption: one mark is enough; the number of marks is shown).
- Given the operator removes a report, then the reporter sees that it was removed by the operator and the reason. The operator can block a reporter; a blocked reporter cannot report (P-10).
- Given a report with a photo, then the photo rules of the product apply: location data is removed on the server (R-05).
- Given a report, then it is labelled "Community-Meldung". There are no points, badges or ranking for reporters (FR-DEAL-09).

### US-DEAL-04 · Choose which wishes match offers · ⬜ new

Issue #1360. Release R2 (owner decision 2026-11-05); its matching also feeds the R3 push of US-DEAL-05. As a **plant keeper** I want to choose per wish how widely it matches offers, so that a match is exactly what I meant.

Acceptance criteria:

- Given a wish, when I set its match scope to `exact` (this species or cultivar only), then only offers of that species or cultivar match. This is the default (assumption).
- Given a wish with scope `exact`, when an offer says just "Monstera", then it does not match.
- Given a wish with scope `genus` for Monstera, when an offer names a plant of the genus (for example "Monstera deliciosa" or "Monstera"), then it matches. The genus comes from the catalog; an offer whose genus is unknown does not match (P-08).
- Given a wish with "unnamed mixes" included, when an offer is an unnamed mix (for example "Zimmerpflanzen-Mix"), then it matches that wish too. Without that flag, mixes never match.
- Given a match, then the offer shows why it matched: "Passt zu deinem Wunsch: <wish>" (P-09). No score and no percentage.
- Given I change a match scope, then it applies to offers that arrive afterwards. Offers already in the list stay (P-10).

### US-DEAL-05 · Get a push for a match and see all offers in a list · ⬜ new

Issue #1360. Release split (owner decision 2026-11-05): the in-app offer list is R2, the push criteria are R3 (they need web push, MON-01, ADR 0015). As a **plant keeper** I want a push right away when an offer matches my wishlist, and an in-app list of all current offers, so that I do not miss a deal.

Acceptance criteria, release R2 (in-app list):

- Given the list "Angebote" in the app, then it shows the current offers of my subscribed shops, filterable by shop, each with shop, price, validity or "Gültigkeit unbekannt", source label and link (FR-DEAL-04).
- Given the list is sorted, then it is sorted by shop name and then by validity date. It has no ranking by price or by match strength (FR-DEAL-01).
- Given an offer expires, then it moves to "Abgelaufen" with its date and is not deleted (P-10).
- Given the list is empty, then it says why (no subscription, or no offer yet) and the next step ("Shop abonnieren", P-09).

Acceptance criteria, release R3 (push, needs MON-01 web push):

- Given a wish with the scope "every Monstera" and a Monstera offer arrives for a shop I subscribe to, then I get one push. The offer is in the R2 list.
- Given quiet hours of 21:00 to 08:00 (starting value, the keeper's own setting), when a match arrives at 23:00, then the push comes at 08:00 in my time zone.
- Given a wish with scope `exact` and an offer that says just "Monstera", then no push is sent.
- Given a match, then one push is sent per offer and keeper. There is no daily cap on pushes (owner decision).
- Given I have not allowed web push, then no push is sent. The R2 list still works (E-10).
- No e-mail and no weekly digest are sent (owner decision).

### US-DEAL-06 · Read plant offers automatically from shops whose terms allow it · ⬜ new

Issue #1356 (labelled enabler in the issue; it has behaviour and acceptance criteria, so it carries a story ID here). As a **plant keeper** I want offers from shops that allow it to arrive without a report, so that subscribers get offers without anyone reporting them.

Acceptance criteria:

- Given a shop without a recorded terms check (date, result and reference), then it cannot be enabled for reading.
- Given the terms check is recorded, then the operator enables reading per shop with its own switch. One blocked shop does not stop the others.
- Given an enabled shop, then once a week per shop a shared job reads its public offer page or flyer and extracts plant, price, validity from and to, and link. Each extracted offer is validated before it is stored (P-01: the AI extracts, the code validates and decides).
- Given an extracted offer without a validity date, then its validity shows "unbekannt" (P-08).
- Given an extracted offer that fails validation (no price, no link, no plant), then it is not stored, and the failure is counted for the operator (P-10).
- Given extracted offers, then they feed the matching of US-DEAL-04 and US-DEAL-05 and appear with their source link and validity, labelled as read from the shop's page.
- Given the monthly budget of the job is used up, then no job runs, and the operator area says why (P-10). The budget amount is set by the operator before the story starts; it is not invented here.
- Given the operator switches reading off for a shop, then no further offers come from that shop, and the existing ones expire as normal.

Blocked: the reading job uses AI run by the operator, and E-04 says there is no AI data processing at the operator. This needs the owner's decision first (open decision E-28 in `16-releases-and-decisions.md`).

## Data model

### DM-DEAL-01 Shop (shared, operator list)

`Name`, `Kind` (`chain | local`), `Town?` (for local shops), `Terms_Check?` (date, result, reference to the recorded check), `Reading` (`off | on`, set by the operator per shop), `Status` (`proposed | approved`).

### DM-DEAL-02 Subscription (per keeper, private)

`Account`, `Shop`, `Mode` (`wishlist only | all plant offers`), `Postal_Code?` (private, used for regional offers only), `Created_At` (local date).

### DM-DEAL-03 Shop offer (shared, from report or reading)

`Shop`, `Plant` (reference into the catalog, or free text marked as unnamed mix), `Price_EUR` (as stated by the shop, incl. VAT), `Valid_From?`, `Valid_Until?` (local dates, `unknown` if not stated), `Source` (`report | reading`), `Link`, `Photo?`, `Reporter?` (account; never shown, except to friends of the reporter), `Status` (`open | expired | marked gone | removed`), `Marked_Gone_At?`, `Created_At`.

### DM-DEAL-04 Match scope (extension of DM-WUN-01)

`Scope` (`exact | genus`, default `exact`), `Include_Mixes` (yes or no, default no). Only wishes of type `Plant` carry it.

### DM-DEAL-05 Notification settings (per keeper, private)

`Quiet_From` (default 21:00, local time), `Quiet_To` (default 08:00, local time), `Push_Allowed` (yes or no, as consent for the channel of E-10). Starting values, assumption.

### DM-DEAL-06 Reporting block (per account, set by the operator)

`Account`, `Blocked_At` (local date), `Reason` (text, shown to the blocked keeper). Limits of the report count are not stored: they are derived live from the keeper's reports of the local day (NFR-04).

## Requirements

| ID         | Requirement                                                                                                                                                                                                                                               | Status          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| FR-DEAL-01 | Offers are information, not recommendations: no ranking by price, shop, commission or match strength, no score. The list sorts by shop name and validity date (FR-EQU-06, P-08).                                                                          | ⬜              |
| FR-DEAL-02 | Terms first: no shop is read automatically without a recorded terms check and an operator switch per shop (US-DEAL-06, E-28).                                                                                                                             | ⬜              |
| FR-DEAL-03 | Subscriptions, postal codes, notification settings and wishes are private (P-04, P-05). A reporter's name is shown only to friends. No tracking of individuals and no analytics per click (NFR-11).                                                       | ⬜              |
| FR-DEAL-04 | Every shop offer shows shop, source (report or reading), link and validity, or "Gültigkeit unbekannt" (P-08, P-09).                                                                                                                                       | ⬜              |
| FR-DEAL-05 | Nothing disappears silently: expired, marked gone, removed and blocked offers stay visible with the reason (P-10). A removed offer tells its reporter why.                                                                                                | ⬜              |
| FR-DEAL-06 | All limits (10 reports per day, 3 days without a validity date, quiet hours 21:00 to 08:00, weekly reading per shop) are starting values in one table and marked as assumptions. The reading budget is set by the operator (P-08).                        | ⬜              |
| FR-DEAL-07 | No affiliate parameter, no commission and no partner link in shop offers. Any later partner decision follows E-07 and FR-EQU-03 to FR-EQU-05.                                                                                                             | ⬜              |
| FR-DEAL-08 | Accessibility (NFR-13, US-QS-14): list, filters and actions are text buttons, 360 px width, status by text and not only by colour, reduced motion respected.                                                                                              | ⬜              |
| FR-DEAL-09 | Out of scope: e-mail, weekly digest, selling or purchase through the app, chat between keepers, points, badges or rankings for reporters or shops, reading of shops whose terms do not allow it, a daily push cap.                                        | ⬜ (deliberate) |
| FR-DEAL-10 | The epic is switchable with the keeper switch (US-ONB-09, P-12): subscriptions, offers, pushes and reports leave navigation and reminders when switched off; the data stays. The operator's reporting block and reading switches are not keeper settings. | ⬜              |

## Dependencies and build order

Release split (owner decision 2026-11-05): R2 for US-DEAL-01 to US-DEAL-04 and US-DEAL-06, and for the in-app offer list of US-DEAL-05; R3 for the push criteria of US-DEAL-05. Priority P2 for R2 and R3 by the rule of thumb in `CLAUDE.md`; the owner may overrule per ticket.

The push criteria of US-DEAL-05 wait for R3, because web push (US-MON-01, ADR 0015) is placed in R3 in `09-reminders-and-sensors.md`. The list and the matching do not wait. US-DEAL-06 stays blocked by E-28 (open, unchanged).

| Order | Story      | Release              | Depends on                         | Why here                                                      |
| ----- | ---------- | -------------------- | ---------------------------------- | ------------------------------------------------------------- |
| 1     | US-DEAL-02 | R2                   | US-BES-10                          | The shop list is the base for subscriptions and reports       |
| 2     | US-DEAL-03 | R2                   | US-DEAL-02, US-BES-01, US-SOZ-01   | Community reports are the first source and need no scraping   |
| 3     | US-DEAL-01 | R2                   | US-DEAL-02                         | Subscriptions decide which reports reach a keeper             |
| 4     | US-DEAL-04 | R2                   | US-WUN-01, DM-WUN-01, DM-BES-01    | Match scopes need wishes and the genus of the catalog         |
| 5     | US-DEAL-05 | R2 (list), R3 (push) | US-DEAL-04; US-MON-01 for the push | The list follows the match rules; the push waits for web push |
| 6     | US-DEAL-06 | R2 (blocked by E-28) | US-DEAL-02, E-28, spike TE-20      | Automatic reading waits for the terms decision and the spike  |

## Assumptions (to be confirmed by the owner)

- **Starting values, marked:** 10 reports per local day; 3 days for a report without a validity date; quiet hours 21:00 to 08:00; weekly reading per shop; 1 mark "nicht mehr da" ends a report.
- **Default match scope** is `exact`; unnamed mixes are an extra flag, so that both readings of the owner's list ("also unnamed mixes") are possible.
- **Unnamed mixes** are recognised by the report or by the reading (the plant is not a catalog species). No other classification is invented.
- **Shop data** is town and name only for local shops.
- **Operator switches** for reading and reporting blocks are not keeper settings.
- **Core or switchable (P-12):** the whole epic is switchable. It is not part of the core purpose (collection, care, Pokédex).
- **Placement in the app:** the list "Angebote" and the subscriptions live in the destination "Entdecken" next to Discover, not in a new main destination (US-QS-14). Assumption, to be confirmed.

## Open questions

1. **Automatic reading and E-04:** the operator pays for AI extraction, which E-04 excludes. Options: the owner accepts an operator-run extraction job (E-28 changes), extraction runs without AI (a fixed rule per shop), or US-DEAL-06 is dropped for now.
2. **Aggregators:** does an offer aggregator (marktguru, kaufDA) deliver plant offers under terms that allow this use? Answer comes with spike TE-20 (issue #1357). The result decides whether US-DEAL-06 or an aggregator feeds the list.
3. **Regional offers:** how is a regional offer matched to a postal code when a shop only says "in your region" (open, no rule invented here)?
4. **Shop subscriptions and push on other devices:** web push is per device (ADR 0015). Is one device enough for a first version?

## Risks

| Risk                                                     | Countermeasure                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Offers become a sales channel or a ranking of prices.    | Information only, sorted by shop and date, no commission, no affiliate parameter (FR-DEAL-01, FR-DEAL-07).                        |
| A shop's terms forbid reading, and the app reads anyway. | No reading without a recorded terms check and a per-shop switch; the first step is the community report (US-DEAL-02, US-DEAL-06). |
| Community reports are spam or wrong.                     | Daily limit, reporter block, removal with reason, "nicht mehr da", expiry (US-DEAL-03).                                           |
| Reporter names or postal codes leak.                     | Names only to friends, postal code private and used only for regional matches, contract test of the output (QG-D2).               |
| Pushes disturb at night or repeat.                       | Quiet hours, one push per offer and keeper, no e-mail or digest (US-DEAL-05).                                                     |
| Operator AI costs exceed the budget.                     | Monthly budget with a stop and a visible reason for the operator (US-DEAL-06, P-10).                                              |
