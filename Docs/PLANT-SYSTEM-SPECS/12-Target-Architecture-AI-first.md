# 12 – Target Architecture: AI-first and Tech Stack

As of: 2026-10-02 · **Draft, none of it is implemented** (everything ⬜). This document describes the target architecture, not the as-is state. It replaces no requirement from 01–11, but fixes _with what_ and _in which order_ they are implemented.

The **domain** behavior of social is in `11-Social.md` (epic SOZ). This document gives only the **technical answer** to the open decision E-SOZ-01 (exchange layer) and fixes what is to be prepared now.

## Starting point

Today the system is **UI-first** and a **single-person vault**: a `dataviewjs` dashboard in Obsidian with buttons, Claude assists (research, photo assessment, scripts). The logic lies partly inline in the dashboard without tests (B-02), partly in tested cores (`pokedex-core.js`, `finanz-core.js`). Two target pictures are added:

1. **AI-first:** Claude is the main interface, the dashboard becomes a pure view.
2. **Social (epic SOZ):** friends, feed, swapping. Hub technology open (E-SOZ-01).

Social sharing presupposes accounts and an exchange layer. The vault alone does not carry that. At the same time `FR-SOZ-02` demands that the **vault stays the source of truth for the own collection** and the hub holds only sharing settings, offers, processes and friendships. This document follows that requirement (see ADR-01).

## Guiding principles

| ID   | Principle                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01 | **The LLM judges, the code computes and writes.** Phases, rates, counts, naming rule and validation come from tested code, never from the model (NFR-05). |
| P-02 | **One core, many interfaces.** Claude (MCP/CLI), web, dashboard and bot call the same `core` logic. No copy of the phase logic (B-02).                    |
| P-03 | **Writes only through validating operations.** No free editing of frontmatter by the model. Key names are part of the format (NFR-01).                    |
| P-04 | **Storage is exchangeable.** `core` accesses only via a repository interface, not directly files or SQL.                                                  |
| P-05 | **Multi-tenant from the start,** even if initially only one user exists.                                                                                  |
| P-06 | **Specs are executable.** Acceptance criteria (Given/When/Then) become tests, so that Claude can check implementations itself.                            |

## Architecture decisions

### ADR-01 · Vault stays the truth, hub as a server with Postgres · ⬜

Proposal as an answer to **E-SOZ-01**, variant "own server with accounts":

- **Vault = truth** for the own collection (conforming to `FR-SOZ-02`). If the hub fails, everything except the social blocks stays usable (`FR-SOZ-03`).
- **Hub = server with PostgreSQL** for friendships (DM-S5), offers (DM-S2), swap processes (DM-S3) and shared extracts (DM-S1). It holds no growth logs, treatments or locations.
- **Synchronization:** the vault publishes only specimens with `Teilen: freunde` (cleaned photos, `FR-WAC-06`). The hub returns feed events and processes; the vault itself carries out archiving and creating on handover (`FR-SOZ-05`).

Alternatives for E-SOZ-01, not chosen but open: **Telegram bot as hub** (no own server, but identity and data storage tied to Telegram; fits if the circle stays small) and **file-based sync** (no server, but conflict handling and no real-time swap states).

The Postgres hub is built only when E-SOZ-01 is decided (see phases). Until then everything stays behind the repository interface from ADR-03.

### ADR-02 · TypeScript throughout · ⬜

One language for core, API, web and MCP server. Reason: existing logic (`pokedex-core.js`, `finanz-core.js`) is already JavaScript and is taken over without a change of language.

Exception: `build_pokedex.py` and `foto_import.py` stay Python (73 tests, proven data sources). They keep writing into the vault (`Pokedex-Baum.json`, photos) and are not rewritten.

### ADR-03 · `core` with a repository interface · ⬜

`packages/core` contains pure logic without I/O and accesses data via interfaces like `ExemplarRepo`, `ArtRepo`, `WunschlisteRepo`. Two adapters:

1. `markdown-adapter` (vault, first, replaces the inline logic of the dashboard)
2. `postgres-adapter` (later, with social)

This allows exchanging the storage without touching domain logic.

### ADR-04 · MCP server as AI interface · ⬜

An MCP server provides `core` as narrow, idempotent operations. This makes the same access work in Claude Code, in the Claude chat and on the phone. Alternatively a CLI plus skills in Claude Code suffices at the beginning (see open decisions).

### ADR-05 · Web as PWA · ⬜

The main context is the phone (photo, watering, reminder). First a PWA, native app only on proven need.

## Tech stack

