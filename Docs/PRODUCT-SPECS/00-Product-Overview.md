# 00 – Product Overview

## Vision

PflanzenDex is the web app for plant collectors: it says what to do today, measures success against your own data, rewards collecting and connects collectors with each other, so that new acquisitions become visible and cuttings change hands cleanly.

The prototype (Obsidian vault) tried out the care and collecting logic. Three people use it or want to use it. The web app turns it into a product without the Obsidian hurdle, with accounts, mobile access and social features.

## Target group

Plant collectors with more than about 10 plants who care seriously, grow cuttings, collect and swap: cacti, succulents, Hoya, Philodendron, begonias and similar, often under grow lights. Beginners who only want to be reminded to water are not the target group (see `13-Business-Case.md`).

Start users: the three people from the prototype circle.

## Value proposition

1. **Says what to do.** Change location, treatment due, measurement overdue, lamp level does not fit. Not just watering.
2. **Measures against your own history.** Growth trend against your own average, etiolation never counts as success.
3. **Rewards collecting.** Pokédex with rank, milestones and "N more until …".
4. **Connects.** New among friends, swap exchange, provenance of every plant.
5. **AI as an entry point.** Care by voice and photo, profiles and research on request, without the AI calculating or writing data freely.

## Actors

| Actor            | Role                                                                                                                                                                                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plant keeper** | User with an account. Looks after the collection, measures, wishes, swaps.                                                                                                                                                                                                                                 |
| **Friend**       | Another plant keeper with a confirmed friendship. Sees only what is shared.                                                                                                                                                                                                                                |
| **Operator**     | Whoever runs the app: hosting, catalog maintenance, partner programs, moderation.                                                                                                                                                                                                                          |
| **AI client**    | The keeper's AI assistant (any provider), connected via the open interface. Takes free text and photos, makes suggestions, researches. Calls only approved, validating operations; results are drafts. The app does not run any AI itself.                                                                 |
| **System**       | Background jobs: reminders, catalog enrichment, photo processing, sensor evaluation.                                                                                                                                                                                                                       |

## Product principles

From the principles of the prototype and the target architecture sketch. They apply to all epics.

| ID   | Principle                                                                                                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | **The AI judges, the code computes and writes.** Phases, rates, counts, naming rule, validation are deterministic, tested logic. The model is never used as a calculator.                           |
| P-02 | **One core, many interfaces.** Web, AI client, notifications and later clients use the same domain logic. No copy of the phase logic (in the prototype finding B-02).                               |
| P-03 | **Writes only through validating operations.** The AI too may not write anything outside the schema. Invalid input is rejected, not corrected.                                                       |
| P-04 | **Multi-tenant from the start.** Every user-related row belongs to an account; user A never sees data of user B without sharing.                                                                    |
| P-05 | **Private by default.** Nothing leaves the account without explicit sharing.                                                                                                                        |
| P-06 | **Specs are executable.** Acceptance criteria become tests.                                                                                                                                         |
| P-07 | **The human delivers only what only the human can deliver:** location changed, measured number, quality judgment, purchase decision. The system computes everything derivable.                      |
| P-08 | **No invented numbers.** Comparison only against your own history or citable sources. Unknown means "unknown".                                                                                      |
| P-09 | **Every view says what to do.** Data without an instruction for action is not a goal.                                                                                                               |
| P-10 | **Nothing disappears silently.** Incomplete data is reported, not hidden.                                                                                                                           |
| P-11 | **Mobile first.** Photo, measuring, watering and moving happen next to the plant, not at the desk.                                                                                                  |

## Domain model

Technology-neutral. Every entity belongs to an account, except the species catalog.

