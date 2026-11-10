# MCP gap matrix: app capabilities vs. AI client tools (2026-11-02)

Purpose: the owner wants every function of the app to be usable by the keeper's AI client through the MCP endpoint, not only through browser automation. This record lists what the app offers today (web destinations and API routes on `dev` at commit `79aaaaa4`), what the MCP endpoint offers, and the gap. It is the evidence for the stories US-KI-11 to US-KI-17 and FR-KI-14 to FR-KI-23 in `docs/specs/product/12-ai-assistant.md`.

Method: API routes extracted from the route registrations in `app/packages/api/src` (no test files); MCP tools from `app/packages/api/src/ai/mcp/tools/`; operation classes from `app/packages/core/src/ai/rights.ts` (FR-KI-12); web destinations from the router (`/today`, `/collection`, `/discover`, `/pokedex`, `/friends`, `/settings`, `/account`). Trigger: a real migration attempt from the owner's Obsidian vault with Claude Code over MCP on the test environment.

## Findings of the migration attempt

| #   | Finding                                                                                                                                                                  | Consequence in the spec                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | The client cannot list species, specimens, measurements, locations, light zones or equipment; it proposed a species that already existed and got "already exists".       | Read tools per area with search by name (US-KI-11, US-KI-12)   |
| 2   | No write tools for specimens, measurements, care events, treatments, equipment; no deletion.                                                                             | Write tools (US-KI-14, US-KI-15), confirmation flow (US-KI-16) |
| 3   | The client cannot resolve internal IDs (e.g. the target light zone of a wish needs an internal id).                                                                      | Name resolution on every reference (FR-KI-15)                  |
| 4   | Catalog naming rules (no varieties outside quotes, no "sp.", no hybrid sign) are discoverable only through error texts (`catalog.name_addition`, `catalog.name_hybrid`). | Rule discovery (US-KI-13, FR-KI-17)                            |
| 5   | The growth measures of a species are `height`, `rosette_diameter`, `shoot_length`; the vault also measures leaf length.                                                  | FR-BES-22 (`leaf_length`)                                      |
| 6   | A migration is run several times; the client needs to know what a run would change and must not create duplicates on a re-run.                                           | Import with natural keys and dry run (US-KI-17)                |

## Current MCP tools (11)

| Tool                         | Operation (class, FR-KI-12)                                                 | Right needed   |
| ---------------------------- | --------------------------------------------------------------------------- | -------------- |
| `get_session`                | `session` (read)                                                            | read           |
| `get_status`                 | `status` (read)                                                             | read           |
| `list_tasks`                 | `list_tasks` (read)                                                         | read           |
| `claim_task`                 | `claim_task` (draft)                                                        | drafts         |
| `decline_task`               | `decline_task` (draft)                                                      | drafts         |
| `list_draft_types`           | `draft_types` (read)                                                        | read           |
| `propose_draft`              | `propose_draft` (draft): species, wish, photo_assessment, discover_decision | drafts         |
| `get_discover_suggestions`   | `discover_suggestions` (read)                                               | read           |
| `decide_discover_suggestion` | `discover_draft` (draft) / `discover_decide` (write)                        | drafts / write |
| `check_image_source`         | `check_image_source` (read)                                                 | read           |
| `get_measurement_photo`      | `measurement_photo` (read)                                                  | read           |

## Gap matrix

Legend: ✅ available via MCP · 🟨 partly (only as a draft, or only a derived summary) · ❌ missing · — not applicable · 🔒 human-only by decision (FR-KI-10, FR-KI-22). "Target" names the slice that closes the gap (S1 to S7, see the issues linked from the stories) and the class the operation gets.

### Catalog and collection (BES, LIC, PHA)