| Area                | Choice                                                                                                  | Reasoning                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Language            | TypeScript                                                                                              | see ADR-02                                                                                                 |
| Structure           | Monorepo (pnpm + Turborepo): `packages/core`, `packages/db`, `packages/api`, `packages/mcp`, `apps/web` | `core` without I/O, used by all interfaces                                                                 |
| Database (hub only) | PostgreSQL (Supabase or Neon, self-hostable)                                                            | Friendships, offers, processes; row-level security. The vault stays the truth for the collection (ADR-01). |
| ORM/migrations      | Drizzle (alternative Prisma)                                                                            | type-safe, migrations in the repo                                                                          |
| Web                 | Next.js or SvelteKit, as a PWA                                                                          | see ADR-05                                                                                                 |
| Auth                | Supabase Auth, Clerk or Better Auth                                                                     | do not build ourselves                                                                                     |
| Media               | S3-compatible storage (R2/Supabase Storage), resize and EXIF/GPS removal server-side                    | takes over `foto_import.py`, mandatory with social                                                         |
| AI                  | MCP server on `core`, Claude API for photo assessment and research                                      | AI-first layer                                                                                             |
| Jobs                | Postgres queue (pg-boss) or Inngest                                                                     | Reminders, Pokédex build, photo processing                                                                 |
| Push                | Web push, optionally Telegram bot                                                                       | replaces the planned `pflanzen_status.py` (epic MON)                                                       |
| Pokédex build       | Python script, unchanged                                                                                | see ADR-02                                                                                                 |
| Tests               | Vitest (`core`), Playwright (E2E)                                                                       | Acceptance criteria as tests (P-06)                                                                        |

Alternatives deliberately not chosen: **PocketBase** (fastest prototype, scales worse, sensible only with a small circle of friends) and **local-first sync** (PowerSync, ElectricSQL, Jazz; only if offline operation becomes a hard must, otherwise too much complexity).

## User stories

### US-ARC-01 · Care by voice · ⬜

As a **plant keeper** I want to enter changes in natural language ("Aloe now stands under lamp 3, 12.5 cm, photo attached") instead of clicking forms.

Acceptance criteria:

- Given a free-text input, when Claude breaks it down into operations, then he calls exclusively `core` operations (`standort_setzen`, `messung_eintragen`, …).
- Given an ambiguous input (two specimens of the same species), then Claude asks back instead of guessing.
- Given an invalid input (unknown field, wrong lamp level), then the operation rejects and writes nothing.
- NFR-02 stays fulfilled: the keeper never edits raw YAML.

### US-ARC-02 · Daily status on request · ⬜

As a **plant keeper** I want to be able to ask "What is due today?" and get a prioritized answer.

Acceptance criteria:

- The status comes from `core` (`status`), not from the model. Claude only phrases.
- The answer names per item what to do (NFR-07).
- The same `status` feeds dashboard and bot (no third code path, B-02).

### US-ARC-03 · Validation finds silent gaps · ⬜

As a **plant keeper** I want incomplete data to be reported.

Acceptance criteria:

- `validate` reports specimens without `Art`, without `Standort_Aktuell`, with an unresolvable species and lamp strings outside the defined levels (B-04, B-07, NFR-06).
- The result is machine-readable (for Claude and CI) and readable (for the keeper).

### US-ARC-04 · Specs check themselves · ⬜

As a **developer (Claude/keeper)** I want to run acceptance criteria as tests.

Acceptance criteria:

- Every story with status ✅ has at least one test that checks its acceptance criterion; the test file names the story ID.
- A change to `core` without green tests does not count as done.

### US-ARC-05 · Own data, without platform compulsion · ⬜

As a **plant keeper** I want not to be tied to the hub.

Acceptance criteria:

- The own collection lies completely in the vault (DM-01…DM-04); the hub is not a precondition (FR-SOZ-02).
- Hub data (friendships, offers, processes) can be exported as a file; the export is idempotent (same data yield byte-identical files, cf. US-QS-03).

## Technical requirements for the hub

Domain behavior, privacy rules and data model are in `11-Social.md` (FR-SOZ-01…11, DM-S1…S5) and apply unchanged. Here only what the technology additionally fixes. All ⬜ and relevant only if E-SOZ-01 is decided in favor of a server.