| Entity                       | Meaning                                                                                                          | Epic     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| **Account / profile**        | Person, display name, settings, time zone                                                                        | ACC      |
| **Species** (catalog)        | Knowledge about a plant species, shared by all users, with provenance and review status                          | BES, POK |
| **Specimen**                 | One pot of a species owned by a keeper                                                                           | BES      |
| **Care profile**             | Account-specific deviations from the catalog values of a species (target locations, zone, dormancy, watering intervals) | BES |
| **Location**                 | Named place of the keeper (cabinet 2, south windowsill), assigned to a light zone                                | LIC      |
| **Light zone**               | Light level with lux ceiling and position; default four levels, adjustable                                       | LIC      |
| **Measurement**              | Time, value, quality, note, photo on a specimen                                                                  | WAC      |
| **Treatment**                | Planned or completed measure on a specimen                                                                       | BEH      |
| **Wish**                     | Purchase candidate (plant or equipment)                                                                          | WUN, EQU |
| **Equipment**                | Device or consumable                                                                                             | EQU      |
| **Sensor, measurement series** | Device with measured values and aggregates                                                                     | MON      |
| **Friendship, sharing**      | Relationship and visibility                                                                                      | SOZ      |
| **Offer, swap**              | Offering, requesting, handover                                                                                   | SOZ      |
| **Event**                    | Derived feed entries                                                                                             | SOZ      |
| **Reminder**                 | Due occasion with channel and state                                                                              | MON      |

**Most important modeling decisions compared to the prototype:**

- **The species catalog is shared**, not per user. The prototype maintains 13 species notes alone; many users should not each create that anew. Personal deviations (target locations, light zone, dormancy) live in the user's **care profile** (DM-BES-04) or on the specimen (E-02, decided).
- **Locations and light zones are entities**, not texts. That ends the exact text match (FR-PHA-03) and the hard-coded lamp strings (B-07).
- **`Difficulty` is a number 1–3** with a display text (solves B-05).
- **Times are in the user's time zone** (solves B-01).

## Glossary

| Term                      | Meaning                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Species / specimen        | Species = knowledge (1× in the catalog), specimen = one pot of a keeper.                                                                                                                                                             |
| Care phase                | Growth phase or dormancy phase, computed from the calendar and the species period.                                                                                                                                                   |
| Cutting                   | Specimen in the status cutting: not yet potted, cutting light, excluded from the phase tracker.                                                                                                                                      |
| Etiolation                | Elongation caused by lack of light: length, but thin and pale. Does not count as success.                                                                                                                                            |
| Marker                    | Distinguishes several specimens of the same species (in the prototype the color of a clothespin).                                                                                                                                    |
| Light zone                | Level with a defined light intensity (lamp 1 to 4 in the prototype).                                                                                                                                                                 |
| Buffer                    | Minimum number of open wish candidates per light zone.                                                                                                                                                                               |
| Caught                    | Species is owned in the Pokédex: the keeper has an active specimen.                                                                                                                                                                  |
| Species-poor              | Genus with at most 10 species according to GBIF; badge on the card.                                                                                                                                                                  |
| Sharing setting           | Visibility for friends, set per specimen.                                                                                                                                                                                            |
| Swap                      | Request → acceptance → handover confirmed by both sides; ownership changes.                                                                                                                                                          |
| Provenance                | Note of who a specimen came from and when.                                                                                                                                                                                           |
| Need                      | Gap derived from your own data (lamp missing, supply empty), basis for recommendations.                                                                                                                                              |
| Suggestion / deck         | Species from the catalog that Discover offers as a card (yes/no/later); a deck is a limited sequence of them (epic ENT). Not to be confused with an equipment recommendation.                                                       |
| AI client / connection    | The keeper's AI assistant and its approval with the rights `read`, `create drafts`, `write` (epic KI).                                                                                                                              |
| Task (AI)                 | Task triggered from the app that the connected AI client picks up and answers as a draft (US-KI-08).                                                                                                                                 |
| Draft                     | AI result that counts only after the keeper's review (US-KI-09).                                                                                                                                                                     |
| Care profile              | Account-specific deviations from the catalog values of a species; private (DM-BES-04).                                                                                                                                               |
| Proposal (catalog)        | Species proposed by a user, visible only to them until a reviewer approves it (US-BES-10). Not to be confused with a suggestion in Discover.                                                                                         |
| Thriving                  | Active specimen with ≥ 2 measurements, overall rate > 0 and last quality `Healthy`; basis for suggestions (epic ENT).                                                                                                                |
| Module                    | Domain-cut part of the one deployable with its own public interface, own tables and allowed dependencies (E-20, ADR 0003). Not to be confused with an epic: a module can carry several epics.                                       |
| Port                      | Interface defined by the owning module through which another module supplies or queries data, instead of touching its tables or code (e.g. `ZoneUsage`, LIC-05).                                                                    |
