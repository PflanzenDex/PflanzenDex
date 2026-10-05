# 0003 · Modulith: one deployable, modules cut by domain with their own public interface

- **Status:** **accepted.** The decision "Modulith" was taken on 2026-10-03 by the project owner. The module cut, the dependency matrix, the directory structure and the open questions O-3 to O-9 were confirmed on 2026-10-05 as an assumption decided by the PO under the autonomy rules (O-1 and O-2 by the owner on 2026-10-03); all of them stay revisable by a later ADR. `app/modules.config.mjs` is the single source for the cut; where it differs from the tables below, the register wins.
- **Changes:** adds E-20 (`Docs/PRODUCT-SPECS/16-Releases-and-Decisions.md`) and the module rules AB-7 to AB-14 (`Docs/PRODUCT-SPECS/18-Architecture-and-Quality-Gates.md`, section "Modulgrenzen")
- **Refines:** E-01 (monorepo, `core` without I/O), FR-QG-04, FR-QG-05, P-02, P-03, P-04
- **Affects:** every epic that is built from now on (BES, PHA, WAC, BEH, WUN, POK, MON, SOZ, EQU, KI, ENT), `app/scripts/check-boundaries.mjs` (later, own issue)

## Context

Today the monorepo is cut by **layer**: `core` (pure domain logic), `db` (schema, migrations, adapters), `api` (HTTP), `web` (PWA). The rules AB-1 to AB-6 keep the layers apart (core has no I/O, api and web use `core` only through its package root, web never imports api or db). Nothing says how the **inside** of a layer is cut. The code that exists (ACC sign-in, operator role and review status, light zones and locations, idempotency) already sits in separate folders, but nothing stops the next epics from reaching into each other: BES needs the zone of a location, WUN needs the buffer per zone, POK derives ownership from specimens, SOZ reads other accounts, EQU binds lamps to zones, ENT reads half of the product. Without a rule, 14 product epics grow into one connected ball in which a change to the zone model breaks nine places.

The owner has decided that the product is a **Modulith** (modular monolith): one deployable, one database, modules cut by domain, each with its own public interface. This was not stated anywhere in the specs or issues before (a search for "Modulith" and "Monolith" found nothing).

Constraints that come from decisions already taken:

- P-03: writes only through validating operations. P-04: every user-owned row has `account_id` and a row rule. The tenant guarantee must not get weaker through modules.
- One PostgreSQL, one numbered, forward-only migration sequence with checksums (TE-02, NFR-15).
- KI-R1 / AB-3: the AI layer calls only validating operations.
- AB-4: the Pokédex build job writes only into its tree store. AB-5: only the sharing layer reads other accounts' data.
- Small team (three start users, Stufe 1): no distributed system, no service mesh (R-01).

## Decision

### Decided (by the owner)

The product is built as a Modulith: one deployable (one API process, one database), fachlich cut modules, access between modules only through each module's public interface. Microservices are not a goal.

### Confirmed (2026-10-05, assumption decided by the PO; revisable)

#### 1. Module cut

Cut along the epics, but merged where two epics change together, share their data and are never useful alone. Technical building blocks are separate from domain modules.

