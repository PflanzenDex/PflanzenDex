# 07 – Epic WUN: Wishlist and Acquisition Planning

Goal: new plants are acquired where the light system has room, and the candidate list does not run empty unnoticed.

Prototype reference: epic WUN. Differences: a purchase leads, guided, to the plant (solves B-09), images are saved locally instead of hotlinked, equipment candidates are added (epic EQU).

## User stories

### US-WUN-01 · See candidates prioritized by space need · 🟨 (prototype ✅)

Acceptance criteria:

- Open candidates (`Status: Wishlist`) are shown, sorted ascending by the stock of the respective target light zone (specimen count, zones 2–4; unknown zone last).
- Per candidate: photo with source, "German (name)", target zone with current stock ("— N plants"), difficulty, reasoning, actions.
- Without open candidates: "No open candidates in the wishlist."

State of implementation: partly done. The tab "Wunschliste" (`GET /wishes/candidates`) lists the open plant wishes (`status = wishlist`) sorted ascending by the specimen count of the target light zone (the same count as the light distribution, US-LIC-02: zones 2–4, `isActive`; ties by zone order, then name); a wish without a zone 2–4 comes last and says so. Each card shows the picture address as an explicit link "Bild ansehen (öffnet extern)" with its source next to it, "German (name)", "zone — N plants", difficulty (Easy/Medium/Hard), reasoning and why it stands there; the list says what to do next (P-09). Unknown values read "unbekannt" (P-08); nothing is compared with an average. A wish is recorded through the validating operation `wish.create` (name required, case-insensitive unique per account, picture only with source, zone only of the own account). Privacy decision: the picture itself is **not** displayed, because loading a keeper-typed address would make every viewer's browser contact a third-party host (IP address, user agent, referrer; P-05) and the epic wants images saved locally instead of hotlinked; only an https address without credentials is accepted and it is only ever a link the viewer follows on purpose (`rel="noopener noreferrer"`, no referrer). A wish whose target zone is not among zones 2–4 (for example cutting light) is kept, does not count and says so (FR-WUN-03); the hint list for such wishes does not exist yet. Missing: displaying the picture (needs local storage, US-WUN-04), the per-candidate action "discarded" (US-WUN-05; "bought" exists since US-WUN-03); the species link, the specimen link and the discover source of DM-WUN-01 follow with their stories.

Known limit of FR-WUN-06 (migration 0020): names are unique per account after folding diacritics, letter case and white space. Wishes that existed before the migration and collide only after folding are kept unchanged (nothing is deleted or renamed, P-10), but are exempt from the new rule (`name_key is null`) and stay duplicates until they are repaired; the migration only reports them as a warning in its output. They can be found per account with `select account_id, id, name from wish where name_key is null order by account_id, created_at`. A hint and a repair in the app are not built yet.

### US-WUN-02 · Be warned before the list is empty · ⬜ (prototype ✅)

Acceptance criteria:

- Per zone 2–4 there should be at least **2** open candidates (buffer, adjustable).
- If a zone falls below the buffer, a warning appears "Replenishment needed: <zone> (N open candidates)" with the actions "Discover for <zone>" (US-ENT-07) and "Fetch suggestions" (US-WUN-04).
- The warning can come as a reminder (US-MON-01).

### US-WUN-03 · Record a purchase · 🟨 (prototype ✅)

Acceptance criteria:

- "Bought" sets `Status: Bought` and hides the candidate from the list, but it stays in the history.
- The guided path to the plant follows (US-WUN-05).

State of implementation: partly done (the second criterion, the guided path to the plant, comes with US-WUN-05). Every open candidate has the action "Gekauft". It runs the validating operation `wish.buy` (owner only, `Idempotency-Key`), which sets an open wish (`Status: Wishlist`) to `Bought` in one step; the wish leaves the candidate list (FR-WUN-02) but is never deleted and appears in the history, the section "Gekauft" below the list (bought wishes by name; readable on its own, without the page). The confirmation says what happened and what to do next: create the plant as a specimen (P-09, P-10). Decisions: buying a wish that is already bought changes nothing and answers with "already bought" instead of an error (idempotent, also for two calls at the same moment); only an open wish can be bought, a discarded wish is refused (`wish.not_open`) and stays discarded; a wish of another account is answered exactly like an unknown one (`wish.not_found`, P-04). The guided path from the purchase to the specimen (species preselected, wish linked to the specimen, purchase date and price) is US-WUN-05; until then the next action names the specimen in words only and links nowhere. Not built: undoing "Bought" (resetting the status belongs to US-WUN-05 and US-ENT-04) and a purchase date (no date is invented, P-08; it comes with US-WUN-05).

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

| ID        | Requirement                                                                                                                                                                            | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-WUN-01 | Wishes have a fixed format per DM-WUN-01.                                                                                                                                              | ⬜     |
| FR-WUN-02 | Only `Status = Wishlist` counts as "open".                                                                                                                                             | ⬜     |
| FR-WUN-03 | The target zone must be a zone 2–4 of the account, otherwise the wish is not considered in counting and buffer and appears in "Hints" (P-10).                                          | ⬜     |
| FR-WUN-04 | `Difficulty` is the same number 1–3 everywhere (solves B-05).                                                                                                                          | ⬜     |
| FR-WUN-05 | Wishlist and Pokédex are **linked**: a wish with a species shows whether the species is still missing (new compared to the prototype, solves B-09).                                    | ⬜     |
| FR-WUN-06 | Duplicate names are rejected on creation, regardless of letter case and diacritics ("Café" equals "Cafe"); status changes address via id.                                              | ⬜     |
| FR-WUN-07 | The wishlist is private. Visible only through sharing by the keeper; swap offers from friends that concern a wished species appear as a hint (US-SOZ-09), without disclosing the list. | ⬜     |
