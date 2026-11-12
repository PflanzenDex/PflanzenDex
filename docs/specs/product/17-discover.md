# 17 – Epic ENT: Discover (Swipe Suggestions for the Wishlist)

Goal: the wishlist fills playfully from the shared species catalog. Suggested are species that fit the own light and what **actually thrives** at the keeper's. Every decision (yes/no) improves the next suggestions. This closes the circle Pokédex → wish → purchase → specimen → caught.

Prototype reference: none, idea from 2026-10-02. Builds on POK (catalog, ownership US-POK-06, milestones US-POK-11), WUN (wish DM-WUN-01, buffer US-WUN-02), WAC (trend and etiolation US-WAC-03/04), LIC (distribution US-LIC-02) and KI (KI-R1 to KI-R3).

Delimitation from EQU: a **suggestion** is a species from the catalog, not a product recommendation. Discover contains no affiliate or shop links (FR-EQU-07 already excludes the Pokédex, ENT takes this over).

Delimitation from TAU: Discover suggests catalog species; the epic TAU (`21-swipe-matching.md`) shows concrete offers of friends that match the wishlist. FR-ENT-07 (chip "<friend> offers it") is the only bridge between the two.

Note (US-QS-14): the suggestion cards are the mode "Vorschläge" of the destination "Entdecken", next to the mode "Katalog" with the species catalog of the collection epic (BES); the empty state of the deck leads to "Art vorschlagen" in the catalog mode.

## Problem

1. **Replenishment is work:** on "Replenishment needed" (US-WUN-02) the keeper has to trigger a research and review every suggestion individually (US-WUN-04). That needs a connected AI client (US-KI-08) and time.
2. **The catalog stays unused:** hundreds of species with image and text are in the Pokédex, but nothing leads them specifically to the wishlist.
3. **Rejections are lost:** what the keeper does not want is learned nowhere today.

## Terms

| Term             | Meaning                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suggestion       | Species from the catalog that the keeper neither owns nor has decided on, as a card in the style of US-POK-01.                                                    |
| Deck             | Limited sequence of suggestions (starting value 10). No endless feed.                                                                                             |
| Yes / No / Later | To the wishlist / Discarded / skip without a decision.                                                                                                            |
| Thriving         | Active specimen with at least 2 measurements, overall rate > 0 and last quality `Healthy` (US-WAC-03/04). Under 2 measurements: "unknown", not "does not thrive". |
| Struggling       | Active specimen whose last measurement is `Etiolated/thin` or whose trend shows "slower".                                                                         |
| Reason           | Verifiable justification from own data for why a card appears.                                                                                                    |

## User stories

### US-ENT-01 · See suggestions one by one as a card · 🟨 new

As a **plant keeper** I want to get species suggested one by one as a large card, so that filling the wishlist is fun instead of research.

Acceptance criteria:

- The card shows image with source and license (FR-POK-07), species name, German name, short text, target light zone, difficulty (★☆☆ … ★★★) and the attributes from DM-ENT-01 where known (otherwise "unknown").
- Below the card are 1–3 **reasons** (US-ENT-03), no percentage and no "match".
- Actions: **No** · **Later** · **Yes**, on the phone also by swipe gesture (left/right, and up or down for Later), always additionally as buttons (NFR-13).
- Given a card is dragged, when the pointer moves, then the card follows it, tilted by the horizontal distance (up to 8 degrees, starting value, assumption), and the stamp of the direction ("Ja", "Nein" or "Später") fades in with the strength of the drag, so direction and strength are readable before the release.
- Given a drag ends past the threshold (40 percent of the card width, or a flick of at least 0.6 px per ms over at least 15 percent of the width; starting values, assumption), then the card flies off in that direction and the decision is written once it has left.
- Given a drag ends below the threshold, then the card springs back and nothing is decided.
- Given a vertical drag up or down past the threshold, then the card leaves as "Später": nothing is written and the species can come back in a later deck. A vertical drag starts on the grip at the top edge of the card, so that scrolling the text keeps working.
- Given a button or a key decides a card, then the card flies off as it does for the swipe of that decision (No to the left, Yes to the right, Later upwards) and the result is the same.
- Given `prefers-reduced-motion: reduce`, then the card does not follow the finger, does not fly and does not spring back; the stamp, the decision and the next card appear at once (NFR-13).
- Given a decision, when the browser offers vibration, then the device vibrates briefly once; there is no sound.
- Given the server refuses a decision, then the card springs back with the error text and nothing is lost (P-10).
- Given a card is shown, then the next card is already in place underneath with its content, hidden from assistive technology and not focusable (`aria-hidden`, `inert`), and grows to full size while the card leaves. Every card has its own element ids, so the content can be shown twice and no id occurs twice on the page (assumption: ids are made unique per card, e.g. with React `useId`).
- Given a Yes or No has been written, when the keeper taps "Rückgängig" under the card, then the decision is taken back and the card returns to the deck (US-ENT-04); the button is an equal alternative for keyboard and screen reader (NFR-13), no swipe is needed.
- After the last suggestion: "Done for today. N new on the wishlist." Further suggestions only via "New deck".
- Without candidates: "No new suggestions" with the reason (everything owned or decided, or filter too narrow) and the matching action (loosen filter, propose species US-BES-01).

