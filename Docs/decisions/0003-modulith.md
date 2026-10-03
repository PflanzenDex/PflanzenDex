# 0003 · Modulith: one deployable, modules cut by domain with their own public interface

- **Status:** the decision "Modulith" is **accepted** (2026-10-03, decided by the project owner). The **module cut, the dependency matrix and the directory structure below are proposed** until the owner confirms them (open questions O-1 to O-9).
- **Changes:** adds E-20 (`Docs/PRODUKT-SPECS/16-Releases-und-Entscheidungen.md`) and the module rules AB-7 to AB-14 (`Docs/PRODUKT-SPECS/18-Architektur-und-Quality-Gates.md`, section "Modulgrenzen")
- **Refines:** E-01 (monorepo, `core` without I/O), FR-QG-04, FR-QG-05, P-02, P-03, P-04
- **Affects:** every epic that is built from now on (BES, PHA, WAC, BEH, WUN, POK, MON, SOZ, EQU, KI, ENT), `app/scripts/check-boundaries.mjs` (later, own issue)

## Context

Today the monorepo is cut by **layer**: `core` (pure domain logic), `db` (schema, migrations, adapters), `api` (HTTP), `web` (PWA). The rules AB-1 to AB-6 keep the layers apart (core has no I/O, api and web use `core` only through its package root, web never imports api or db). Nothing says how the **inside** of a layer is cut. The code that exists (ACC sign-in, operator role and review status, light zones and locations, idempotency) already sits in separate folders, but nothing stops the next epics from reaching into each other: BES needs the zone of a location, WUN needs the buffer per zone, POK derives ownership from Exemplare, SOZ reads other accounts, EQU binds lamps to zones, ENT reads half of the product. Without a rule, 14 product epics grow into one connected ball in which a change to the zone model breaks nine places.

The owner has decided that the product is a **Modulith** (modular monolith): one deployable, one database, modules cut by domain, each with its own public interface. This was not stated anywhere in the specs or issues before (a search for "Modulith" and "Monolith" found nothing).

Constraints that come from decisions already taken:

- P-03: writes only through validating operations. P-04: every user-owned row has `konto_id` and a row rule. The tenant guarantee must not get weaker through modules.
- One PostgreSQL, one numbered, forward-only migration sequence with checksums (TE-02, NFR-15).
- KI-R1 / AB-3: the AI layer calls only validating operations.
- AB-4: the Pokédex build job writes only into its tree store. AB-5: only the sharing layer reads other accounts' data.
- Small team (three start users, Stufe 1): no distributed system, no service mesh (R-01).

## Decision

### Decided (by the owner)

The product is built as a Modulith: one deployable (one API process, one database), fachlich cut modules, access between modules only through each module's public interface. Microservices are not a goal.

### Proposed (to be confirmed, status "vorgeschlagen")

#### 1. Module cut

Cut along the epics, but merged where two epics change together, share their data and are never useful alone. Technical building blocks are separate from domain modules.

