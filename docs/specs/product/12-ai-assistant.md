# 12 – Epic KI: AI Access (the Keeper's AI Client)

Goal: the app has **no built-in AI and no provider contract**. It offers an open, authenticated interface through which the **AI client the keeper uses themselves** (any provider) can call the operations of the domain logic. From within the app the keeper can place **tasks** with this client. Content results come back as a **draft**. **The AI judges, the code computes and writes** (P-01, P-03).

Prototype reference: in the prototype Claude in Claude Code assisted: species notes from the prompt template, wishlist research, photo assessment, scripts. Here these capabilities become accessible via the interface, without the app running an AI service. New are care by voice, daily status on request, tasks and drafts.

Technology (protocol, sign-in method, hosting of the interface) is a decision in `16-Releases-and-Decisions.md` (E-04, E-19), not here.

## Access paths

| Path                         | How                                                                                                                                                                                                                                                              | State                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **A · The client drives**    | The keeper works in their AI client; the client calls the approved operations (US-KI-01, -02, -03, -04, -05).                                                                                                                                                    | Part of the product         |
| **B · Task from the app**    | An action in the app ("research species profile", "fetch suggestions for zone", "assess photo") creates a **task**. The connected client picks it up and delivers a **draft** (US-KI-08, -09). Asynchronous, effective only when the keeper's client is running. | Part of the product         |
| C · Built-in chat in the app | Chat with the keeper's own key (BYOK) via a provider-neutral adapter.                                                                                                                                                                                            | **not part**, decision E-19 |

## Ground rules

