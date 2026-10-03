# 07 – Epic WUN: Wishlist and Acquisition Planning

Goal: new plants are acquired where the light system has room, and the candidate list does not run empty unnoticed.

Prototype reference: epic WUN. Differences: a purchase leads, guided, to the plant (solves B-09), images are saved locally instead of hotlinked, equipment candidates are added (epic EQU).

## User stories

### US-WUN-01 · See candidates prioritized by space need · ⬜ (prototype ✅)

Acceptance criteria:

- Open candidates (`Status: Wishlist`) are shown, sorted ascending by the stock of the respective target light zone (specimen count, zones 2–4; unknown zone last).
- Per candidate: photo with source, "German (name)", target zone with current stock ("— N plants"), difficulty, reasoning, actions.
- Without open candidates: "No open candidates in the wishlist."

### US-WUN-02 · Be warned before the list is empty · ⬜ (prototype ✅)

Acceptance criteria:

- Per zone 2–4 there should be at least **2** open candidates (buffer, adjustable).
- If a zone falls below the buffer, a warning appears "Replenishment needed: <zone> (N open candidates)" with the actions "Discover for <zone>" (US-ENT-07) and "Fetch suggestions" (US-WUN-04).
- The warning can come as a reminder (US-MON-01).

### US-WUN-03 · Record a purchase · ⬜ (prototype ✅)

Acceptance criteria:

- "Bought" sets `Status: Bought` and hides the candidate from the list, but it stays in the history.
- The guided path to the plant follows (US-WUN-05).

### US-WUN-04 · Have new candidates researched · ⬜ (prototype ✅)

As a **plant keeper** I want suggestions that fit the zone.

Acceptance criteria:

- Request: target zone, number, exclusion (stock and existing candidates are excluded automatically).
- The keeper's AI client delivers drafts via US-KI-05 (path A) or a task (US-KI-08) where the botanical light demand **fits** the zone (not merely tolerates it), with a short reasoning (CAM, origin, leaf morphology).
- Image and image source are checked for reachability and license, not guessed; images are saved with source.
- Suggestions appear as a draft; the keeper accepts or discards them one by one.

### US-WUN-05 · Get from purchase to plant · ⬜ (prototype 🟡)

As a **plant keeper** I want as few steps as possible from purchase to specimen.

Acceptance criteria:

- After "Bought", creating a specimen opens with the species preselected (from the catalog; if it is missing, US-BES-01 starts with the name).
- The wishlist entry is linked to the specimen ("bought → specimen").
- Price and purchase date go, if recorded, to the finances/cost view (US-EQU-09); if they are missing, nothing is invented.
- `Discarded` can be set by an action.

## Data model

### DM-WUN-01 Wish

`Name`, `German`, `Species?` (reference into the catalog), `Target_Light_Zone`, `Difficulty` (number 1–3), `Reasoning`, `Image`, `Image_Source`, `License`, `Type` (`Plant` | `Equipment`), `Status` (`Wishlist` | `Bought` | `Discarded`), `Specimen?` (reference after purchase), `Source` and `Decided_At` (DM-ENT-02).

New wishes also arise via yes/no in Discover (`17-Discover.md`); `Discarded` is a decision of its own there and a learning signal (US-ENT-05).

## Requirements

| ID        | Requirement                                                                                                                                                                                   | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-WUN-01 | Wishes have a fixed format per DM-WUN-01.                                                                                                                                                     | ⬜     |
| FR-WUN-02 | Only `Status = Wishlist` counts as "open".                                                                                                                                                    | ⬜     |
| FR-WUN-03 | The target zone must be a zone 2–4 of the account, otherwise the wish is not considered in counting and buffer and appears in "Hints" (P-10).                                                 | ⬜     |
| FR-WUN-04 | `Difficulty` is the same number 1–3 everywhere (solves B-05).                                                                                                                                 | ⬜     |
| FR-WUN-05 | Wishlist and Pokédex are **linked**: a wish with a species shows whether the species is still missing (new compared to the prototype, solves B-09).                                          | ⬜     |
| FR-WUN-06 | Duplicate names are rejected on creation; status changes address via id.                                                                                                                      | ⬜     |
| FR-WUN-07 | The wishlist is private. Visible only through sharing by the keeper; swap offers from friends that concern a wished species appear as a hint (US-SOZ-09), without disclosing the list.       | ⬜     |