| Module | Epics / stories | Owns (data) | Reasoning |
|---|---|---|---|
| `kern` (shared kernel) | none (TE-04, parts of TE-02) | `idempotenz`, the tenant anchor `konto(id)`, tenant functions | Operation engine (`definiereOperation`, `fuehreAus`), `Ergebnis`, error codes and texts, `Kontext`, idempotency port, validation helpers, tenant access (`mitKonto`), date helpers (NFR-08), operation registry. No domain knowledge. Strictly limited, see "Shared kernel". |
| `medien` (platform) | TE-05, FR-WAC photo rules, QG-D3 | `medium` (object reference, size, owner) | Object store, resizing, EXIF/GPS removal. Used by WAC, BES (picture), SOZ (shared photos). No domain meaning. |
| `jobs` (platform) | TE-06 | queue tables | PostgreSQL queue and job runner. Used by MON, POK (build job), KI orders. |
| `konto` | ACC (01-05), roles `betreiber`/`pruefer` | `kontodaten`, `konto_rolle`, `einladung` | Sign-in, profile, invitation, export and deletion orchestration, role grants. Roles reach other modules through `Kontext`, not through imports. |
| `katalog` | BES-01, BES-05, BES-10, DM-BES-01, review status (TE-08), POK-02 | `art`, `art_version`, `pruefvorgang` | The shared species catalog (the only data without an account, apart from the tree) with versions and review workflow. |
| `licht` | LIC-05 (and the rules LIC-04 as constants) | `lichtzone`, `standort` | Light zones and locations of an account. Defines the port `ZonenNutzung`. Stays at the bottom so that everything else may depend on it. |
| `bestand` | BES-02..04, 06..09, DM-BES-02..04, LIC-01..03 (derived light views) | `exemplar`, `pflegeprofil`, `exemplar_herkunft` | One pot of one owner, name rule, cutting, archive, care profile, "Hinweise" source. Also holds the derived light views (zone from Lux need, free space, lamp distance) because they need Exemplare and the catalog (see O-4). |
| `pflege` | PHA (01-04), BEH (01-04) | `behandlung` (phases are derived, not stored, FR-PHA) | "What should happen to this plant": care phase against location, due treatments. Merged because both are the plan-versus-reality of one Exemplar and both feed "Heute" and reminders. |
| `wachstum` | WAC (01-06) | `messung`, photo references | Measurement, trend, Vergeilung, photos. Separate from `pflege` because it carries the largest logic (trend, rate) and the photo pipeline; the two change for different reasons. |
| `wunschliste` | WUN (01-05), equipment wishes of EQU-08 | `wunsch` | Candidates, buffer per zone, path from purchase to plant. |
| `pokedex` | POK (01, 03, 06-12) | `taxon` (tree store, AB-4), `pokedex_stand` (seen state) | Cards, ownership ("Gefangen" is derived live, never stored), rank, milestones. Owns the tree store written by the build job. |
| `monitoring` | MON (01-08) | `erinnerung`, `giessprotokoll`, `sensor`, `messreihe`, `zustellkanal` | Reminders, watering log, sensors, delivery channels. Defines the port `AnlassQuelle`; care, growth and equipment deliver reminder reasons through it. |
| `equipment` | EQU (01-12) | `equipment`, `vorrat`, `empfehlung_*` | Equipment, needs derived from own data, recommendations (labeled). Sub-areas `bedarf` and `empfehlung` may become a second module later (O-7). |
| `sozial` | SOZ (01-13) | `freundschaft`, `freigabe`, `angebot`, `tausch`, `ereignis` | Friends, release, feed, exchange. The only module that reads other accounts' data, and only through the release layer (AB-5). |
| `entdecken` | ENT (01-08) | `vorschlag_entscheidung`, feature weights | Swipe suggestions into the wishlist. A pure consumer, nothing depends on it. |
| `heute` | no epic of its own (TE-07, P-09, US-BES-08) | none (read-only) | The "Heute" list and the central hints page: aggregates `Hinweis` and `Aufgabe` from the other modules through one `status` function. A read-only module so that no domain module has to know the others (R-04). |
| `ki-zugang` | KI (01-10) | `verbindung`, `auftrag`, `entwurf`, `ki_protokoll` | Thin adapter over the operation registry (AB-3, KI-R1). Depends only on `kern` and `konto`; it finds operations through the registry, never by importing domain modules. |

Not 1:1 with the 14 epics on purpose: ACC and parts of BES/POK/LIC are regrouped; QS and QG are cross-cutting rules, not modules; PHA+BEH merge; LIC splits into master data (`licht`) and derived views (`bestand`) to avoid a cycle with `bestand`.

#### 2. Dependency direction

`A -> B` means: code in A may import the public interface of B. Anything not marked is forbidden (AB-8). Reading the matrix by row: what a module may use.

| depends on → | kern | medien | jobs | konto | katalog | licht | bestand | pflege | wachstum | wunschl. | pokedex | monitoring | equipment | sozial | entdecken |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `medien`, `jobs` | x | | | | | | | | | | | | | | |
| `konto` | x | | | | | | | | | | | | | | |
| `katalog` | x | x | | | | | | | | | | | | | |
| `licht` | x | | | | | | | | | | | | | | |
| `bestand` | x | | | | x | x | | | | | | | | | |
| `monitoring` | x | | x | | | | x | | | | | | | | |
| `pflege` | x | | | | x | x | x | | | | | x | | | |
| `wachstum` | x | x | | | x | | x | | | | | x | | | |
| `wunschliste` | x | | | | x | x | x | | | | | | | | |
| `pokedex` | x | | x | | x | | x | | | | | | | | |
| `equipment` | x | | | | | x | x | | | x | | x | | | |
| `sozial` | x | x | | x | x | | x | | x | | x | x | | | |
| `entdecken` | x | | | | x | x | x | | x | x | x | | | | |
| `heute` | x | | | | | x | x | x | x | x | | x | | | |
| `ki-zugang` | x | | | x | | | | | | | | | | | |