| Capability (app route)                                                       | Read via MCP | Write via MCP | Delete / destructive | Target                                 |
| ---------------------------------------------------------------------------- | ------------ | ------------- | -------------------- | -------------------------------------- |
| Search species in the catalog by name (`GET /species?q=`)                    | ❌           | —             | —                    | S1 read                                |
| Species profile (`GET /species/:id`)                                         | ❌           | —             | —                    | S1 read                                |
| Propose a species (`POST /species`)                                          | —            | 🟨 draft      | —                    | stays draft (KI-R3); S7 import         |
| Catalog corrections, history, gaps (`/catalog/*`)                            | ❌           | ❌            | —                    | S2 read; S5 propose correction (draft) |
| Review and merge of proposals (`/review/*`)                                  | 🔒           | 🔒            | 🔒                   | operator connection only (FR-KI-09)    |
| List specimens, archived specimens, cards, count (`GET /specimens*`)         | ❌           | —             | —                    | S1 read                                |
| Specimen detail (`GET /specimens/:id`)                                       | ❌           | —             | —                    | S1 read                                |
| Create specimen or cutting (`POST /specimens`)                               | —            | ❌            | —                    | S4 write                               |
| Marker, catch date, location, light zone, repot (`POST /specimens/:id/…`)    | —            | ❌            | —                    | S4 write                               |
| Archive specimen (`POST /specimens/:id/archive`)                             | —            | —             | ❌                   | S6 confirm                             |
| Restore specimen (`POST /specimens/:id/restore`)                             | —            | ❌            | —                    | S4 write                               |
| Difficulty comparison, distribution, light overview, hints                   | ❌           | —             | —                    | S2 read                                |
| Care profile per species (`GET`/`PUT /care-profiles`)                        | ❌           | ❌            | —                    | S2 read; S5 write                      |
| Locations (`GET`/`POST`/`PUT /locations`, defaults)                          | ❌           | ❌            | ❌ (`DELETE`)        | S1 read; S5 write; S6 confirm          |
| Light zones (`GET`/`POST`/`PUT /light-zones`, defaults, derivation)          | ❌           | ❌            | ❌ (`DELETE`)        | S1 read; S5 write; S6 confirm          |
| Care phases and relocation (`GET /care-phases`, `POST /care-phases/confirm`) | ❌           | ❌            | —                    | S2 read; S4 write                      |

### Growth, treatments, care events (WAC, BEH, MON)

| Capability (app route)                                                | Read via MCP    | Write via MCP | Delete / destructive | Target                              |
| --------------------------------------------------------------------- | --------------- | ------------- | -------------------- | ----------------------------------- |
| Measurement series of a specimen (`GET /specimens/:id/measurements`)  | ❌              | —             | —                    | S1 read                             |
| Record a measurement (`POST /specimens/:id/measurements`)             | —               | ❌            | —                    | S4 write                            |
| Measurement photo upload (`POST …/measurements/photo`)                | —               | ❌            | —                    | S4 write (photo by URL, assumption) |
| Measurement photo (`GET …/photo`)                                     | ✅              | —             | —                    | —                                   |
| Photo assessment                                                      | —               | 🟨 draft      | —                    | stays draft (KI-R3)                 |
| Open treatments, history (`GET /treatments*`)                         | ❌              | —             | —                    | S2 read                             |
| Plan a treatment (`POST /treatments`)                                 | —               | ❌            | —                    | S4 write                            |
| Tick off a treatment (`POST /treatments/:id/complete`)                | —               | ❌            | —                    | S4 write                            |
| Watering due, record watering (`GET /watering/due`, `POST /watering`) | ❌              | ❌            | —                    | S2 read; S4 write                   |
| Today list (`GET /today`)                                             | 🟨 `get_status` | —             | —                    | —                                   |
| Reminders and settings (`/reminders*`)                                | ❌              | ❌            | —                    | S2 read; S5 write (settings)        |
| Push subscriptions (`/reminders/subscriptions`)                       | 🔒              | 🔒            | 🔒                   | device-bound, human-only            |

### Wishlist, Discover, Pokédex, achievements (WUN, ENT, POK, ACH)

| Capability (app route)                                                    | Read via MCP | Write via MCP                     | Delete / destructive | Target                                                           |
| ------------------------------------------------------------------------- | ------------ | --------------------------------- | -------------------- | ---------------------------------------------------------------- |
| Wish candidates, bought, discarded (`GET /wishes/*`)                      | ❌           | —                                 | —                    | S2 read                                                          |
| Create a wish (`POST /wishes`)                                            | —            | 🟨 draft (zone needs internal id) | —                    | S5 write (with name resolution)                                  |
| Rename, image, buy, wish to specimen (`POST /wishes/:id/…`)               | —            | ❌                                | —                    | S5 write                                                         |
| Discard a wish, remove a duplicate                                        | —            | —                                 | ❌                   | S6 confirm                                                       |
| Wish visible to friends (`POST /wishes/:id/visibility`)                   | 🔒           | 🔒                                | —                    | sharing, human-only (FR-KI-10)                                   |
| Discover deck and decision                                                | ✅           | ✅ (draft or write)               | —                    | —                                                                |
| Pokédex cards, ownership, seen (`/pokedex/*`)                             | ❌           | ❌ (`seen`)                       | —                    | S2 read; `seen` is a UI marker, not released                     |
| Achievements, growth records, settings, rhythm pauses (`/achievements/*`) | ❌           | ❌                                | ❌ (pause)           | S2 read; S5 write (add and remove a pause); calm mode human-only |