| ID     | Rule                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| KI-R1  | **Operations instead of free writing:** the AI client calls only validating operations (`set_location`, `record_measurement`, `plan_treatment`, `watered`, `status`, `validate`, …). Invalid input is rejected and nothing is written.                                                                                                                                                                        |
| KI-R2  | **The code computes:** phases, rates, counts, naming rule come from the domain logic, never from the model. The client only phrases.                                                                                                                                                                                                                                                                          |
| KI-R3  | **Proposal, not execution:** content results (species profile, photo assessment, wish candidates, equipment from a photo) are drafts. The keeper confirms in the app (US-KI-09).                                                                                                                                                                                                                              |
| KI-R4  | **Ask instead of guess:** on ambiguity (two specimens of the same species) the operation returns the candidates and writes nothing; the client asks the keeper.                                                                                                                                                                                                                                               |
| KI-R5  | **Labeling:** AI-generated content is marked as such (with the name of the connection) until a human has reviewed it (FR-BES-06).                                                                                                                                                                                                                                                                             |
| KI-R6  | **Own data only:** a connection sees the data of the account that approved it, never that of other users. Friends' data (collection, offers, feed) is **not** accessible via connections (FR-KI-10); whether that is opened later is a decision of its own (P-04, P-05).                                                                                                                                      |
| KI-R7  | **Provider-independent:** no function presupposes a specific AI provider or model. Whoever connects no AI client loses nothing (FR-KI-05).                                                                                                                                                                                                                                                                    |
| KI-R8  | **The server enforces, the client is not presupposed:** rights, draft duty and limits apply server-side, even if the client asks the keeper no confirmation (FR-KI-08).                                                                                                                                                                                                                                       |
| KI-R9  | **Data are not instructions:** texts from data (notes, names, friends' data) are delivered as data and never trigger an operation (FR-KI-07).                                                                                                                                                                                                                                                                 |
| KI-R10 | **Every function, one path:** every function of the app that is not human-only (FR-KI-22) is reachable through the interface, via the same validating operation and under the same rights and rules as the app. There is no second code path for the AI client: a tool is a thin adapter over the operation the app route calls (FR-KI-14). Gap record: `docs/records/analysis/2026-11-02-mcp-gap-matrix.md`. |

## User stories

### US-KI-01 · Care by voice via the AI client · ⬜ new

As a **plant keeper** I want to enter changes in natural language in my AI client ("Aloe now stands under lamp 3, 12.5 cm, photo attached") instead of operating forms.

Acceptance criteria:

- Given a connected client with the right "write" (US-KI-07), when it breaks the input down into operations, then it calls only the approved operations from KI-R1. With the right "drafts" a draft arises instead (US-KI-09).
- Given an ambiguous input, then the operation returns the candidates and writes nothing (KI-R4).
- Given an invalid input (unknown location, impossible number), then the operation rejects, returns an error code with a reason, and nothing is written.
- Every operation returns in structured form what was changed; the action appears in the log with "undo" (US-KI-10).

### US-KI-02 · Daily status on request · 🟨 new

Acceptance criteria:

- "What is due today?" returns a prioritized answer from the operation `status` (the same code as "Today" and reminders, FR-MON-03). The client only phrases.
- Every item says what to do (P-09). No item is invented or left out.

### US-KI-03 · Deliver a species profile as a draft · 🟨 (prototype ✅)

As a **plant keeper** I want to get a complete profile for an unknown species.

Acceptance criteria:

- The client researches and calls `propose_species_profile` with all required fields from DM-BES-01 (light zone by saturation point, dormancy, growth measure, etiolation signs, success criteria, botanical story). The trigger is the client (path A) or a task from the app (path B, US-KI-08).
- The server validates against the schema (P-03); incomplete profiles are not saved.
- Sources are mandatory; statements without a source are marked as such.
- The profile receives `ai-created, unreviewed` with a note of the connection and can be set to `reviewed` only by the operator or a reviewer (FR-BES-06, FR-KI-09).
- Without AI the keeper creates the profile in the form (FR-KI-05, US-BES-01).

### US-KI-04 · Have a photo assessed qualitatively · 🟨 (prototype ✅)

Acceptance criteria:

- An operation delivers the cleaned photo of the measurement to the client (only photos of the own account). The client suggests `quality` and a short note as a draft (US-WAC-06, US-KI-09). The keeper accepts or discards the draft; there is no step to change it (owner decision 2026-11-10). Accepting stores `Assessed_By: AI suggestion accepted`.
- Only what is visible is assessed; no estimation of height, substrate moisture or roots. If the basis is missing, the note stays empty. This is an instruction to the client in the descriptions of the tool and of the draft, not a check of the code.
- A client with image understanding is a precondition. Without it the keeper assesses themselves (US-WAC-02).

State of implementation: built ahead of its release R4 (`16`). The tool `get_measurement_photo` (`research-tools.ts`, route `/mcp/measurements/:id/photo`, `aiMeasurementPhoto` in core `ai/results/photo.ts`) hands the cleaned photo of a measurement of the own account to a client with the read right and logs the call without content; a foreign or unknown measurement looks like a missing one (P-04). The client delivers a draft of type `photo_assessment` (measurement id, `quality`, note; `draft-content.ts`). "Übernehmen" in the inbox "Entwürfe" runs `measurement.assess` with the AI flag (`draft-types.ts`, `assess.ts`): quality and note are set, the value stays, `Assessed_By` becomes `AI suggestion accepted` (`ai_adopted` in the code); a measurement without a photo, a foreign one or an archived specimen is refused and nothing is written. "Verwerfen" writes nothing. The task type `photo_assessment` ("Foto beurteilen", reference: measurement id) asks the client for it (US-KI-08). The visible-only rule stands in the descriptions of the tool and of the draft ("Judge only what is visible."); nothing enforces or tests it. Tests: `assess.test.ts`, `measurements.test.ts` (db), `access.test.ts`, `mcp-routes.test.ts`. The status stays 🟨. **Missing:** a run with a real client with image understanding (E-04; the tests use a fake client) and the entry point in the measure view (US-WAC-06).

### US-KI-05 · Research via the AI client (wishlist, equipment, catalog) · 🟨 (prototype ✅)

Acceptance criteria:

- Wish candidates per US-WUN-04, equipment suggestions per FR-EQU-09 and suggestions from the catalog per US-ENT-08 (operation `suggestions`, no assessment of its own) arrive as drafts. The trigger is the client (path A) or a task (path B).
- Species attributes for Discover (DM-ENT-01) are delivered by the client only with a source and as `ai-created, unreviewed` (FR-BES-06).
- Image URLs, sources and licenses are checked by the **server** for reachability and license (operation `check_image_source`); the client cannot claim them as checked.
- Adoption one by one in the app (US-KI-09).

### US-KI-06 · Limits, transparency and privacy · 🟨 new

As an **operator** I want to limit the use of the interface and as a **keeper** to know where my data goes.

Acceptance criteria:

- Calls are measured per connection; there are rate limits per connection and day (starting value assumption, readjustable) with a clear message (error code) when reached (FR-KI-11).
- If the client fails, none is connected or the limit is reached, all forms stay usable (FR-KI-05).
- When connecting, the app states: the chosen AI provider receives the data the client retrieves. The app itself sends nothing to an AI service; the operator has no data processor for it (E-04, NFR-11).
- Fields on toxicity, species protection and plant agents deliver source and date or "unknown", never a factual claim without a source.

### US-KI-07 · Connect the AI client and manage access · 🟨 new

As a **plant keeper** I want to connect my AI client to my account and define exactly what it may do.

Acceptance criteria:

- Connecting uses an established approval procedure (OAuth authorization, E-03/E-04). The consent page of the app names client name, requested rights and what the keeper's AI provider can see as a result (US-KI-06).
- Rights are scopes: `read`, `create drafts`, `write` (ascending, each includes the lower ones). The keeper can deselect rights on the consent page. The default is `create drafts`.
- If a right is not enough for an operation, the server requests the necessary right specifically (step-up) and the keeper confirms again. Never more is allowed silently.
- List "Connected AI clients": name, rights, connected since, last use. Revocation takes effect immediately; a revoked or expired access is rejected.
- A connection belongs to exactly one account (KI-R6). Instructions for connecting (copy link, example flows) are in the app.

### US-KI-08 · Tasks from the app to the AI client · 🟨 new

As a **plant keeper** I want to trigger something in the app that my AI client handles (path B).

Acceptance criteria:

- Actions in the app create a task with type, reference and status `open → in progress → done | declined | expired` (DM-KI-02). Examples: research species profile (US-BES-01), suggestions for zone (US-WUN-02, US-WUN-04), assess photo (US-WAC-06).
- The connected client picks up open tasks via an operation and delivers the result as a draft (US-KI-09). The app shows the status.
- Because a client does not wake up on its own, every task offers "Open in AI client": the app puts a ready-made prompt on the clipboard (or opens the client via a link where it can). The prompt contains task id, type, the instruction in plain text, the name of the reference (e.g. species or zone), the operations the client should call, and the note to deliver the result as a draft. It contains no credentials and no data the client could not retrieve anyway with its rights. The keeper sees the text before copying and does not have to add anything.
- If no client is connected, the app says so and offers the manual path as well as "Copy task as text". No silent task arises that is never processed (P-10).
- Tasks for the same reference and type are merged; repeating is idempotent (US-QS-03). A task expires after 14 days (assumption).

Decided by the PO (assumption): task types are `species_profile` (reference: species name), `wish_candidates` (reference: light zone 2 to 4) and `photo_assessment` (reference: measurement id), each completed by a draft of the matching type (`species`, `wish`, `photo_assessment`). The client delivers a draft with `taskId`; the first draft sets the task to `done`, the same connection may add more (wish candidates). The client may decline a task (`declined`), the keeper may withdraw it (also `declined`); `expired` is derived after 14 days and stays visible. Without a connected client with the right "create drafts" no task is stored (`ai.no_client`); "Copy task as text" then works without storing anything. Open for the keeper: the entry points in the forms of US-BES-01, US-WUN-02/04 and US-WAC-06 (the creation lives in "Konto" so far) and opening the client by a link (no client offers one yet; the clipboard path is built).

### US-KI-09 · Review and adopt drafts · 🟨 new

As a **plant keeper** I want to review every AI result before it counts (KI-R3).

Acceptance criteria:

- Inbox "Drafts" in the app (and in "Hints", P-10): per draft type, reference, source, connection, time and, where there is a previous value, the change compared to the current state.
- Per draft: adopt or discard; there is no step to change a draft (owner decision 2026-11-10: after adopting, the keeper edits the result as usual). Adopting runs through the same validating operation as the form (date local, `Assessed_By: AI suggestion accepted`).
- A draft is never adopted automatically. Unprocessed drafts expire and remain viewable as discarded.

### US-KI-10 · Log of AI actions and undo · 🟨 new

As a **plant keeper** I want to trace and take back what the AI client did.

Acceptance criteria:

- Every operation via a connection is logged: connection, operation, time, effect (DM-KI-04). The log contains no content beyond what is necessary.
- The keeper sees the log and can undo the last action per operation where that is possible in terms of the domain (measurement, location, treatment, watering).
- Operations that are not reversible or concern third parties are not released for connections at all (FR-KI-10).

### Every app function through the AI client (US-KI-11 to US-KI-17)

Trigger: a real migration from the owner's vault with an AI client over the interface (2026-11) failed on gaps: the client could not list what exists (and proposed a species that already existed), could not write specimens, measurements, treatments or equipment, could not resolve internal IDs (the target light zone of a wish) and learned the catalog naming rules only from error texts. The record `docs/records/analysis/2026-11-02-mcp-gap-matrix.md` lists every app capability against the interface. KI-R10 is the rule; the stories come in three tiers: **(a) read** (US-KI-11 to US-KI-13), **(b) write** (US-KI-14, US-KI-15), **(c) destructive, bulk and import** (US-KI-16, US-KI-17).

Decided by the PO (assumption) for the whole block:

- **Classes per operation** (FR-KI-12 gets a fifth class, `confirm`): `read` needs the right "read"; `draft` needs "create drafts"; `write` needs "write" and runs at once because it is reversible and appears in the log with "undo" (US-KI-10); `confirm` needs "write" and runs only after the keeper confirms in the app (US-KI-16); `never` is human-only (FR-KI-22).
- **Content results stay drafts** (KI-R3): species proposals, photo assessments, catalog corrections and research results remain `draft` even with the right "write". Data the keeper already has (specimens, measurements, treatments, locations, equipment) are facts, not content results, so they are `write`.
- **Destructive means:** a function whose effect hides or removes something from the keeper's views (archive, delete, discard, remove duplicate, undo of an import run). These are `confirm`, never `write`.

### US-KI-11 · Read the catalog and the collection by name · ✅ new

As a **plant keeper** I want my AI client to see what already exists in my account, so that it neither creates duplicates nor needs internal IDs from me.

Acceptance criteria:

- Given a connection with the right "read", when the client searches species by a name (Latin name, German name or synonym, at least 2 characters), then it gets the matching species visible to my account (approved ones and my own proposals) with id, Latin name, German name, review status and whether I own a specimen; the same search as the catalog in the app (US-BES-01).
- Given a connection with the right "read", when the client lists my specimens, locations, light zones or the measurements of one specimen, then it gets the same data as the app (active by default, archived on request), paged per FR-KI-16, each item with its id and its readable name (specimen name with marker, location name, zone number and name).
- Given a reference by name instead of id (species "Aloe vera", location "Regal 2", zone "3", specimen "Aloe vera (blau)"), when the client calls a tool that takes the reference, then the server resolves it per FR-KI-15: one hit is used, several hits return the candidates and nothing is done (KI-R4) and say when more match than they list (`more`, without a count); a partial name whose species search was cut does not count as one hit (it is refused as ambiguous with `more` true); no hit returns `not_found` with up to 5 nearest names (starting value).
- Given a species that already exists, when the client proposes it again, then the error names the existing species with its id (`species.duplicate` with the id in the details) so the client can use it instead.
- Tenant isolation (P-04, FR-KI-23): given two accounts A and B, when a connection of A searches, lists or resolves a name, then nothing of B appears, not even B's species proposals or B's location names; an id of B answers `not_found`, never `access.denied` (no existence leak).

### US-KI-12 · Read every other area · ✅ new

As a **plant keeper** I want my AI client to answer questions about every area of my plants, not only "what is due today".

Acceptance criteria:

- Given a connection with the right "read", then read tools exist for: care phases and relocations, treatments (open and history), watering due, reminders and reminder settings, wishes (candidates, bought, discarded), Pokédex cards and ownership, achievements and growth records, equipment (all kinds, needs, checks due, equipment wishes), the own care profiles, the light distribution, difficulty comparison and hints of the collection, catalog gaps and corrections I made, the unlock state of functions, and the entries of the own connection in the AI log and in the drafts inbox.
- Every read tool returns the value the app computes (P-01, KI-R2); derived values (phase, trend, caught, need) are never recomputed by the client, and a value the app does not know reads `unknown` (P-08).
- Free texts (notes, names) are delivered marked as data (FR-KI-07).
- Friends' data, sharing settings, offers and swaps, recommendations and partner data stay unreachable (FR-KI-10); a call for them answers `ai.not_released`.
- Tenant isolation (P-04, FR-KI-23): given two accounts, every read tool of this story has a test that a connection of A sees none of B's rows.

### US-KI-13 · Learn the rules before writing · ✅ new

As an **AI client** I want to read the validation and naming rules up front, so that I write valid input the first time instead of learning the rules from error texts.

Acceptance criteria:

- Given a connection with the right "read", when the client calls the rule discovery, then it gets per area: the input schema of every released operation (fields, types, limits, required fields, enumerations such as growth measures, archive reasons, treatment kinds, qualities), the catalog naming rule in words with examples (genus and species epithet; a cultivar only in single quotes at the end; no `sp.`, `spp.`, `var.` outside the allowed forms, no hybrid sign), the error codes with their meaning, and the class and right of every operation (FR-KI-12).
- The rules come from the same checks the operations run (as the draft schemas do since US-KI-07); a test fails when a rule changes without the description (FR-KI-17). The description carries a version (FR-KI-03).
- Given a name, when the client asks the discovery to check it (dry check without writing), then it gets the normalized name or the same error code the proposal would return (`catalog.name_addition`, `catalog.name_hybrid`, …) with the reason.
- The discovery contains no account data; it is the same for every account.

### US-KI-14 · Keep the collection through the AI client · 🟨 new

As a **plant keeper** I want my AI client to enter what I tell it about my plants (US-KI-01) for every collection function, not only as a draft.

Acceptance criteria:

- Given a connection with the right "write", then these operations are released as `write` and run at once: create a specimen or a cutting (US-BES-02, US-BES-04), give or change a marker (US-BES-03), correct the catch date (US-BES-11), set location or light zone of a specimen (US-PHA-03), pot a cutting or repot (US-BES-04), restore an archived specimen (US-BES-07), record a measurement with value, quality, note and date (US-WAC-01), attach a photo to a measurement (from an image the client sends, assumption, decided by the PO: same limits and processing as the upload, US-WAC-06), confirm a relocation of a care phase (US-PHA-03), record watering (US-MON-05), plan a treatment and tick it off (US-BEH-01, US-BEH-03).
- Given a connection with the right "create drafts" only, when it calls one of these operations, then a draft of the same content arises (US-KI-09) and the server asks for the right "write" by step-up (US-KI-07); nothing is written silently.
- Every call goes through the same validating operation as the form (KI-R10): the same error codes, the same idempotency (`Idempotency-Key`, FR-KI-02), the same local calendar date rules (NFR-08); a test per operation shows that the tool and the app route call the same operation (FR-KI-14).
- Every write returns in structured form what changed (ids, names, before and after) and appears in the log with "undo" (US-KI-10, FR-KI-19).
- Tenant isolation (P-04, FR-KI-23): given two accounts, a connection of A cannot write on B's specimen, location, zone or treatment by id or by name (`not_found`).

### US-KI-15 · Keep the remaining areas through the AI client · ⬜ new

As a **plant keeper** I want my AI client to keep locations, light zones, care profiles, wishes, equipment and reminder settings, so that I can do everything by voice.

Acceptance criteria:

- Given a connection with the right "write", then these operations are released as `write`: create and change a location and a light zone, apply the default zones and locations (US-LIC-05), change the own care profile of a species (US-BES-09), create a wish with the target zone by number or name (US-WUN-01), rename a wish, set its image (by a source checked by the server, US-KI-05), mark it bought and turn it into a specimen (US-WUN-03, US-WUN-05), record equipment and change its status, zone, lamp data, light measurement, maintenance, check, supply, sensor target and agent link (US-EQU-01 to US-EQU-06), create and buy an equipment wish (US-EQU-08), change reminder settings (US-MON-08), add and remove a pause of the care rhythm (US-ACH-04).
- These stay `draft` even with the right "write" (KI-R3): species proposals (US-KI-03), photo assessments (US-KI-04), proposed catalog corrections (US-BES-14) and research results (US-KI-05).
- A wish created through the client without a target zone that can be resolved gets the candidates back (KI-R4); the client never has to know an internal id (FR-KI-15).
- Every operation is the one the app uses (FR-KI-14), logged with "undo" where the domain allows it (US-KI-10).
- Tenant isolation (P-04, FR-KI-23): given two accounts, a connection of A cannot write on any of B's locations, zones, care profiles, wishes or equipment.

### US-KI-16 · Destructive operations need the keeper's confirmation · ⬜ new

As a **plant keeper** I want my AI client to be able to ask for deletions and archiving, but nothing disappears without my confirmation (P-10).

Acceptance criteria:

- The class `confirm` covers: archive a specimen (US-BES-07), delete a location, delete a light zone (US-LIC-05), discard a wish and remove a duplicate wish (US-WUN-02), discard an equipment wish (US-EQU-08), and undo all writes of one import run (US-KI-17).
- Given a connection with the right "write", when it calls a `confirm` operation, then the server validates the request like the operation would (the same checks, e.g. `light_zone.in_use`), writes nothing, stores a confirmation request (DM-KI-05) with a preview of the effect (what disappears from which view, counted), and answers `ai.confirmation_pending` with the request id.
- Given an open confirmation request, then the app shows it in the drafts inbox and in "Hints" with client name, operation, target by name and the preview; the keeper confirms or declines. Only the confirmation runs the operation, as the keeper, through the same operation as the app button.
- Given a request that is not decided within 7 days (starting value, assumption), then it expires and stays viewable as expired; the client can read the state of its requests.
- Given the target changed after the request (e.g. a specimen got a new measurement), when the keeper confirms, then the operation is validated again and the preview is shown anew if the effect differs.
- Given a connection with only "create drafts", then `confirm` operations are refused with a step-up request for "write" (US-KI-07); no request is stored.
- Tenant isolation (P-04, FR-KI-23): a connection of A cannot create, read or decide a confirmation request on B's data; the keeper of A sees only A's requests.

### US-KI-17 · Import my existing data with a re-runnable dry run · ⬜ new

As a **plant keeper** coming from another tool (e.g. a notes vault), I want my AI client to import my plants in batches that I can preview and safely run again.

Acceptance criteria:

- Given a connection with the right "write", when the client sends a batch of items of one kind (locations, light zones, specimens, measurements, treatments, watering events, wishes, equipment) with `dryRun: true`, then nothing is written and the answer lists per item the planned action `create`, `update`, `unchanged` or `refused` with the error code, and the totals.
- Each kind has a natural key (FR-KI-21), e.g. specimen: species and marker; measurement: specimen, date and growth measure. Given an item whose key already exists with the same values, then it is `unchanged`; with different values it is `update` only for fields the app allows to change, otherwise `refused` with the reason. A re-run of the same batch changes nothing (idempotent).
- Given the same batch without `dryRun`, then each item runs through the same validating operation as a single call (FR-KI-14); valid items are written, refused ones are reported, nothing is dropped silently (P-10). All writes of one batch share one import run id (DM-KI-06).
- Species are not created by an import: an unknown species is `refused` with `species.not_found` and the nearest names; the client then proposes it as a draft (KI-R3) and the keeper adopts the drafts in the app (assumption, decided by the PO: the inbox offers "adopt all from this run" after showing them, US-KI-09).
- Given a finished import run, then the keeper sees it in the log with counts per kind and can undo the whole run through a confirmation request (US-KI-16).
- Batch size and daily volume are limited (FR-KI-20); a batch above the limit is refused as a whole with `ai.batch_too_large`.
- Tenant isolation (P-04, FR-KI-23): natural keys are resolved only within the account of the connection; the same key in account B is never matched.

## Data model

### DM-KI-01 Connection

`Account`, `Client_Name`, `Rights` (`read | drafts | write`), `Created_At`, `Last_Use`, `Revoked_At?`.

### DM-KI-02 Task

`Account`, `Type`, `Reference` (link), `Status` (`open | in progress | done | declined | expired`), `Created_At`, `Connection?`, `Draft?`.

### DM-KI-03 Draft

`Account`, `Type`, `Reference`, `Content` (per the schema of the target operation), `Source`, `Connection`, `Status` (`open | adopted | discarded | expired`), `Created_At`.

### DM-KI-04 Log entry

`Account`, `Connection`, `Operation`, `Time`, `Effect`, `Undone_At?`. From US-KI-14 also `Client_Name` (as at the time of the call), `Targets` (ids only, no content), `Result` (`ok` or error code), `Idempotency_Key?`, `Import_Run?` (FR-KI-19).

### DM-KI-05 Confirmation request

`Account`, `Connection`, `Operation`, `Target` (link), `Arguments` (per the schema of the operation), `Preview` (what disappears from which view, counted), `Status` (`open | confirmed | declined | expired`), `Created_At`, `Decided_At?` (US-KI-16).

### DM-KI-06 Import run

`Account`, `Connection`, `Kind`, `Dry_Run`, `Counts` (`create`, `update`, `unchanged`, `refused`), `Created_At`, `Undone_At?`. The writes of a run carry its id in the log (US-KI-17).

## Requirements

| ID       | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Status |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| FR-KI-01 | Every operation can be called without AI (form, test) and returns structured output.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ⬜     |
| FR-KI-02 | Every writing operation is idempotent and validates its input completely.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ⬜     |
| FR-KI-03 | Descriptions of the operations, their schemas and supplied help texts (e.g. profile schema, success criteria) are versioned. Changes are backward compatible or raise the version. **Contract tests** check schema, error codes and fixed example flows; prompt tests are dropped because prompt and model are not with us.                                                                                                                                                                                                                                     | ⬜     |
| FR-KI-04 | The interface knows the account's access rights; a test proves that a connection cannot read data of other accounts (NFR-09).                                                                                                                                                                                                                                                                                                                                                                                                                                   | ⬜     |
| FR-KI-05 | There is no AI function that is reachable only via AI. Every action has a manual path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ⬜     |
| FR-KI-06 | Provider-neutral: the interface follows an open standard; a conformance test runs against at least two different clients (assumption). No function depends on peculiarities of a provider.                                                                                                                                                                                                                                                                                                                                                                      | 🟨     |
| FR-KI-07 | **Prompt injection:** free texts from data (notes, display names, friends' data) are delivered marked as data. No operation with side effects depends on the content of such fields; the rights are limited by the whitelist in FR-KI-10.                                                                                                                                                                                                                                                                                                                       | ⬜     |
| FR-KI-08 | Rights, draft duty for content results and rate limits are enforced server-side, regardless of whether the client asks for a confirmation.                                                                                                                                                                                                                                                                                                                                                                                                                      | ⬜     |
| FR-KI-09 | The operator uses the same interface with its own operator right (e.g. catalog batches, attributes). A connection can never set `reviewed`.                                                                                                                                                                                                                                                                                                                                                                                                                     | ⬜     |
| FR-KI-10 | **Not released via connections:** friends' data (collection, offers, feed), friendship, sharing settings (`Share`), swap acceptance and handover, delete or export account, manage connections, partner and recommendation data.                                                                                                                                                                                                                                                                                                                                | ⬜     |
| FR-KI-11 | Rate limits per connection; the operator sees usage and load per connection, no content (NFR-16, NFR-18).                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ⬜     |
| FR-KI-12 | Every released operation has exactly one class: `read`, `draft`, `write (reversible)` or `never released` (FR-KI-10). `write` covers only reversible operations (e.g. watered, location, measurement, tick off treatment). The assignment is in one place; a test checks that every operation has a class and the class matches the scope. From US-KI-16 a fifth class `confirm` covers destructive operations (FR-KI-18).                                                                                                                                      | ⬜     |
| FR-KI-13 | The authorization of the interface uses the sign-in service (E-03) as authorization server; the app builds none of its own. There are no long-lived personal access tokens (E-04).                                                                                                                                                                                                                                                                                                                                                                              | ⬜     |
| FR-KI-14 | **One path (KI-R10):** every operation of the app is either released through the interface or listed as human-only (FR-KI-22); a coverage test fails when an app operation has no class. Every tool calls the same validating operation as the app route, with the same rights checks, error codes and idempotency; no tool writes on its own.                                                                                                                                                                                                                  | 🟨     |
| FR-KI-15 | **Names instead of IDs:** every tool argument that references an entity of the account (species, specimen, location, light zone, wish, equipment, treatment) accepts the id or the readable name. One hit is used; several hits return the candidates and nothing is done (KI-R4) and say when more match than they list (`more`, without a count); a partial name whose species search was cut never counts as one hit; none returns `not_found` with up to 5 nearest names (starting value). Resolution runs only within the account and the visible catalog. | 🟨     |
| FR-KI-16 | **Lists are complete or say so:** list tools are paged with a stable order, a page size of at most 100 (starting value) and the total count; a cut list names the next page, never ends silently (P-10).                                                                                                                                                                                                                                                                                                                                                        | 🟨     |
| FR-KI-17 | **Rules are discoverable and cannot drift:** the rule discovery (US-KI-13) is derived from the checks of the operations (schemas, enumerations, limits, naming rule, error codes, classes); a test fails when a check and its description differ.                                                                                                                                                                                                                                                                                                               | ✅     |
| FR-KI-18 | **Class `confirm`:** destructive operations (US-KI-16) never run on a call of a connection; they become a confirmation request (DM-KI-05) the keeper decides in the app. The class list of FR-KI-12 names every such operation.                                                                                                                                                                                                                                                                                                                                 | ⬜     |
| FR-KI-19 | **Audit trail:** every call through a connection, including refused and read calls, is logged with account, connection, client name, operation, time, target ids, result and idempotency key or import run (DM-KI-04); no free text content. The keeper sees the entries of their account; the operator sees only counts (FR-KI-11). Retention 365 days (starting value, assumption).                                                                                                                                                                           | ⬜     |
| FR-KI-20 | **Rate limits per connection and day** (starting values, assumption): 2000 read calls, 500 write calls, 50 confirmation requests, batches of at most 200 items and 2000 imported items. A reached limit answers `ai.rate_limited` with the time of the reset; the app stays fully usable (FR-KI-05).                                                                                                                                                                                                                                                            | ⬜     |
| FR-KI-21 | **Natural keys for import:** location: name; light zone: number; specimen: species and marker (no marker = the only active specimen of the species); measurement: specimen, date and growth measure; treatment: specimen, kind and planned date; watering: specimen and date; wish: species name and target zone; equipment: name and kind. Keys are compared case-insensitively after trimming; a key that matches several entities is `refused` with the candidates.                                                                                          | ⬜     |
| FR-KI-22 | **Human-only (class `never`):** in addition to FR-KI-10: the private notes of a specimen and the CSV import (US-BES-18; owner decision 2026-11-06, issue 1330), profile and display name, push subscriptions of a device, calm mode, onboarding style and hints, keeper switches (US-ONB-09), visibility of wishes and equipment for friends, reviewer and operator functions (except over an operator connection, FR-KI-09), and changing the rights of any connection including the own. A call answers `ai.not_released` and is logged.                      | 🟨     |
| FR-KI-23 | **Tenant isolation per tool:** every released tool has a test with two accounts that proves a connection of one account can neither read, resolve by name, write, nor request confirmation on data of the other (P-04, NFR-09); foreign ids answer `not_found`.                                                                                                                                                                                                                                                                                                 | ⬜     |

## Out of scope

Built-in chat with operator quota (E-19), operator billing of AI calls, a real delete of measurements, treatments or specimens (the app itself has none; it needs a story in WAC, BEH or BES first, KI-R10 releases only what the app offers), long-lived personal access tokens, access to friends' data via connections (initially), model selection or prompts by the app, AI functions for friend views.

## Open questions

1. **Client tests (E-04):** which clients support client-ID metadata documents or dynamic client registration, step-up and image content? Remote support is documented for Claude and ChatGPT (each paid plans); Gemini is unchecked. Test on real clients before R4.
2. **Built-in chat (E-19):** add later if paths A and B are not enough?
3. **Friends' data via AI:** open later? If so, with which protections against injection (FR-KI-07)?
4. How many clients should be tested for real before R4 (FR-KI-06)?
5. **Consent without deselecting individual rights (assumption, decided by the PO, ADR 0013):** the sign-in service keeps its all-or-nothing consent; the rights the keeper allows are set in the app ("KI-Clients" in "Konto"), default `drafts`, and the token can only narrow them. A higher right that a token carries becomes a request the keeper confirms in the app. User task for production: the consent page of the sign-in service names client, requested rights and the AI provider (US-KI-06). Original question: Keycloak's default consent page only knows "yes" or "no" for all requested scopes (spike TE-15). US-KI-07 requires deselecting individual rights. Either a consent step of its own (theme or own dialog) or adjusting the story.
6. **Every function through the interface (US-KI-11 to US-KI-17), decided by the PO (assumption):** (a) the class of each operation as listed in US-KI-14 to US-KI-16 (facts the keeper already has are `write`, content results stay `draft`, destructive ones are `confirm`); (b) an import never creates species, they stay drafts; (c) an import run applies valid items and reports refused ones instead of rolling back the whole batch, because a re-run is idempotent; (d) confirmation requests expire after 7 days; (e) a photo is sent by the client as image content, not as a link the server fetches; (f) the limits in FR-KI-20 and the page size in FR-KI-16 are starting values to be checked against the first real migration; (g) own swap offers stay human-only until friends' data are opened (question 3).