Checked: the graph has no cycle. One possible build order: `kern`, `medien`, `jobs`, `konto`, `katalog`, `licht`, `bestand`, `monitoring`, `pflege`, `wachstum`, `wunschliste`, `pokedex`, `equipment`, `sozial`, `entdecken`, `heute`, `ki-zugang`. A new edge needs a change of this matrix in the same PR (reviewed), a cycle is always an error. Edges that point "up" are replaced by ports (next section), never by exceptions.

#### 3. Coupling in the other direction: ports and events

When a lower module needs something from a higher one, the **lower module defines the port** (an interface in its public interface) and the higher module implements it; the composition root (`api/src/app.ts`) wires them. Examples:

- `ZonenNutzung` (US-LIC-05): `licht` asks "who uses this zone?" before a zone is deleted. `bestand` (Exemplare, Arten' zone overrides) and `licht` itself (locations) each provide one source. Today the port exists with one source (locations) and the TODO "BES has to add one source each" is exactly this rule. The contract test with a stub stays; every implementer adds a test that it is registered.
- `AnlassQuelle` (`monitoring`): `pflege` (phase change, due treatment), `wachstum` (measurement overdue), `equipment` (maintenance) deliver reminder reasons. `monitoring` never imports them.
- `DatenQuelle` (`kern`): every module with user data provides export and deletion of its rows for US-ACC-04; `konto` orchestrates without knowing the modules.
- Operation registry (`kern`): every operation registers with its class (`lesen`/`Entwurf`/`schreiben`, FR-KI-12). `api` and `ki-zugang` use the registry.

**Events:** notifications about facts ("Exemplar angelegt", "Übergabe bestätigt") go through an in-process, typed event bus in `kern`, delivered **synchronously inside the same database transaction** by default (Annahme: this is what keeps P-03 and the tenant context intact and is the simplest thing that works; O-6). Slow or external effects (push, mail) are not events but jobs in the queue (`jobs`). The publisher defines the event type in its public interface. A feed (`sozial.ereignis`) is derived from events and from queries, never from another module's tables.

#### 4. Rules (see spec 18, AB-7 to AB-14)

1. Access only through the public interface (`index.ts`) of the other module, in every layer (AB-7).
2. Only edges of the matrix, no cycles (AB-8).
3. Every table belongs to exactly one module; SQL (select, join, update) only on the own tables; other data through a port (AB-9).
4. Foreign keys across modules only from a module to a module it may depend on, only to its key, and only in the tenant-safe composite form `(konto_id, id)`; the tenant anchor `konto(id)` is allowed for everyone (AB-10). This keeps the database guarantee that makes P-04 testable. It is the weakest point for later extraction. **One narrow, registered exception (O-2, decided 2026-10-03 by the project owner):** a *global reference table* (a table without `konto_id` that has a justified entry in `OHNE_KONTO_KENNUNG`; today only `katalog.art`) is listed with owner and reason in `GLOBAL_REFERENCE_TABLES` (`app/modules.config.mjs`). A module that may depend on the owner according to the matrix may point to its `(id)` with a plain foreign key, always `on delete restrict`. Why: a rule that exists only in a document is a wish (`Docs/principles/README.md`); the database, not a code path, guarantees that the species exists and cannot be deleted while in use (PRIN-006, P-04 stays testable; P-10: deleting a species in use fails instead of leaving a dangling reference). The exception is registered, justified (EX-1 principle: narrow, with a reason) and grows only through review of the register. The visibility check (private proposals of other accounts) stays in the operation. `art_name` and `art_version` are details of a species and are not targets.
5. The kernel is small, free of domain knowledge and may not import a module (AB-11).
6. Calling "upwards" only through ports/events of the lower module (AB-12).
7. Every module is registered in a module register (name, path, tables, allowed dependencies, ports); code or tables outside it fail the gate (AB-13).
8. A migration belongs to one module and touches only its tables, plus the kernel's (AB-14).

Not weakened: P-04 (`konto_id` + `mandantenschutz()` per table, the generic tenant test), AB-1 to AB-6 stay as they are.

#### 5. Shared kernel (limited)

Allowed in `kern`: things that every module needs and that mean nothing in the domain: operation engine and registry, `Ergebnis`/`Fehler` and the error-code format (texts per code stay with the owning module and are registered), `Kontext` (account id, roles, time zone), idempotency, tenant access, validation helpers, date helpers, the event bus, the generic ports `DatenQuelle`/`IdempotenzSpeicher`. Not allowed: any noun from the glossary (Art, Exemplar, Lichtzone, ...), constants of a domain (thresholds belong to their module, FR-QG-12/13), anything used by only one module. A candidate for the kernel needs a one-line reason in the PR and is counted; the number of kernel exports is reported by the gate (a measure, no threshold yet). The line count of `kern` is expected to stay small; a number is deliberately not fixed (no measured basis).

#### 6. Directory structure

Options:

- **A. Module folders inside the layer packages** (`core/src/<modul>/`, `db/src/<modul>/`, `api/src/<modul>/`, `web/src/<modul>/`). Same module name in every package. AB-1 to AB-6 stay valid unchanged (they are package rules); coverage, ESLint, build and the "every directory with code has an `index.ts`" rule (ST-c) keep working. Cost: a module is spread over four folders; module extraction means moving four directories; module rules need a checker that understands the folder name.
- **B. Vertical packages** (`packages/<modul>/{core,db,api,web}`). Best cohesion and the cleanest path to extraction; but AB-1 (purity of `core`) has to be re-expressed per folder, every package needs its own build/test config, and all existing tooling (boundary script, coverage ratchet, knip, ESLint overrides) would change while several tooling PRs are in flight.
- **C. Top-level `modules/<modul>/` next to `packages`.** Same costs as B without its benefit.

**Recommendation: A**, as the smallest step that makes the rules enforceable now, and re-evaluate B before Stufe 2 or before the first extraction (O-3). The module's public interface is `core/src/<modul>/index.ts` (operations, types, ports). The root barrel `core/src/index.ts` keeps re-exporting the public interfaces, so AB-2 (consumers import `@pflanzendex/core` only) stays valid; the module name is visible in the export names or in namespaced exports (O-9).

**Migrations:** one global, forward-only, checksummed sequence in `packages/db/migrations/` (one database, one order of application). The number stays global; the module is part of the file name: `0005_bestand_exemplar.sql` and a first line `-- modul: bestand` that the gate reads (AB-14). Existing files `0001..0004` are not renamed (an applied file must never change); a small map in the module register assigns them to modules (`0001` kern, `0002` konto+katalog, `0003` konto, `0004` licht+kern).

#### 7. Consequences for tests, coverage and gates

- **Tests** live next to the code in the module (`<name>.test.ts`). A module test may use only its own tables and stubs/fakes of the ports of its allowed dependencies; a "module in isolation" test composes a module with exactly its declared dependencies and proves that nothing else is imported.
- **Tenant tests (QG-D1):** stay generic over all tables. `fixtures.ts` is split per module and aggregated, so a new table without a fixture still fails. Tables in the register without an owner fail (AB-13).
- **Contract tests per port** (like the `ZonenNutzung` stub test): one shared test per port that every implementation must pass.
- **Coverage (QG-T1):** the report is split per module; the thresholds stay in the single gate configuration (FR-QG-18). Per-module thresholds are not set now (no measured basis; Annahme: start with the existing global values and ratchet per module once a module has code).
- **Traceability (QG-T4):** the story ID in the test name stays the only link. The module register maps epics to modules so that the report can group by module; a test in module X naming a story of epic Y (outside X) is reported as a hint.
- **Complexity/duplicates gates (QG-K\*):** unchanged; the diff principle applies per file.
- **Boundary gate:** `check-boundaries.mjs` gets the module rules (own issue). It must report rule ID, file, line and the violated edge (`bestand -> pflege`).

#### 8. Outlook on later extraction

Extraction is **not a goal**, only kept possible. What keeps it cheap: no cross-module joins, serializable port data, events instead of shared state, tables owned by one module, the isolated build job. Likely first candidates, in order of ease: the Pokédex build job (already isolated, AB-4), `medien`, `ki-zugang` (an adapter already), delivery in `monitoring`. What it would cost: dropping the composite foreign keys across modules (AB-10), replacing synchronous events with an outbox, one tenant mechanism per deployable (the row-level approach would have to travel with it). Nothing of this is planned; a concrete need (load, team size, separate release rhythm) has to be shown first.

## Existing code mapped to the cut

| Today | Module |
|---|---|
| `core/src/operationen/{operation,ergebnis,fehler,validierung,kanonisch,ports}.ts`, `core/src/meta` | `kern` |
| `db`: `mandant.ts`, `verbindung.ts`, `migrate*.ts`, `schema.ts`, `trennung.ts`, `idempotenz.ts`, `fixtures.ts` (split), tables `konto` (id only), `idempotenz` | `kern` |
| `core/src/konto`, `db/anmeldung.ts`, `api/src/auth`, `api/src/konto-routen.ts`, `web/src/auth`; tables `kontodaten`, `konto_rolle` | `konto` |
| `core/src/operationen/pruefung`, `db/pruefung.ts`; table `pruefvorgang` | `katalog` (the species table `art` arrives with BES-01) |
| `core/src/operationen/licht`, `db/licht-zonen.ts`, `db/licht-standorte.ts`, `api/src/licht-routen.ts`, `web/src/licht`; tables `lichtzone`, `standort` | `licht` |
| `core/src/operationen/beispiel` (demo standort) | removed or moved into test helpers of `kern` (not product code) |
| `api/src/fehler-http.ts`, `app.ts`, `main.ts` | `kern` (error mapping) and the composition root (`app.ts` wires modules and ports; it is the only place that may import every module) |

Open findings from the code: `pruefvorgang` references `objekt_art`/`objekt_id` without a foreign key (a polymorphic reference). Under AB-9/AB-10 that is a port in disguise: `katalog` owns the review status of its own objects only; other objects (if any) need their own port. `konto_rolle` is read by `rollen_des_kontos()`/`ist_pruefer()` (SQL functions): this is the pattern for a database-level port (a function owned by the module, granted to the app role) and is allowed under AB-9.

## Consequences

- Positive: changes stay local, ownership of data and rules is explicit, the AI layer is limited by construction, the hardest-to-undo decisions (tables, FKs) are made before the data exists.
- Negative: more ceremony per cross-module need (a port instead of a call), a risk of over-cutting for a three-user product (14 modules for a small team), and the gate work (own issue) must land before BES-01 and BES-02 to be useful.
- BES-01 (#57) and BES-02 (#58) are the first stories that cross modules (`bestand` -> `katalog`, `licht`). They should be built after the cut is confirmed, or they will have to be moved.
- The root `README` conventions ("Spec status and counters change in the same PR as the code") are unchanged. Spec counters in `README.md` are not affected (no new epic).

## Open questions

| ID | Question | Status |
|---|---|---|
| O-1 | Is the module cut above (17 modules, three of them technical: `kern`, `medien`, `jobs`) the right size, or should it be coarser (e.g. merge `pflege`+`wachstum`, `medien`+`kern`)? | open, owner to confirm |
| O-2 | Foreign keys across modules (AB-10): allowed in composite form (recommended, keeps the DB guarantee) or forbidden entirely (cleaner extraction, integrity then by port checks and delete guards)? | **decided 2026-10-03 (project owner):** tenant-safe `(konto_id, id)` on allowed dependencies stays the rule; plus one registered exception for global reference tables (plain `(id)`, `on delete restrict`, only `art`), see rule 4 |
| O-3 | Directory structure A (recommended) or B (vertical packages)? Re-evaluate before Stufe 2. | open |
| O-4 | Derived light views (LIC-01 to LIC-03) in `bestand` (proposed) or in a module of their own (`lichtplan`)? | open |
| O-5 | PostgreSQL schema per module and per-module roles instead of one flat schema with an ownership register? Stronger enforcement, more migration/RLS work. | open; not proposed now |
| O-6 | Events: synchronous in-process in the same transaction (Annahme) versus an outbox over the job queue. | open, revisit with MON |
| O-7 | Should `equipment` be split (`equipment` / `empfehlung`, the latter with affiliate rules)? Who depends on whom for EQU-12 (sharing with friends): `sozial` -> `equipment` or a release port in `equipment`? | open |
| O-8 | Is `heute` a module, or part of `pflege`? | open; proposed as a module |
| O-9 | Export names from the root barrel: prefixed names (as today) or namespaced re-exports (`licht.zonen...`)? Subpath exports `@pflanzendex/core/<modul>` would need a change of AB-2. | open |

Numbers in this ADR (module count, matrix) are a proposal, not measurements.

## Follow-up work (issues)

1. E-20 decision issue pointing to this ADR.
2. Enabler "Module boundary gate": module register, rules AB-7 to AB-14 in the boundary check and its tests, report of kernel size.
3. Enabler "Move existing code into modules": `kern`, `konto`, `katalog`, `licht` (no behavior change).
4. Comment on #57 and #58: build after the cut is confirmed.