### US-ENT-02 · See only species that come into question · ⬜ new

As a **plant keeper** I want to see no species that I have or have already decided on.

Acceptance criteria (hard filters before any scoring):

- Excluded: caught species (US-POK-06, incl. cuttings), species with an own wish of any status (`Wishlist`, `Bought`, `Discarded`), species without a target light zone 2–4, species without epithet.
- Catalog profiles with review status `ai-created, unreviewed` appear only with a label (FR-BES-06).
- Optional filters of the keeper (DM-ENT-03): light zone, highest difficulty, "pet-safe", growth form (US-ENT-11). A filter on an **unknown** attribute does not exclude the species but shows "Pets: unknown" (P-08, P-10).

### US-ENT-03 · Understand why something is suggested · 🟨 new

As a **plant keeper** I want to see why a species shows up, so that I trust the suggestions.

Acceptance criteria:

- Every reason corresponds to a scoring share from FR-ENT-02 and names the own data, e.g.:
  - "Lamp 4 has the fewest plants (1)" (US-LIC-02)
  - "same family as your _Echeveria_, which thrives" (WAC + taxonomy)
  - "new order: brings you to the Explorer milestone" (US-POK-11)
  - "one level harder than your previous successes"
  - "you have put 4 cacti on the wishlist" (US-ENT-05)
- At most the 3 strongest reasons. Reasons arise from the domain logic, never from the model (P-01, KI-R2).
- Exploration suggestions (US-ENT-06) are marked as "something different".

Assumptions, decided by the PO (revisable): the reasons that can be proven from existing own data are built first: "<Zone> has the fewest plants (n)" or "No plant stands in <Zone> yet" (the stock per zone 2 to 4 of US-LIC-02 through the port `ZoneStockSource`; zone number n of the catalog is the n-th zone of the account; a tie of all zones, an unknown zone and an account without a counted plant give no reason, P-08), "New family: <family> is still missing in your Pokédex" and the plain fact "You have not caught this species yet" (no share, always last). Scoring (FR-ENT-02) so far: every share (space, new family) weighs 1 (starting value, assumption); the deck is ordered by the number of shares, the tree order breaks ties (FR-ENT-05). No invented fit rule: a reason that needs "thriving" waits for its derivation.

### US-ENT-04 · Decision lands in the wishlist immediately · 🟨 new

As a **plant keeper** I want yes and no to be saved without a further form.

Acceptance criteria:

- **Yes** creates a wish per DM-WUN-01: `Species` (catalog reference), `Name`, `German`, `Target_Light_Zone`, `Difficulty`, `Reasoning` (the displayed reasons), `Image`, `Image_Source`, `License`, `Type: Plant`, `Status: Wishlist`, plus `Source: Discover` and `Decided_At` (DM-ENT-02).
- **No** creates the same wish with `Status: Discarded`.
- **Later** writes nothing; the species can appear again in a later deck.
- The date is the user's local date (NFR-08). Writing only via the validating operation `decide` (P-03).
- Idempotent: if a wish already exists for the species, no second one arises (FR-WUN-06).
- A wrong decision can be changed in the wishlist (reset status); the species then appears again in Discover.
- **Rückgängig** takes back the **last** Yes or No the keeper wrote in Discover (operation `discover.undo`, P-03): the wish that this decision created is removed, nothing else is touched, and the card returns to the deck. Only the last one can be taken back, and once; a later Yes or No makes an earlier one final. A Later and a repeated decision write nothing and do not end it on the server; the screen offers the button only directly after the Yes or No.
- A wish changed since the decision is not removed: a wish that is no longer open (bought or discarded in the wishlist) or that became a specimen is refused with `discover.undo_changed`; a wish that is not a Discover wish is refused with `discover.not_a_decision`; an earlier decision with `discover.undo_not_last`. A refusal changes nothing.
- Repeating the undo is idempotent: with the same Idempotency-Key the same answer comes back, and a new key for a decision that is gone writes nothing and answers `undone: false`.
- Another account cannot take back my decision: it answers `undone: false` and my wish stays (P-04).

