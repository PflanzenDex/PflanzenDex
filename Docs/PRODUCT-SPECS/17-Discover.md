# 17 – Epic ENT: Discover (Swipe Suggestions for the Wishlist)

Goal: the wishlist fills playfully from the shared species catalog. Suggested are species that fit the own light and what **actually thrives** at the keeper's. Every decision (yes/no) improves the next suggestions. This closes the circle Pokédex → wish → purchase → specimen → caught.

Prototype reference: none, idea from 2026-10-02. Builds on POK (catalog, ownership US-POK-06, milestones US-POK-11), WUN (wish DM-WUN-01, buffer US-WUN-02), WAC (trend and etiolation US-WAC-03/04), LIC (distribution US-LIC-02) and KI (KI-R1 to KI-R3).

Delimitation from EQU: a **suggestion** is a species from the catalog, not a product recommendation. Discover contains no affiliate or shop links (FR-EQU-07 already excludes the Pokédex, ENT takes this over).

## Problem

1. **Replenishment is work:** on "Replenishment needed" (US-WUN-02) the keeper has to trigger a research and review every suggestion individually (US-WUN-04). That needs a connected AI client (US-KI-08) and time.
2. **The catalog stays unused:** hundreds of species with image and text are in the Pokédex, but nothing leads them specifically to the wishlist.
3. **Rejections are lost:** what the keeper does not want is learned nowhere today.

## Terms

| Term               | Meaning                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suggestion         | Species from the catalog that the keeper neither owns nor has decided on, as a card in the style of US-POK-01.                                                       |
| Deck               | Limited sequence of suggestions (starting value 10). No endless feed.                                                                                                |
| Yes / No / Later   | To the wishlist / Discarded / skip without a decision.                                                                                                               |
| Thriving           | Active specimen with at least 2 measurements, overall rate > 0 and last quality `Healthy` (US-WAC-03/04). Under 2 measurements: "unknown", not "does not thrive".    |
| Struggling         | Active specimen whose last measurement is `Etiolated/thin` or whose trend shows "slower".                                                                            |
| Reason             | Verifiable justification from own data for why a card appears.                                                                                                       |

## User stories

### US-ENT-01 · See suggestions one by one as a card · 🟨 new

As a **plant keeper** I want to get species suggested one by one as a large card, so that filling the wishlist is fun instead of research.

Acceptance criteria:

- The card shows image with source and license (FR-POK-07), species name, German name, short text, target light zone, difficulty (★☆☆ … ★★★) and the attributes from DM-ENT-01 where known (otherwise "unknown").
- Below the card are 1–3 **reasons** (US-ENT-03), no percentage and no "match".
- Actions: **No** · **Later** · **Yes**, on the phone also by swipe gesture (left/right), always additionally as buttons (NFR-13).
- After the last suggestion: "Done for today. N new on the wishlist." Further suggestions only via "New deck".
- Without candidates: "No new suggestions" with the reason (everything owned or decided, or filter too narrow) and the matching action (loosen filter, propose species US-BES-01).

### US-ENT-02 · See only species that come into question · ⬜ new

As a **plant keeper** I want to see no species that I have or have already decided on.

Acceptance criteria (hard filters before any scoring):

- Excluded: caught species (US-POK-06, incl. cuttings), species with an own wish of any status (`Wishlist`, `Bought`, `Discarded`), species without a target light zone 2–4, species without epithet.
- Catalog profiles with review status `ai-created, unreviewed` appear only with a label (FR-BES-06).
- Optional filters of the keeper (DM-ENT-03): light zone, highest difficulty, "pet-safe". A filter on an **unknown** attribute does not exclude the species but shows "Pets: unknown" (P-08, P-10).

### US-ENT-03 · Understand why something is suggested · ⬜ new

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

### US-ENT-04 · Decision lands in the wishlist immediately · ⬜ new

As a **plant keeper** I want yes and no to be saved without a further form.

Acceptance criteria:

- **Yes** creates a wish per DM-WUN-01: `Species` (catalog reference), `Name`, `German`, `Target_Light_Zone`, `Difficulty`, `Reasoning` (the displayed reasons), `Image`, `Image_Source`, `License`, `Type: Plant`, `Status: Wishlist`, plus `Source: Discover` and `Decided_At` (DM-ENT-02).
- **No** creates the same wish with `Status: Discarded`.
- **Later** writes nothing; the species can appear again in a later deck.
- The date is the user's local date (NFR-08). Writing only via the validating operation `decide` (P-03).
- Idempotent: if a wish already exists for the species, no second one arises (FR-WUN-06).
- A wrong decision can be changed in the wishlist (reset status); the species then appears again in Discover.

### US-ENT-05 · Suggestions learn from my decisions · ⬜ new

As a **plant keeper** I want my decisions to change the next suggestions.

Acceptance criteria:

- Preferences are derived **live** from the own wishes with every deck (`Wishlist`/`Bought` = yes, `Discarded` = no) and not stored as a second copy (NFR-04).
- For each attribute value (family, genus, light zone, difficulty, attributes from DM-ENT-01) the preference factor `(yes + 1) / (no + 1)` applies. Without decisions every factor is 1.
- Wishes from other sources (AI research, manual) count as "yes", because the keeper adopted them deliberately.
- Example: after 5× No for Crassulaceae and 0× Yes the family factor drops to 1/6. Crassulaceae appear much less often, but not never (US-ENT-06).
- Only the own decisions count; decisions of other users do not flow in (FR-ENT-07).

### US-ENT-06 · Also see the surprising · ⬜ new

As a **plant keeper** I want to see something outside my pattern now and then, so that the catalog does not shrink to one corner.

Acceptance criteria:

- Per deck 2 of 10 cards (starting values) are exploration suggestions: species from orders or families without a caught species, orders with the fewest species first (like _Explorer_, US-POK-11).
- Hard filters (US-ENT-02) apply here too.
- The selection is fixed per account, day and deck number, so that reloading shows the same deck (FR-ENT-05).

### US-ENT-07 · Discover directly from the buffer warning · ⬜ new

As a **plant keeper** I want to see matching suggestions immediately on "Replenishment needed".

Acceptance criteria:

- Besides "Fetch suggestions" (AI research, US-WUN-04) the buffer warning (US-WUN-02) offers the action "Discover for <zone>", which opens a deck with a filter on this zone.
- If the catalog does not suffice for the zone (fewer candidates than the buffer after filters), the view says so and offers the AI research or "Propose species" (US-BES-01). Newly researched species go via the catalog (US-POK-02), not past it.

### US-ENT-08 · Suggestions via the AI client · ⬜ new

As a **plant keeper** I want to be able to ask "What fits me next?" and get the same suggestions as in the view.

Acceptance criteria:

- The AI client calls the operation `suggestions` and reproduces order and reasons; it does not assess itself (KI-R1, KI-R2).
- "Yes" or "No" in the conversation calls `decide` (right "write", otherwise draft), with the same effect as US-ENT-04.
- If the client adds knowledge about the species, it marks what does not come from the catalog (KI-R5).
- Discover works completely without AI (FR-KI-05).

## Data model

### DM-ENT-01 Species attributes (extension of DM-BES-01)

Optional catalog fields. Because the catalog is shared, all users benefit from an enrichment. Every set field needs a source and is subject to the review status (FR-BES-06).

| Field                | Values                        | Meaning                                                                                     |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| Humidity             | `low` / `medium` / `high`     | Need for relative humidity                                                                  |
| Temperature min.     | Number (°C)                   | Minimum temperature                                                                         |
| Needs dormancy       | yes / no                      | derived from dormancy from/until, if maintained                                             |
| Growth size          | `small` / `medium` / `large`  | Space need in the light zone                                                                |
| Toxic to pets        | yes / no                      | for the filter "pet-safe"; source mandatory, no AI statement as fact (US-KI-06)             |
| Attribute source     | Link/work                     | Evidence per entry                                                                          |

