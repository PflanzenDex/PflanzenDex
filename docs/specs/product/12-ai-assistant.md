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

| ID    | Rule                                                                                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| KI-R1 | **Operations instead of free writing:** the AI client calls only validating operations (`set_location`, `record_measurement`, `plan_treatment`, `watered`, `status`, `validate`, …). Invalid input is rejected and nothing is written.                                   |
| KI-R2 | **The code computes:** phases, rates, counts, naming rule come from the domain logic, never from the model. The client only phrases.                                                                                                                                     |
| KI-R3 | **Proposal, not execution:** content results (species profile, photo assessment, wish candidates, equipment from a photo) are drafts. The keeper confirms in the app (US-KI-09).                                                                                         |
| KI-R4 | **Ask instead of guess:** on ambiguity (two specimens of the same species) the operation returns the candidates and writes nothing; the client asks the keeper.                                                                                                          |
| KI-R5 | **Labeling:** AI-generated content is marked as such (with the name of the connection) until a human has reviewed it (FR-BES-06).                                                                                                                                        |
| KI-R6 | **Own data only:** a connection sees the data of the account that approved it, never that of other users. Friends' data (collection, offers, feed) is **not** accessible via connections (FR-KI-10); whether that is opened later is a decision of its own (P-04, P-05). |
| KI-R7 | **Provider-independent:** no function presupposes a specific AI provider or model. Whoever connects no AI client loses nothing (FR-KI-05).                                                                                                                               |
| KI-R8 | **The server enforces, the client is not presupposed:** rights, draft duty and limits apply server-side, even if the client asks the keeper no confirmation (FR-KI-08).                                                                                                  |
| KI-R9 | **Data are not instructions:** texts from data (notes, names, friends' data) are delivered as data and never trigger an operation (FR-KI-07).                                                                                                                            |

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

- An operation delivers the cleaned photo of the measurement to the client (only photos of the own account). The client suggests `quality` and a short note as a draft (US-WAC-06, US-KI-09).
- Only what is visible is assessed; no estimation of height, substrate moisture or roots. If the basis is missing, the note stays empty.
- A client with image understanding is a precondition. Without it the keeper assesses themselves (US-WAC-02).

### US-KI-05 · Research via the AI client (wishlist, equipment, catalog) · ⬜ (prototype ✅)

Acceptance criteria:

- Wish candidates per US-WUN-04, equipment suggestions per FR-EQU-09 and suggestions from the catalog per US-ENT-08 (operation `suggestions`, no assessment of its own) arrive as drafts. The trigger is the client (path A) or a task (path B).
- Species attributes for Discover (DM-ENT-01) are delivered by the client only with a source and as `ai-created, unreviewed` (FR-BES-06).
- Image URLs, sources and licenses are checked by the **server** for reachability and license (operation `check_image_source`); the client cannot claim them as checked.
- Adoption one by one in the app (US-KI-09).

### US-KI-06 · Limits, transparency and privacy · ⬜ new

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
- Per draft: adopt, change and adopt, discard. Adopting runs through the same validating operation as the form (date local, `Assessed_By: AI suggestion accepted`).
- A draft is never adopted automatically. Unprocessed drafts expire and remain viewable as discarded.

### US-KI-10 · Log of AI actions and undo · ⬜ new

As a **plant keeper** I want to trace and take back what the AI client did.

Acceptance criteria:

- Every operation via a connection is logged: connection, operation, time, effect (DM-KI-04). The log contains no content beyond what is necessary.
- The keeper sees the log and can undo the last action per operation where that is possible in terms of the domain (measurement, location, treatment, watering).
- Operations that are not reversible or concern third parties are not released for connections at all (FR-KI-10).

## Data model

### DM-KI-01 Connection

`Account`, `Client_Name`, `Rights` (`read | drafts | write`), `Created_At`, `Last_Use`, `Revoked_At?`.

### DM-KI-02 Task

`Account`, `Type`, `Reference` (link), `Status` (`open | in progress | done | declined | expired`), `Created_At`, `Connection?`, `Draft?`.

### DM-KI-03 Draft

`Account`, `Type`, `Reference`, `Content` (per the schema of the target operation), `Source`, `Connection`, `Status` (`open | adopted | discarded | expired`), `Created_At`.

### DM-KI-04 Log entry

`Account`, `Connection`, `Operation`, `Time`, `Effect`, `Undone_At?`.

## Requirements

| ID       | Requirement                                                                                                                                                                                                                                                                                                                                | Status |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| FR-KI-01 | Every operation can be called without AI (form, test) and returns structured output.                                                                                                                                                                                                                                                       | ⬜     |
| FR-KI-02 | Every writing operation is idempotent and validates its input completely.                                                                                                                                                                                                                                                                  | ⬜     |
| FR-KI-03 | Descriptions of the operations, their schemas and supplied help texts (e.g. profile schema, success criteria) are versioned. Changes are backward compatible or raise the version. **Contract tests** check schema, error codes and fixed example flows; prompt tests are dropped because prompt and model are not with us.                | ⬜     |
| FR-KI-04 | The interface knows the account's access rights; a test proves that a connection cannot read data of other accounts (NFR-09).                                                                                                                                                                                                              | ⬜     |
| FR-KI-05 | There is no AI function that is reachable only via AI. Every action has a manual path.                                                                                                                                                                                                                                                     | ⬜     |
| FR-KI-06 | Provider-neutral: the interface follows an open standard; a conformance test runs against at least two different clients (assumption). No function depends on peculiarities of a provider.                                                                                                                                                 | ⬜     |
| FR-KI-07 | **Prompt injection:** free texts from data (notes, display names, friends' data) are delivered marked as data. No operation with side effects depends on the content of such fields; the rights are limited by the whitelist in FR-KI-10.                                                                                                  | ⬜     |
| FR-KI-08 | Rights, draft duty for content results and rate limits are enforced server-side, regardless of whether the client asks for a confirmation.                                                                                                                                                                                                 | ⬜     |
| FR-KI-09 | The operator uses the same interface with its own operator right (e.g. catalog batches, attributes). A connection can never set `reviewed`.                                                                                                                                                                                                | ⬜     |
| FR-KI-10 | **Not released via connections:** friends' data (collection, offers, feed), friendship, sharing settings (`Share`), swap acceptance and handover, delete or export account, manage connections, partner and recommendation data.                                                                                                           | ⬜     |
| FR-KI-11 | Rate limits per connection; the operator sees usage and load per connection, no content (NFR-16, NFR-18).                                                                                                                                                                                                                                  | ⬜     |
| FR-KI-12 | Every released operation has exactly one class: `read`, `draft`, `write (reversible)` or `never released` (FR-KI-10). `write` covers only reversible operations (e.g. watered, location, measurement, tick off treatment). The assignment is in one place; a test checks that every operation has a class and the class matches the scope. | ⬜     |
| FR-KI-13 | The authorization of the interface uses the sign-in service (E-03) as authorization server; the app builds none of its own. There are no long-lived personal access tokens (E-04).                                                                                                                                                         | ⬜     |

## Out of scope

Built-in chat with operator quota (E-19), operator billing of AI calls, long-lived personal access tokens, access to friends' data via connections (initially), model selection or prompts by the app, AI functions for friend views.

## Open questions

1. **Client tests (E-04):** which clients support client-ID metadata documents or dynamic client registration, step-up and image content? Remote support is documented for Claude and ChatGPT (each paid plans); Gemini is unchecked. Test on real clients before R4.
2. **Built-in chat (E-19):** add later if paths A and B are not enough?
3. **Friends' data via AI:** open later? If so, with which protections against injection (FR-KI-07)?
4. How many clients should be tested for real before R4 (FR-KI-06)?
5. **Consent without deselecting individual rights (assumption, decided by the PO, ADR 0013):** the sign-in service keeps its all-or-nothing consent; the rights the keeper allows are set in the app ("KI-Clients" in "Konto"), default `drafts`, and the token can only narrow them. A higher right that a token carries becomes a request the keeper confirms in the app. User task for production: the consent page of the sign-in service names client, requested rights and the AI provider (US-KI-06). Original question: Keycloak's default consent page only knows "yes" or "no" for all requested scopes (spike TE-15). US-KI-07 requires deselecting individual rights. Either a consent step of its own (theme or own dialog) or adjusting the story.