Assumptions, decided by the PO (revisable): the client names only the species and the decision; the server derives the wish from the suggestion itself (a made-up card cannot be written) and refuses a species that is not suggested to the account (`discover.not_suggested`). The "catalog reference" of the wish is the Latin name, because the wish has no species column yet (the name key keeps it unique, FR-WUN-06). The target zone is the account's n-th zone (as in US-ENT-03), the license stays unknown because the card carries none (P-08), the image source is the card's source link, and `Reasoning` holds the displayed reasons joined into one text. A repeated decision on a species that has a wish of any status writes nothing (`saved: false`). A swipe to the right is "Yes", to the left "No". Not built yet: resetting a wish back to open from the wishlist (so a discarded species appears again). The undo ("Rückgängig") is simplified on purpose: it covers the keeper's last Yes or No in Discover, across decks and days, because a decision does not store its deck (the deck is derived, not stored); an earlier decision is final. The last Yes or No is marked on its wish (`last_decision`, at most one per account), so the mark moves with every new Yes or No and vanishes with the wish; the screen keeps the button for the current deck view only, a reload does not offer it.

### US-ENT-05 · Suggestions learn from my decisions · 🟨 new

As a **plant keeper** I want my decisions to change the next suggestions.

Acceptance criteria:

- Preferences are derived **live** from the own wishes with every deck (`Wishlist`/`Bought` = yes, `Discarded` = no) and not stored as a second copy (NFR-04).
- For each attribute value (family, genus, light zone, difficulty, attributes from DM-ENT-01) the preference factor `(yes + 1) / (no + 1)` applies. Without decisions every factor is 1.
- Wishes from other sources (AI research, manual) count as "yes", because the keeper adopted them deliberately.
- Example: after 5× No for Crassulaceae and 0× Yes the family factor drops to 1/6. Crassulaceae appear much less often, but not never (US-ENT-06).
- Only the own decisions count; decisions of other users do not flow in (FR-ENT-07).

Assumptions, decided by the PO (revisable): the factor looks at the attributes the catalog carries today: family, genus, light zone and difficulty (the DM-ENT-01 attributes join when the catalog has them; unknown values are neutral). A decision is attributed through the catalog card of the same name key, with the catalog's light zone and difficulty; a wish for a species outside the catalog changes nothing. The score is the factor times (1 + the number of shares), so the factor also orders species without a share (starting value of the base, assumption; without decisions the order stays that of US-ENT-03). The reason "You have N species of the genus (family) X on the wishlist" appears only where yes outnumbers no (genus first, then family); there is no reason for a rejection. Not built yet: the proximity and growth shares of FR-ENT-02 and the exploration quota that keeps rejected families from disappearing (US-ENT-06).

### US-ENT-06 · Also see the surprising · 🟨 new

As a **plant keeper** I want to see something outside my pattern now and then, so that the catalog does not shrink to one corner.

Acceptance criteria:

- Per deck 2 of 10 cards (starting values) are exploration suggestions: species from orders or families without a caught species, orders with the fewest species first (like _Explorer_, US-POK-11).
- Hard filters (US-ENT-02) apply here too.
- The selection is fixed per account, day and deck number, so that reloading shows the same deck (FR-ENT-05).