### DM-ENT-02 Decision (extension of DM-WUN-01)

| Field      | Required | Meaning                                                                                  |
| ---------- | -------- | ---------------------------------------------------------------------------------------- |
| Source     | yes      | `Discover`, `AI research`, `manual`, `Pokédex` (action on the card, US-POK-09)           |
| Decided_At | no       | Local date of the yes/no decision                                                        |

### DM-ENT-03 Discover settings (per account)

`Deck size` (starting value 10), `Exploration per deck` (starting value 2), `Highest difficulty` (empty), `Pet-safe` (off). Starting values are assumptions and readjustable.

## Requirements

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| FR-ENT-01 | Selection, scoring, reasons and preferences are pure domain logic without I/O with tests (P-02, P-06). View, AI client and later clients use the same logic.                                                                                                                                                                                                                                                                                                                                                                        | ⬜           |
| FR-ENT-02 | **Scoring** per candidate = product of the preference factors (US-ENT-05) × sum of the shares: **space** (zone with few specimens, US-LIC-02), **proximity to what thrives** (same genus > family > order as a specimen that thrives; same zone; matching attributes from DM-ENT-01), **Pokédex** (new family/order or missing species of an open milestone, US-POK-11), **growth** (difficulty at most one level above the hardest that thrives). Weights are starting values (assumption) and configurable.                          | ⬜           |
| FR-ENT-03 | Proximity to specimens that **struggle** gives no bonus. Without measurement data a specimen counts only as ownership, not as success. No comparison with species averages (P-08).                                                                                                                                                                                                                                                                                                                                                 | ⬜           |
| FR-ENT-04 | Unknown attributes act neutrally: no bonus, no deduction, visible as "unknown".                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ⬜           |
| FR-ENT-05 | Same data, same date and same deck number yield the same deck in the same order.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ⬜           |
| FR-ENT-06 | No percentage, no "match", no fit stars: the scoring only orders, reasons are displayed (P-08).                                                                                                                                                                                                                                                                                                                                                                                                                                    | ⬜           |
| FR-ENT-07 | **Social:** a chip "<friend> offers it" appears if a friend has the species in the swap exchange (US-SOZ-09). Suggestions from the behavior of other users ("keepers like you like …") are excluded until there is a minimum count and displayed sample size (non-goals in `16`).                                                                                                                                                                                                                                                  | ⬜           |
| FR-ENT-08 | Decisions are private like the wishlist (FR-WUN-07). Friends see neither yes nor no.                                                                                                                                                                                                                                                                                                                                                                                                                                               | ⬜           |
| FR-ENT-09 | Out of scope: endless feed, notifications about new suggestions, affiliate/shop links, machine learning beyond the factors from US-ENT-05, species outside the catalog.                                                                                                                                                                                                                                                                                                                                                            | ⬜ (deliberate) |

## Open questions

1. **Attributes first:** which fields from DM-ENT-01 are enriched first? Proposal: humidity and toxic to pets, because they prevent the most wrong purchases. Who researches: operator batch, AI with review status, or both?
2. **Deck size and exploration share:** 10 and 2 as a start; readjust after a few weeks of use?
3. **Shop/nursery partners** (stage 2/3 in `13-Business-Case.md`) stay out of Discover (FR-ENT-09). Should this be decided anew later?

## Risks

| Risk                                                                                                         | Countermeasure                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| The catalog is too small (prototype: 215 species); after a few decks everything is decided.                  | Catalog build-out (US-POK-02, target 600+) is a precondition for lasting fun; US-ENT-01 says honestly when nothing is left. |
| Attributes without source or wrong (especially toxicity) lead to bad or dangerous suggestions.               | Source mandatory, review status, unknown stays neutral (FR-ENT-04), no AI statement as fact.                                |
| Few measurement data make "thrives" thin, especially for new accounts.                                       | The shares space and Pokédex work without measurement data; the proximity share grows with the measurements.                |
| Swiping becomes distraction instead of decision.                                                             | Limited deck, no endless feed, no notification (FR-ENT-09).                                                                 |