### Equipment (EQU)

| Capability (app route)                                                                               | Read via MCP | Write via MCP | Delete / destructive | Target                                  |
| ---------------------------------------------------------------------------------------------------- | ------------ | ------------- | -------------------- | --------------------------------------- |
| Equipment list, lamps, sensors, agents, zones, needs, checks due (`GET /equipment*`)                 | ❌           | —             | —                    | S2 read                                 |
| Record equipment (`POST /equipment`)                                                                 | —            | ❌            | —                    | S5 write                                |
| Status, zone, lamp data, light measurements, maintenance, checked, supply, sensor target, agent link | —            | ❌            | —                    | S5 write                                |
| Equipment wishes, buy, discard (`/equipment/wishes*`)                                                | ❌           | ❌            | ❌ (discard)         | S2 read; S5 write; S6 confirm           |
| Recommendations (`GET /equipment/recommendations`)                                                   | 🔒           | —             | —                    | partner data, never released (FR-KI-10) |
| Equipment sharing, friends' equipment                                                                | 🔒           | 🔒            | —                    | sharing / friends' data (FR-KI-10)      |

### Social and account (SOZ, TAU, ACC, ONB, KI)

| Capability (app route)                                                   | Read via MCP                                | Write via MCP | Delete / destructive | Target                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------- | ------------- | -------------------- | ------------------------------------------------------- |
| Friends, requests, invitations, end friendship                           | 🔒                                          | 🔒            | 🔒                   | FR-KI-10                                                |
| Feed, friends' collection, shared items                                  | 🔒                                          | 🔒            | —                    | friends' data, FR-KI-10                                 |
| Sharing settings (`/sharing/*`)                                          | 🔒                                          | 🔒            | —                    | FR-KI-10                                                |
| Offers, swaps, handover, match deck (`/offers`, `/swaps`, `/exchange/*`) | 🔒                                          | 🔒            | 🔒                   | FR-KI-10 (own offers: open question kept)               |
| Profile (`GET`/`PUT /profile`)                                           | 🟨 time zone via `get_session` (assumption) | 🔒            | —                    | S2 read (time zone, display name); writing human-only   |
| Export, deletion of the account (`/account/export`, `/account/deletion`) | 🔒                                          | 🔒            | 🔒                   | FR-KI-10                                                |
| Connections and rights (`/ai/connections*`)                              | 🔒                                          | 🔒            | 🔒                   | FR-KI-10                                                |
| Own AI log and drafts (`/ai/log`, `/ai/drafts`)                          | ❌                                          | —             | —                    | S2 read (own connection's entries)                      |
| Onboarding style, hints, unlocks (`/onboarding/*`)                       | ❌                                          | 🔒            | —                    | S2 read (unlock state); writing is UI state, human-only |
| Operator functions (`/operator/*`, invitations, registration, cost)      | 🔒                                          | 🔒            | 🔒                   | operator connection only (FR-KI-09)                     |

### Missing in the app itself (not an MCP gap)

The app has no "delete" for a measurement, a treatment or a specimen (only archive); FR-KI-14 releases the app's functions, it does not add new ones. Deleting what a connection wrote by mistake is covered by "undo" (US-KI-10) and by undoing a whole import run (US-KI-16). A real delete for measurements and treatments needs its own story in WAC/BEH first (no spec entry, no code).

## Summary

- Reads: 2 of about 20 readable areas are reachable (status, Discover deck) plus one photo. Every other area is a gap (S1, S2).
- Writes: 0 direct writes except a Discover decision; 4 content types as drafts. About 30 app write operations are missing (S4, S5).
- Destructive: 0 of 7 (archive specimen, delete location, delete light zone, discard wish, remove duplicate wish, discard equipment wish, undo import run) (S6).
- Rule discovery: none (S3). Import helpers: none (S7).
- Update 2026-11-06: S3 is done (US-KI-13): the tools `describe_rules` and `check_species_name` (`GET /mcp/rules`, `GET /mcp/rules/species-name`).