Assumptions, decided by the PO (revisable): the exploration cards per deck are 2 of 10 (`EXPLORATION_PER_DECK`, DM-ENT-03 starting value, not adjustable yet). A species explores if its order has no caught species, or, where the order has one, its family has none; the groups are ordered by their size in the catalog tree (fewest species first, name as tie-break). Deck n takes one species from each of the next 2 groups, so the groups of earlier decks are used up first; inside a group the species is chosen by a stable hash of account, local day, deck number and group, so the choice varies per day but a reload shows the same deck. Species that explore in any deck are left out of the normal order, so no card shows twice; the normal cards fill the rest of the deck in rank order, and the exploration cards sit spread between them. An exploration card carries the badge "Mal etwas anderes" and the reasons "Aus der Ordnung X hast du noch keine Art im Pokédex" (or Familie) and the plain not-caught fact; its preference reasons are left out. Species without a known order and family never explore (P-08). The wish written by US-ENT-04 takes the reasons of the normal card. The hard filters of US-ENT-02 are not built yet and will apply to the groups.

### US-ENT-07 · Discover directly from the buffer warning · 🟨 new

As a **plant keeper** I want to see matching suggestions immediately on "Replenishment needed".

Acceptance criteria:

- Besides "Fetch suggestions" (AI research, US-WUN-04) the buffer warning (US-WUN-02) offers the action "Discover for <zone>", which opens a deck with a filter on this zone.
- If the catalog does not suffice for the zone (fewer candidates than the buffer after filters), the view says so and offers the AI research or "Propose species" (US-BES-01). Newly researched species go via the catalog (US-POK-02), not past it.

Assumptions, decided by the PO (revisable): the warning offers one button "Entdecken für <zone>" per zone below the buffer; it opens Discover at `/discover?view=suggestions&zone=<n>` (n = zone number 2 to 4, the n-th zone of the account, as in US-ENT-03). `GET /discover/suggestions` takes the same `zone` parameter (anything but 2 to 4 is `input.invalid`) and answers `zoneFilter` with the zone, its name, the number of candidates of the zone and, if that number is below the account's buffer (US-WUN-02, default 2), a `shortfall` with the text and the next action. The filter keeps species whose catalog light zone equals the zone; exploration picks of other zones are left out; a species without a known zone is not shown as fitting (P-08). The view names the zone and shows the shortfall with the link "Art vorschlagen" (US-BES-01; newly proposed species go through the catalog and its review, US-POK-02). Not built yet: the "Fetch suggestions" (AI research, US-WUN-04) offer in the shortfall, because that story does not exist; the other keeper filters of US-ENT-02.

### US-ENT-08 · Suggestions via the AI client · 🟨 new

As a **plant keeper** I want to be able to ask "What fits me next?" and get the same suggestions as in the view.

Acceptance criteria:

- The AI client calls the operation `suggestions` and reproduces order and reasons; it does not assess itself (KI-R1, KI-R2).
- "Yes" or "No" in the conversation calls `decide` (right "write", otherwise draft), with the same effect as US-ENT-04.
- If the client adds knowledge about the species, it marks what does not come from the catalog (KI-R5).
- Discover works completely without AI (FR-KI-05).

Built (assumption, decided by the PO): `GET /mcp/discover/suggestions` (read) and `POST /mcp/discover/decisions` (with "write" at once through `discover.decide`, with "create drafts" as a draft `discover_decision` the keeper adopts; "Later" writes nothing). Still open: the marking of the client's own knowledge (KI-R5) and the tool that exposes the undo of US-ENT-04 (`discover.undo` exists, no tool yet). The earlier gap note follows for history. Gap, noted by the PO assistant (US-ENT-08 not started): the operations `suggestions` (`GET /discover/suggestions`) and `decide` (`POST /discover/decisions`) exist and run without AI (FR-KI-05), so the part that needs no AI client is in place. Missing and blocked by the AI access (release R4): the connection of the client (US-KI-07, E-04), the tool definitions that expose both operations to it, the right model "write, otherwise draft" for `decide` (US-KI-09) and the marking of knowledge that does not come from the catalog (KI-R5).

### US-ENT-09 · Species attributes with source and license per field · 🟨 new

As a **plant keeper** I want the attributes of a suggestion (humidity, minimum temperature, growth size, toxic to pets, light statement of a source) to show where each value comes from, so that I can check it before I buy.

Acceptance criteria:

- Given a researched value, When it has one of the citable sources (GBIF, Wikipedia, Wikidata), an https link, a free license and a retrieval date, Then it is accepted and stored per species and field (DM-ENT-01).
- Given a value without such a source, link, license or date, or from an AI statement, or with a wrong type or range, Then it is refused with every problem named and nothing is stored (P-08, US-KI-06).
- Given a species without a stored value for a field, Then the field stays unknown, acts neutrally and is shown as "unbekannt" (FR-ENT-04, P-08).
- Given a newer research for the same species and field, Then the value is replaced, never duplicated.
- Given a light statement (`lightDescription`) with one of the values `low`, `medium`, `bright_indirect`, `direct_sun` and a citable source, https link, free license and retrieval date, Then it is accepted and stored like the other attributes.
- Given a light statement outside that value set (for example `sunny` or a number), Then it is refused as `attribute.value_invalid` and nothing is stored.
- Given a species with a stored light statement, Then the card shows "Licht laut Quelle: <wenig Licht | mittleres Licht | helles indirektes Licht | direkte Sonne>" with source link, license, retrieval date and "ungeprüft"; without a stored statement the field reads "unbekannt".
- Given a stored light statement, Then the light zone, the scoring and the reasons of the suggestion stay unchanged (P-08).

Assumptions, decided by the PO (revisable): built so far is the data layer: the table `taxon_attribute` (migration `0077`, shared, no account id, read-only for the application role, one row per species and field with source, link, license and retrieval date), the pure check `checkAttributeFact` and `attributesOf` in `core`, and the store `TaxonAttributesPostgres`. Accepted licenses are CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0 and CC-BY-SA-3.0; the minimum temperature must lie between -30 and 30 degrees Celsius (an outside value is an extraction error); "needs dormancy" is derived and not stored. **Fill job and display (part 2):** the job `catalog.fill_attributes` (`orderAttributeFill`, `runAttributeFill`, port `AttributeFillStore`) fills the table from answers that the catalog fill (US-BES-12) already stored, so it sends no request itself (the Wikidata answer of an approved species is read through `TaxonAttributesPostgres.heightCandidates`). Only one field has a structured, citable source so far: the growth size from the Wikidata height (property P2048, metre or centimetre; preferred claims count, else normal ones; a deprecated claim, another unit or claims that fall into different classes give no value). Size classes are starting values, assumption: below 0.5 m small, up to 2 m medium, above that large (`GROWTH_SIZE_LIMITS_M`). Source is Wikidata, link is the item page, license is the one of the stored answer (CC0-1.0), date is the UTC retrieval date of that answer; every fact passes `checkAttributeFact` first and a refused one fails the job with its problems (P-10). Humidity, minimum temperature and toxic to pets stay unknown: no open source with a structured value was found (E-25; open decision 1 stays open for them). The job is idempotent (a stored field is not a candidate again) and runs only with `ATTRIBUTE_FILL=on` (unset or `off`: no handler, no order; any other value stops the start); it needs the stored answers of `CATALOG_FILL=on`. The Discover card shows a known value with its source link, license, retrieval date and the status "ungeprüft" (`attributeSources` of the suggestion; unknown attributes list no source). Every stored value counts as unreviewed because the review status of FR-BES-06 does not exist for attributes yet (no migration; a column comes with the review of US-BES-13). **Light statement (#1015):** the fifth attribute `lightDescription` with the fixed value set `low` / `medium` / `bright_indirect` / `direct_sun` (assumption, decided by the PO, revisable; German display "wenig Licht", "mittleres Licht", "helles indirektes Licht", "direkte Sonne"). It is only the statement of a source with link, name, license and retrieval date, shown as "Licht laut Quelle" and "ungeprüft". It does **not** feed the light zone derivation or the scoring: zones are numeric lux and a mapping from the statement would be an invented number (P-08); a sourced mapping is decided later. Migration `0097` widens the checks of `taxon_attribute`; `catalog:check-data` and `catalog:load` (also `--dry-run`) handle the field like the others. **Researched start data (part 3, #1005):** researched values live in the repo as data files (one record per species of the start list, per field value, source link, source name, license, retrieval date and an optional short note); `catalog:check-data` refuses a value without an https link on a host of the three sources, without an accepted license, with a retrieval date in the future, an unknown field or key, a value out of range, a note over 300 characters (starting value, against copied running text), a species twice or a species not on the start list, and names file, species and field for each problem. `catalog:load` runs the check first and writes nothing on a problem; otherwise it writes new or changed values in the transaction of the species (one row per species and field, a newer value replaces the old one). First example: toxic to pets for three species from Wikipedia (Wikidata and GBIF hold no structured value for them); the research of further batches follows. Not built yet: the review itself, the other three fields from an open source, the species card of the Pokédex (the spec asks for the attributes on the Discover card only) and replacing a value when a newer answer is stored.

### US-ENT-10 · Swipe through a card stack that feels like a deck · 🟨 new

As a **plant keeper** I want the suggestions to lie as a stack I can see into, react to my finger and leave in the direction I threw them, so that deciding feels quick and playful, and I want to take a slip back.

Context: US-ENT-01 already holds the drag with tilt and stamp, the thresholds, the fly-off per decision, the spring-back, the next card underneath, the vibration and "Rückgängig". This story adds only what is missing for the card stack. The same card behaviour applies to swap matching (US-TAU-02) when that epic is built.

Acceptance criteria:

- Given a deck with at least three cards left, then the top card and up to two cards below it are visible as a stack: each lower card is a little smaller and offset downwards (starting values: 4 percent smaller and 8 px lower per level, assumption), so the depth and the rest of the deck are visible at a glance; with fewer cards left the stack shows only those. A line "Karte n von m" names the position in text (P-09, NFR-13).
- Given a card is dragged, then the card below grows towards full size with the strength of the drag, and springs back with the top card when the drag ends below the threshold (US-ENT-01).
- Given a drag ends past the threshold, then the card leaves along the direction and speed of the release (a throw to the upper right leaves to the upper right), the decision is still the one of the dominant direction (right Yes, left No, up or down Later, US-ENT-01), and the card below moves up to the top in the same motion.
- Given "Rückgängig" after a Yes or a No (US-ENT-04), then the card comes back onto the stack from the side it left and the stack moves down by one level; with motion reduced it is back at once.
- Given the deck has the focus (the card or one of its buttons), then the arrow keys decide: right is Yes, left is No, up or down is Later, and Backspace is "Rückgängig" where the button is offered; the keys act only inside the deck, never while the focus is in a text field, and they are listed in the shortcut overview of the view (US-QS-11). They are local keys of the deck, not global shortcuts, so they do not enter the global register that refuses arrow keys and Backspace.
- Given buttons, keys or a swipe, then each leads to the same decision and the same animation (US-ENT-01), and the buttons No, Later, Yes and "Rückgängig" always stay visible as tap targets of at least 44 px (US-QS-07, NFR-13).
- Given reduced motion (device or "Bewegung aus", US-QS-33), then the stack shows its depth as a still picture, the card does not follow the finger, does not tilt and does not fly; a swipe past the threshold, a button or a key decides as before, the stamp of the decision shows for a short moment (starting value 300 ms, assumption) and the next card stands in place at once (US-ENT-01).
- Given any of these ways, then the decision is written only through the operations `discover.decide` and `discover.undo` (US-ENT-04); the stack adds no second write path (P-03), stores nothing of its own, and a refused write puts the card back with the error text (P-10).
- Given the cards below the top card, then they are hidden from assistive technology and not focusable (US-ENT-01); a screen reader hears only the top card, its position "Karte n von m" and the result of each decision (US-QS-10).
- Given the deck view at 360 × 640 px, then stack, reasons and the decision row fit the screen as in US-QS-21; the stack takes no more height than the single card took before.

Assumptions, decided by the PO (revisable): two visible levels below the top card; offsets and timings are starting values to be tuned in a test with the start users; the code for the motion loads only with the suggestions (US-QS-14, ADR 0011).

State of implementation (🟨): the shared `SwipeCard` shows up to two levels below the top card (`depth`, 4 percent and 8 px per level, inside the height of the single card), the card below grows with the drag, a throw leaves along the line of the release with a flight time that follows a flick (at least 120 ms, at most 200 ms, starting values, assumption), a card taken back with "Rückgängig" comes in from the side it left, and under reduced motion the stack stays still and the stamp shows for 300 ms. The deck reads "Karte n von m", tells each result to a screen reader through the announcer, and takes the arrow keys and Backspace while it has the focus; the shortcut overview lists them in a section "In dieser Ansicht" (`useViewKeys`). Writes stay `discover.decide` and `discover.undo`. Swap matching (US-TAU-02) uses the same card and gets the same motion. Open: the fit at 360 × 640 px and the look of the stack are covered by unit tests only; the one-screen run and a browser check are still to do.

### US-ENT-11 · See the growth form of a species and filter by it · ⬜ new

As a **plant keeper** I want to see whether a species grows hanging, bushy, upright, as a rosette or otherwise, and filter the suggestions by it, so that I pick plants that fit the place I have in mind (a shelf edge, a hanging pot, a windowsill).

Context: growth form is a new species attribute of DM-ENT-01 and follows the rules of US-ENT-09 (table `taxon_attribute`, source, https link, free license and retrieval date per value, `checkAttributeFact`, `catalog:check-data`, `catalog:load`). It is not growth size: growth size says how much space, growth form says which shape.

Acceptance criteria:

- Given the controlled list of growth forms (DM-ENT-01: `upright`, `bushy`, `trailing`, `climbing`, `rosette`, `columnar`, `globular`, `creeping`), when a value is researched with a source from Wikipedia or Wikidata, an https link on one of their hosts, an accepted license and a retrieval date, then it is accepted and stored per species (US-ENT-09).
- Given a value outside the list, more than two forms, no source, no link, no license, a retrieval date in the future, or an AI statement as the only evidence, then it is refused (`attribute.value_invalid` for a value outside the list) with every problem named, and nothing is stored (P-08, US-KI-06).
- Given a species with one or two stored forms (for example climbing and trailing), then the Discover card shows "Wuchsform: kletternd, hängend" with source link, license, retrieval date and "ungeprüft" (US-ENT-09); without a stored value it shows "Wuchsform: unbekannt".
- Given the filter "Wuchsform" of the deck (DM-ENT-03), when I choose one or more forms, then species with a matching form are shown; a species whose form is unknown is not excluded but shows "Wuchsform: unbekannt" (as the pet filter of US-ENT-02, P-10); when the filter leaves no candidate, the empty state of US-ENT-01 names the filter and offers to loosen it (P-09).
- Given my decisions, then the growth form takes part in the preference factor of US-ENT-05 like the other DM-ENT-01 attributes; an unknown form is neutral (FR-ENT-04). No reason names a form the keeper did not decide on.
- Given the profile of a species in the catalog and the location planning (the zone overview of US-LIC-02 and the list of a location), then the growth form of the species of each specimen is shown beside its name, and the location list can be filtered by it; the planning derives no rule from it (no "fits / does not fit" between a form and a place, P-08).
- Given any view with a growth form, then no statement compares a specimen's shape with the growth form of its species or with a species average, and a specimen that grows differently is not marked; a stretched, etiolated specimen never counts as "upright" (FR-ENT-03, P-08).
- Given the German labels, then they are "aufrecht", "buschig", "hängend", "kletternd", "Rosette", "säulenförmig", "kugelförmig" and "kriechend" (message table of the feature).

Assumptions, decided by the PO (revisable): the list of eight forms is final for now and can only grow (a form is never renamed, P-10). A species carries one or two forms because many house plants grow in two ways (climbing or trailing); more than two would blur the filter. No structured Wikidata property for growth form is known to the PO, so values come through the researched start data of US-ENT-09 part 3 (Wikipedia sentence or Wikidata statement, linked, short note at most 300 characters); a structured source replaces the manual research once one is found. A specimen field cannot override the growth form (no specimen-level form, so no comparison arises).

## Data model

### DM-ENT-01 Species attributes (extension of DM-BES-01)

Optional catalog fields. Because the catalog is shared, all users benefit from an enrichment. Every set field needs a source and is subject to the review status (FR-BES-06).

| Field            | Values                                                                                                         | Meaning                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Humidity         | `low` / `medium` / `high`                                                                                      | Need for relative humidity                                                                                                    |
| Temperature min. | Number (°C)                                                                                                    | Minimum temperature                                                                                                           |
| Needs dormancy   | yes / no                                                                                                       | derived from dormancy from/until, if maintained                                                                               |
| Growth size      | `small` / `medium` / `large`                                                                                   | Space need in the light zone                                                                                                  |
| Toxic to pets    | yes / no                                                                                                       | for the filter "pet-safe"; source mandatory, no AI statement as fact (US-KI-06)                                               |
| Light statement  | `low` / `medium` / `bright_indirect` / `direct_sun`                                                            | Statement of a source about the light need, shown as "Licht laut Quelle"; assumption, no light zone is derived from it (P-08) |
| Growth form      | one or two of `upright` / `bushy` / `trailing` / `climbing` / `rosette` / `columnar` / `globular` / `creeping` | Shape of growth (US-ENT-11); not the space need, which is growth size; assumption, decided by the PO                          |
| Attribute source | Link/work                                                                                                      | Evidence per entry                                                                                                            |

### DM-ENT-02 Decision (extension of DM-WUN-01)

| Field      | Required | Meaning                                                                        |
| ---------- | -------- | ------------------------------------------------------------------------------ |
| Source     | yes      | `Discover`, `AI research`, `manual`, `Pokédex` (action on the card, US-POK-09) |
| Decided_At | no       | Local date of the yes/no decision                                              |

### DM-ENT-03 Discover settings (per account)

`Deck size` (starting value 10), `Exploration per deck` (starting value 2), `Highest difficulty` (empty), `Pet-safe` (off), `Growth forms` (empty = all, US-ENT-11). Starting values are assumptions and readjustable.

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| FR-ENT-01 | Selection, scoring, reasons and preferences are pure domain logic without I/O with tests (P-02, P-06). View, AI client and later clients use the same logic.                                                                                                                                                                                                                                                                                                                                                  | ⬜              |
| FR-ENT-02 | **Scoring** per candidate = product of the preference factors (US-ENT-05) × sum of the shares: **space** (zone with few specimens, US-LIC-02), **proximity to what thrives** (same genus > family > order as a specimen that thrives; same zone; matching attributes from DM-ENT-01), **Pokédex** (new family/order or missing species of an open milestone, US-POK-11), **growth** (difficulty at most one level above the hardest that thrives). Weights are starting values (assumption) and configurable. | ⬜              |
| FR-ENT-03 | Proximity to specimens that **struggle** gives no bonus. Without measurement data a specimen counts only as ownership, not as success. No comparison with species averages (P-08).                                                                                                                                                                                                                                                                                                                            | ⬜              |
| FR-ENT-04 | Unknown attributes act neutrally: no bonus, no deduction, visible as "unknown".                                                                                                                                                                                                                                                                                                                                                                                                                               | ⬜              |
| FR-ENT-05 | Same data, same date and same deck number yield the same deck in the same order.                                                                                                                                                                                                                                                                                                                                                                                                                              | ⬜              |
| FR-ENT-06 | No percentage, no "match", no fit stars: the scoring only orders, reasons are displayed (P-08).                                                                                                                                                                                                                                                                                                                                                                                                               | ⬜              |
| FR-ENT-07 | **Social:** a chip "<friend> offers it" appears if a friend has the species in the swap exchange (US-SOZ-09). Suggestions from the behavior of other users ("keepers like you like …") are excluded until there is a minimum count and displayed sample size (non-goals in `16`).                                                                                                                                                                                                                             | ⬜              |
| FR-ENT-08 | Decisions are private like the wishlist (FR-WUN-07). Friends see neither yes nor no.                                                                                                                                                                                                                                                                                                                                                                                                                          | ⬜              |
| FR-ENT-09 | Out of scope: endless feed, notifications about new suggestions, affiliate/shop links, machine learning beyond the factors from US-ENT-05, species outside the catalog.                                                                                                                                                                                                                                                                                                                                       | ⬜ (deliberate) |

## Open questions

1. **Attributes first:** which fields from DM-ENT-01 are enriched first? Proposal: humidity and toxic to pets, because they prevent the most wrong purchases. Who researches: operator batch, AI with review status, or both?
2. **Deck size and exploration share:** 10 and 2 as a start; readjust after a few weeks of use?
3. **Shop/nursery partners** (stage 2/3 in `13-Business-Case.md`) stay out of Discover (FR-ENT-09). Should this be decided anew later?

## Risks

| Risk                                                                                           | Countermeasure                                                                                                              |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The catalog is too small (prototype: 215 species); after a few decks everything is decided.    | Catalog build-out (US-POK-02, target 600+) is a precondition for lasting fun; US-ENT-01 says honestly when nothing is left. |
| Attributes without source or wrong (especially toxicity) lead to bad or dangerous suggestions. | Source mandatory, review status, unknown stays neutral (FR-ENT-04), no AI statement as fact.                                |
| Few measurement data make "thrives" thin, especially for new accounts.                         | The shares space and Pokédex work without measurement data; the proximity share grows with the measurements.                |
| Swiping becomes distraction instead of decision.                                               | Limited deck, no endless feed, no notification (FR-ENT-09).                                                                 |