| ID        | Requirement                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-ARC-01 | **Tenant isolation:** `user_id` on every user-related row from the first migration, row-level security in Postgres (P-05). Test: user A never sees data of user B (NFR-ARC-06). |
| FR-ARC-02 | **Data minimization:** the hub stores only DM-S1…S5 and the shared extracts. Never location, growth log, treatment agent or financial data (FR-SOZ-01, US-SOZ-04).              |
| FR-ARC-03 | **Deletion:** a keeper can delete and export their hub data completely (FR-SOZ-10). The vault remains untouched.                                                                |
| FR-ARC-04 | **State machine in the core:** swap states (DM-S3) and feed derivation live in `core`/`soziales-core` (FR-SOZ-04), the hub only executes and stores them.                       |
| FR-ARC-05 | **Idempotent synchronization:** repeated publishing or retrieving leads to an identical state (US-QS-03). If the hub fails, social blocks show the last state (FR-SOZ-03).      |
| FR-ARC-06 | **Identity:** sign-in via an established service (Supabase Auth, Clerk or Better Auth), not built ourselves. Concrete choice with E-SOZ-01 (open question 2 in `11-Social.md`). |

## Phases

| Phase | Content                                                                                                                                                          | Depends on                     | Touches                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------- |
| **0** | `packages/core` with tests and `validate`; lamp levels defined centrally                                                                                         | –                              | B-02, B-04, B-07, US-QS-02 |
| **1** | Markdown adapter, CLI/MCP with 4–5 core operations (`status`, `standort_setzen`, `messung_eintragen`, `behandlung_eintragen`, `validate`), skills in `CLAUDE.md` | 0                              | US-ARC-01…03               |
| **2** | Switch the dashboard to `core`; bug fixes B-01, B-11                                                                                                             | 0                              | US-QS-02                   |
| **3** | Monitoring phase 1 (watering log, `status` job, bot)                                                                                                             | 0, 1                           | Epic MON                   |
| **4** | `soziales-core.js` (sharing, feed derivation, swap states) with tests, without hub (FR-SOZ-04)                                                                   | 0, E-SOZ-01 in terms of domain | Epic SOZ                   |
| **5** | Hub (ADR-01), accounts, friendship, sharing sync; first feed "Neu bei Freunden" (US-SOZ-05), then swapping                                                       | 1, 4, E-SOZ-01 decided         | Epic SOZ                   |
| **6** | PWA as an additional interface next to Obsidian (ADR-05)                                                                                                         | 5                              | –                          |

Phases 0–4 manage without a server and are independent of the hub decision. Only phase 5 commits. The order matches the backlog (B-02 before MON and SOZ).

## Non-functional requirements

| ID         | Requirement                                                                                               | Status |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------ |
| NFR-ARC-01 | `core` has no dependency on file system, database or network.                                             | ⬜     |
| NFR-ARC-02 | Every writing operation is idempotent and validates its input completely (P-03).                          | ⬜     |
| NFR-ARC-03 | Every operation can be called without a model (CLI/test) and returns structured output.                   | ⬜     |
| NFR-ARC-04 | Raw sensor values do not go into the Git vault, only aggregates (NFR-MON-01).                             | ⬜     |
| NFR-ARC-05 | Claude does not commit (existing rule); changes are checkable as a diff. Applies to the vault adapter.    | ⬜     |
| NFR-ARC-06 | Migrations are versioned and reproducible; tenant isolation has tests (user A never sees data of user B). | ⬜     |

## Risks

| ID   | Risk                                                                                                                                     | Countermeasure                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| R-01 | A vault script becomes a product (hosting, moderation, privacy, operation).                                                              | Phases 0–4 deliver benefit without a server; hub (phase 5) only after E-SOZ-01.                                |
| R-02 | The model writes fields or values that are not in the schema.                                                                            | P-03: only validating operations, no free file edits.                                                          |
| R-03 | Two truths (vault and hub) drift apart.                                                                                                  | Vault leads for the own collection, hub for processes and friendships (ADR-01); atomic handover per FR-SOZ-05. |
| R-04 | Later evaluations across many users ("this is how it went for others under lamp 3") are misleading with a small sample. Not part of SOZ. | Introduce only with a minimum count and displayed sample size; stays an idea until SOZ runs.                   |
| R-05 | Privacy: location, photos, living environment are sensitive.                                                                             | FR-SOZ-01, FR-ARC-02, default `privat`.                                                                        |

## Open decisions for the keeper

1. **E-SOZ-01 (hub technology):** server with Postgres (ADR-01), Telegram bot as hub or file-based sync? For a circle of friends of about 10 people the bot may suffice and saves the server; an own server pays off if accounts, real-time swap states or a PWA are needed. See also the open questions in `11-Social.md`.
2. **MCP server or CLI plus skills?** MCP also works in the chat and on the phone; the CLI suffices for Claude Code.
3. **Does the code live in the vault repo or in a repo of its own?** This repo is a pure spec store.
4. **Monorepo and TypeScript as proposed,** or stay with the `pokedex-core.js` style (single JS files) as long as no hub exists?