| Module                   | Epics / stories                                                     | Owns (data)                                                              | Reasoning                                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kernel` (shared kernel) | none (TE-04, parts of TE-02)                                        | `idempotency`, the tenant anchor `account(id)`, tenant functions         | Operation engine (`defineOperation`, `execute`), `Result`, error codes and texts, `Context`, idempotency port, validation helpers, tenant access (`withAccount`), date helpers (NFR-08), operation registry. No domain knowledge. Strictly limited, see "Shared kernel". |
| `media` (platform)       | TE-05, FR-WAC photo rules, QG-D3                                    | `medium` (object reference, size, owner)                                 | Object store, resizing, EXIF/GPS removal. Used by WAC, BES (picture), SOZ (shared photos). No domain meaning.                                                                                                                                                            |
| `jobs` (platform)        | TE-06                                                               | queue tables                                                             | PostgreSQL queue and job runner. Used by MON, POK (build job), KI orders.                                                                                                                                                                                                |
| `account`                | ACC (01-05), roles `operator`/`reviewer`                            | `account_data`, `account_role`, `invitation`                             | Sign-in, profile, invitation, export and deletion orchestration, role grants. Roles reach other modules through `Context`, not through imports.                                                                                                                          |
| `catalog`                | BES-01, BES-05, BES-10, DM-BES-01, review status (TE-08), POK-02    | `species`, `species_version`, `review_case`                              | The shared species catalog (the only data without an account, apart from the tree) with versions and review workflow.                                                                                                                                                    |
| `light`                  | LIC-05 (and the rules LIC-04 as constants)                          | `light_zone`, `location`                                                 | Light zones and locations of an account. Defines the port `ZoneUsage`. Stays at the bottom so that everything else may depend on it.                                                                                                                                     |
| `collection`             | BES-02..04, 06..09, DM-BES-02..04, LIC-01..03 (derived light views) | `specimen`, `care_profile`, `specimen_provenance`                        | One pot of one owner, name rule, cutting, archive, care profile, "Hints" source. Also holds the derived light views (zone from Lux need, free space, lamp distance) because they need specimens and the catalog (see O-4).                                               |
| `care`                   | PHA (01-04), BEH (01-04)                                            | `treatment` (phases are derived, not stored, FR-PHA)                     | "What should happen to this plant": care phase against location, due treatments. Merged because both are the plan-versus-reality of one specimen and both feed "Today" and reminders.                                                                                    |
| `growth`                 | WAC (01-06)                                                         | `measurement`, photo references                                          | Measurement, trend, etiolation, photos. Separate from `care` because it carries the largest logic (trend, rate) and the photo pipeline; the two change for different reasons.                                                                                            |
| `wishlist`               | WUN (01-05), equipment wishes of EQU-08                             | `wish`                                                                   | Candidates, buffer per zone, path from purchase to plant.                                                                                                                                                                                                                |
| `pokedex`                | POK (01, 03, 06-12)                                                 | `taxon` (tree store, AB-4), `pokedex_state` (seen state)                 | Cards, ownership ("Caught" is derived live, never stored), rank, milestones. Owns the tree store written by the build job.                                                                                                                                               |
| `monitoring`             | MON (01-08)                                                         | `reminder`, `watering_log`, `sensor`, `measurements`, `delivery_channel` | Reminders, watering log, sensors, delivery channels. Defines the port `OccasionSource`; care, growth and equipment deliver reminder reasons through it.                                                                                                                  |
| `equipment`              | EQU (01-12)                                                         | `equipment`, `supply`, `recommendation_*`                                | Equipment, needs derived from own data, recommendations (labeled). Sub-areas `need` and `recommendation` may become a second module later (O-7).                                                                                                                         |
| `social`                 | SOZ (01-13)                                                         | `friendship`, `sharing`, `offer`, `swap`, `event`                        | Friends, release, feed, exchange. The only module that reads other accounts' data, and only through the release layer (AB-5).                                                                                                                                            |
| `discover`               | ENT (01-08)                                                         | `proposal_decision`, feature weights                                     | Swipe suggestions into the wishlist. A pure consumer, nothing depends on it.                                                                                                                                                                                             |
| `today`                  | no epic of its own (TE-07, P-09, US-BES-08)                         | none (read-only)                                                         | The "Today" list and the central hints page: aggregates `Hint` and `Task` from the other modules through one `status` function. A read-only module so that no domain module has to know the others (R-04).                                                               |
| `ai-access`              | KI (01-10)                                                          | `connection`, `task`, `draft`, `ai_log`                                  | Thin adapter over the operation registry (AB-3, KI-R1). Depends only on `kernel` and `account`; it finds operations through the registry, never by importing domain modules.                                                                                             |

Not 1:1 with the 14 epics on purpose: ACC and parts of BES/POK/LIC are regrouped; QS and QG are cross-cutting rules, not modules; PHA+BEH merge; LIC splits into master data (`light`) and derived views (`collection`) to avoid a cycle with `collection`.

#### 2. Dependency direction

`A -> B` means: code in A may import the public interface of B. Anything not marked is forbidden (AB-8). Reading the matrix by row: what a module may use.

| depends on →    | kernel | media | jobs | account | catalog | light | collection | care | growth | wishlist | pokedex | monitoring | equipment | social | discover |
| --------------- | ------ | ----- | ---- | ------- | ------- | ----- | ---------- | ---- | ------ | -------- | ------- | ---------- | --------- | ------ | -------- |
| `media`, `jobs` | x      |       |      |         |         |       |            |      |        |          |         |            |           |        |          |
| `account`       | x      |       |      |         |         |       |            |      |        |          |         |            |           |        |          |
| `catalog`       | x      | x     |      |         |         |       |            |      |        |          |         |            |           |        |          |
| `light`         | x      |       |      |         |         |       |            |      |        |          |         |            |           |        |          |
| `collection`    | x      |       |      |         | x       | x     |            |      |        |          |         |            |           |        |          |
| `monitoring`    | x      |       | x    |         |         |       | x          |      |        |          |         |            |           |        |          |
| `care`          | x      |       |      |         | x       | x     | x          |      |        |          |         | x          |           |        |          |
| `growth`        | x      | x     |      |         | x       |       | x          |      |        |          |         | x          |           |        |          |
| `wishlist`      | x      |       |      |         | x       | x     | x          |      |        |          |         |            |           |        |          |
| `pokedex`       | x      |       | x    |         | x       |       | x          |      |        |          |         |            |           |        |          |
| `equipment`     | x      |       |      |         |         | x     | x          |      |        | x        |         | x          |           |        |          |
| `social`        | x      | x     |      | x       | x       |       | x          |      | x      |          | x       | x          |           |        |          |
| `discover`      | x      |       |      |         | x       | x     | x          |      | x      | x        | x       |            |           |        |          |
| `today`         | x      |       |      |         |         | x     | x          | x    | x      | x        |         | x          |           |        |          |
| `ai-access`     | x      |       |      | x       |         |       |            |      |        |          |         |            |           |        |          |

Checked: the graph has no cycle. One possible build order: `kernel`, `media`, `jobs`, `account`, `catalog`, `light`, `collection`, `monitoring`, `care`, `growth`, `wishlist`, `pokedex`, `equipment`, `social`, `discover`, `today`, `ai-access`. A new edge needs a change of this matrix in the same PR (reviewed), a cycle is always an error. Edges that point "up" are replaced by ports (next section), never by exceptions.

#### 3. Coupling in the other direction: ports and events

When a lower module needs something from a higher one, the **lower module defines the port** (an interface in its public interface) and the higher module implements it; the composition root (`api/src/app.ts`) wires them. Examples:

- `ZoneUsage` (US-LIC-05): `light` asks "who uses this zone?" before a zone is deleted. `collection` (specimens, species' zone overrides) and `light` itself (locations) each provide one source. Today the port exists with one source (locations) and the TODO "BES has to add one source each" is exactly this rule. The contract test with a stub stays; every implementer adds a test that it is registered.
- `OccasionSource` (`monitoring`): `care` (phase change, due treatment), `growth` (measurement overdue), `equipment` (maintenance) deliver reminder reasons. `monitoring` never imports them.
- `DataSource` (`kernel`): every module with user data provides export and deletion of its rows for US-ACC-04; `account` orchestrates without knowing the modules.
- Operation registry (`kernel`): every operation registers with its class (`read`/`Entwurf`/`schreiben`, FR-KI-12). `api` and `ai-access` use the registry.

**Events:** notifications about facts ("specimen created", "handover confirmed") go through an in-process, typed event bus in `kernel`, delivered **synchronously inside the same database transaction** by default (assumption: this is what keeps P-03 and the tenant context intact and is the simplest thing that works; O-6). Slow or external effects (push, mail) are not events but jobs in the queue (`jobs`). The publisher defines the event type in its public interface. A feed (`social.event`) is derived from events and from queries, never from another module's tables.

#### 4. Rules (see spec 18, AB-7 to AB-14)

1. Access only through the public interface (`index.ts`) of the other module, in every layer (AB-7).
2. Only edges of the matrix, no cycles (AB-8).
3. Every table belongs to exactly one module; SQL (select, join, update) only on the own tables; other data through a port (AB-9).
4. Foreign keys across modules only from a module to a module it may depend on, only to its key, and only in the tenant-safe composite form `(account_id, id)`; the tenant anchor `account(id)` is allowed for everyone (AB-10). This keeps the database guarantee that makes P-04 testable. It is the weakest point for later extraction. **One narrow, registered exception (O-2, decided 2026-10-03 by the project owner):** a _global reference table_ (a table without `account_id` that has a justified entry in `WITHOUT_ACCOUNT_ID`; today only `catalog.art`) is listed with owner and reason in `GLOBAL_REFERENCE_TABLES` (`app/modules.config.mjs`). A module that may depend on the owner according to the matrix may point to its `(id)` with a plain foreign key, always `on delete restrict`. Why: a rule that exists only in a document is a wish (`Docs/principles/README.md`); the database, not a code path, guarantees that the species exists and cannot be deleted while in use (PRIN-006, P-04 stays testable; P-10: deleting a species in use fails instead of leaving a dangling reference). The exception is registered, justified (EX-1 principle: narrow, with a reason) and grows only through review of the register. The visibility check (private proposals of other accounts) stays in the operation. `species_name` and `species_version` are details of a species and are not targets.
5. The kernel is small, free of domain knowledge and may not import a module (AB-11).
6. Calling "upwards" only through ports/events of the lower module (AB-12).
7. Every module is registered in a module register (name, path, tables, allowed dependencies, ports); code or tables outside it fail the gate (AB-13).
8. A migration belongs to one module and touches only its tables, plus the kernel's (AB-14).

Not weakened: P-04 (`account_id` + `tenant_protection()` per table, the generic tenant test), AB-1 to AB-6 stay as they are.

#### 5. Shared kernel (limited)

Allowed in `kernel`: things that every module needs and that mean nothing in the domain: operation engine and registry, `Result`/`AppError` and the error-code format (texts per code stay with the owning module and are registered), `Context` (account id, roles, time zone), idempotency, tenant access, validation helpers, date helpers, the event bus, the generic ports `DataSource`/`IdempotencyStore`. Not allowed: any noun from the glossary (Art, specimen, Lichtzone, ...), constants of a domain (thresholds belong to their module, FR-QG-12/13), anything used by only one module. A candidate for the kernel needs a one-line reason in the PR and is counted; the number of kernel exports is reported by the gate (a measure, no threshold yet). The line count of `kernel` is expected to stay small; a number is deliberately not fixed (no measured basis).

#### 6. Directory structure

Options:

- **A. Module folders inside the layer packages** (`core/src/<module>/`, `db/src/<module>/`, `api/src/<module>/`, `web/src/<module>/`). Same module name in every package. AB-1 to AB-6 stay valid unchanged (they are package rules); coverage, ESLint, build and the "every directory with code has an `index.ts`" rule (ST-c) keep working. Cost: a module is spread over four folders; module extraction means moving four directories; module rules need a checker that understands the folder name.
- **B. Vertical packages** (`packages/<module>/{core,db,api,web}`). Best cohesion and the cleanest path to extraction; but AB-1 (purity of `core`) has to be re-expressed per folder, every package needs its own build/test config, and all existing tooling (boundary script, coverage ratchet, knip, ESLint overrides) would change while several tooling PRs are in flight.
- **C. Top-level `modules/<module>/` next to `packages`.** Same costs as B without its benefit.

**Recommendation: A**, as the smallest step that makes the rules enforceable now, and re-evaluate B before Stufe 2 or before the first extraction (O-3). The module's public interface is `core/src/<module>/index.ts` (operations, types, ports). The root barrel `core/src/index.ts` keeps re-exporting the public interfaces, so AB-2 (consumers import `@pflanzendex/core` only) stays valid; the module name is visible in the export names or in namespaced exports (O-9).

**Migrations:** one global, forward-only, checksummed sequence in `packages/db/migrations/` (one database, one order of application). The number stays global; the module is part of the file name: `0013_collection_example.sql` and a first line `-- module: collection` that the gate reads (AB-14). Existing files `0001..0011` are not renamed (an applied file must never change); a small map in the module register assigns them to modules (for example `0001` kernel, `0002` account+catalog, `0003` account, `0004` light+kernel). `0012_english_names.sql` renames all objects of the German migrations in one go (ADR 0004).

#### 7. Consequences for tests, coverage and gates

- **Tests** live next to the code in the module (`<name>.test.ts`). A module test may use only its own tables and stubs/fakes of the ports of its allowed dependencies; a "module in isolation" test composes a module with exactly its declared dependencies and proves that nothing else is imported.
- **Tenant tests (QG-D1):** stay generic over all tables. `fixtures.ts` is split per module and aggregated, so a new table without a fixture still fails. Tables in the register without an owner fail (AB-13).
- **Contract tests per port** (like the `ZoneUsage` stub test): one shared test per port that every implementation must pass.
- **Coverage (QG-T1):** the report is split per module; the thresholds stay in the single gate configuration (FR-QG-18). Per-module thresholds are not set now (no measured basis; assumption: start with the existing global values and ratchet per module once a module has code).
- **Traceability (QG-T4):** the story ID in the test name stays the only link. The module register maps epics to modules so that the report can group by module; a test in module X naming a story of epic Y (outside X) is reported as a hint.
- **Complexity/duplicates gates (QG-K\*):** unchanged; the diff principle applies per file.
- **Boundary gate:** `check-boundaries.mjs` gets the module rules (own issue). It must report rule ID, file, line and the violated edge (`collection -> care`).

#### 8. Outlook on later extraction

Extraction is **not a goal**, only kept possible. What keeps it cheap: no cross-module joins, serializable port data, events instead of shared state, tables owned by one module, the isolated build job. Likely first candidates, in order of ease: the Pokédex build job (already isolated, AB-4), `media`, `ai-access` (an adapter already), delivery in `monitoring`. What it would cost: dropping the composite foreign keys across modules (AB-10), replacing synchronous events with an outbox, one tenant mechanism per deployable (the row-level approach would have to travel with it). Nothing of this is planned; a concrete need (load, team size, separate release rhythm) has to be shown first.

## Existing code mapped to the cut

| Today                                                                                                                                                              | Module                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `core/src/operationen/{operation,result,error,validation,canonical,ports}.ts`, `core/src/meta`                                                                     | `kernel`                                                                                                                                |
| `db`: `tenant.ts`, `connection.ts`, `migrate*.ts`, `schema.ts`, `isolation.ts`, `idempotency.ts`, `fixtures.ts` (split), tables `account` (id only), `idempotency` | `kernel`                                                                                                                                |
| `core/src/account`, `db/sign-in.ts`, `api/src/auth`, `api/src/account-routes.ts`, `web/src/auth`; tables `account_data`, `account_role`                            | `account`                                                                                                                               |
| `core/src/operationen/review`, `db/review.ts`; table `review_case`                                                                                                 | `catalog` (the species table `species` arrives with BES-01)                                                                             |
| `core/src/operationen/light`, `db/light-zones.ts`, `db/light-locations.ts`, `api/src/light-routes.ts`, `web/src/light`; tables `light_zone`, `location`            | `light`                                                                                                                                 |
| `core/src/operationen/beispiel` (demo standort)                                                                                                                    | removed or moved into test helpers of `kernel` (not product code)                                                                       |
| `api/src/error-http.ts`, `app.ts`, `main.ts`                                                                                                                       | `kernel` (error mapping) and the composition root (`app.ts` wires modules and ports; it is the only place that may import every module) |

Open findings from the code: `review_case` references `object_kind`/`object_id` without a foreign key (a polymorphic reference). Under AB-9/AB-10 that is a port in disguise: `catalog` owns the review status of its own objects only; other objects (if any) need their own port. `account_role` is read by `roles_of_account()`/`ist_pruefer()` (SQL functions): this is the pattern for a database-level port (a function owned by the module, granted to the app role) and is allowed under AB-9.

## Consequences

- Positive: changes stay local, ownership of data and rules is explicit, the AI layer is limited by construction, the hardest-to-undo decisions (tables, FKs) are made before the data exists.
- Negative: more ceremony per cross-module need (a port instead of a call), a risk of over-cutting for a three-user product (14 modules for a small team), and the gate work (own issue) must land before BES-01 and BES-02 to be useful.
- BES-01 (#57) and BES-02 (#58) are the first stories that cross modules (`collection` -> `catalog`, `light`). They should be built after the cut is confirmed, or they will have to be moved.
- The root `README` conventions ("Spec status and counters change in the same PR as the code") are unchanged. Spec counters in `README.md` are not affected (no new epic).

## Open questions

| ID  | Question                                                                                                                                                                                                        | Status                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-1 | Is the module cut above (17 modules, three of them technical: `kernel`, `media`, `jobs`) the right size, or should it be coarser (e.g. merge `care`+`growth`, `media`+`kernel`)?                                | **decided 2026-10-05 (assumption, decided by the PO under the autonomy rules; revisable):** cut confirmed in the size of the register `app/modules.config.mjs`: `care` and `growth` merged into `care`, `media` and `jobs` live in `kernel` until they grow domain rules; the register is the single source, this table is its reasoning |
| O-2 | Foreign keys across modules (AB-10): allowed in composite form (recommended, keeps the DB guarantee) or forbidden entirely (cleaner extraction, integrity then by port checks and delete guards)?               | **decided 2026-10-03 (project owner):** tenant-safe `(account_id, id)` on allowed dependencies stays the rule; plus one registered exception for global reference tables (plain `(id)`, `on delete restrict`, only `species`), see rule 4                                                                                                |
| O-3 | Directory structure A (recommended) or B (vertical packages)? Re-evaluate before Stufe 2.                                                                                                                       | **decided 2026-10-05 (assumption, decided by the PO under the autonomy rules; revisable):** variant A (module folders inside the layer packages); re-evaluate B before Stufe 2 or the first extraction                                                                                                                                   |
| O-4 | Derived light views (LIC-01 to LIC-03) in `collection` (proposed) or in a module of their own (`lichtplan`)?                                                                                                    | **decided 2026-10-05 (assumption, decided by the PO under the autonomy rules; revisable):** derived light views (LIC-01 to LIC-03) stay in `collection`; split into a module of their own only if `collection` exceeds the size limits                                                                                                   |
| O-5 | PostgreSQL schema per module and per-module roles instead of one flat schema with an ownership register? Stronger enforcement, more migration/RLS work.                                                         | **decided 2026-10-05 (assumption, decided by the PO under the autonomy rules; revisable):** no PostgreSQL schema or role per module; the ownership register plus the gate (AB-9, AB-10, AB-14) is the enforcement                                                                                                                        |
| O-6 | Events: synchronous in-process in the same transaction (assumption) versus an outbox over the job queue.                                                                                                        | **decided 2026-10-05 (assumption, decided by the PO under the autonomy rules; revisable):** synchronous in-process events inside the same transaction; slow or external effects are jobs. Revisit with MON                                                                                                                               |
| O-7 | Should `equipment` be split (`equipment` / `recommendation`, the latter with affiliate rules)? Who depends on whom for EQU-12 (sharing with friends): `social` -> `equipment` or a release port in `equipment`? | **decided 2026-10-05 (assumption, decided by the PO under the autonomy rules; revisable):** `equipment` stays one module (affiliate rules stay labeled inside it); split when EQU is built if the dependency matrix needs it                                                                                                             |
| O-8 | Is `today` a module, or part of `care`?                                                                                                                                                                         | **decided 2026-10-05 (assumption, decided by the PO under the autonomy rules; revisable):** `today` is a read-only module of its own, as in the register                                                                                                                                                                                 |
| O-9 | Export names from the root barrel: prefixed names (as today) or namespaced re-exports (`light.zones...`)? Subpath exports `@pflanzendex/core/<module>` would need a change of AB-2.                             | **decided 2026-10-05 (assumption, decided by the PO under the autonomy rules; revisable):** prefixed names from the root barrel as today; no subpath exports, AB-2 stays unchanged                                                                                                                                                       |

Numbers in this ADR (module count, matrix) are a proposal, not measurements.

## Follow-up work (issues)

1. E-20 decision issue pointing to this ADR.
2. Enabler "Module boundary gate": module register, rules AB-7 to AB-14 in the boundary check and its tests, report of kernel size.
3. Enabler "Move existing code into modules": `kernel`, `account`, `catalog`, `light` (no behavior change).
4. Comment on #57 and #58: build after the cut is confirmed.
