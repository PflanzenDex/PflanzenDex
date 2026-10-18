# PflanzenDex – Product Specification (Web App)

As of: 2026-10-02 · **Draft.** None of it is implemented. This spec describes the **own web app** as a product. The Obsidian vault (`../prototype/`) was the **prototype**: it showed what works and is a reference and data source here, not an architecture requirement.

## How this spec relates to the prototype

|           | Prototype (`docs/specs/prototype/`) | Product (this spec)                                        |
| --------- | ----------------------------------- | ---------------------------------------------------------- |
| Users     | one person                          | many people with accounts                                  |
| Storage   | Markdown + frontmatter in the vault | server-side data storage, described technology-neutrally   |
| Interface | Dataview dashboard in Obsidian      | web app, mobile-first                                      |
| Input     | click forms, Claude in Claude Code  | forms **and** the keeper's AI client via an open interface |
| Social    | not present                         | core feature                                               |
| Statement | as-is state, derived from the code  | target state, requirements for the product                 |

What is taken over from the prototype: the **domain behavior** (phases, growth trend, etiolation, lamp logic, Pokédex, wishlist buffer). What is not taken over: file names, wikilinks, frontmatter keys, Dataview, `processFrontMatter`, the `post-commit` hook.

## Files

| File                                                                                 | Content                                                                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [00-Product-Overview.md](00-product-overview.md)                                     | Vision, target group, actors, principles, domain model, glossary                                                        |
| [01-Accounts-and-Onboarding.md](01-accounts-and-onboarding.md)                       | Epic ACC: account, sign-in, profile, invitation                                                                         |
| [02-Collection.md](02-collection.md)                                                 | Epic BES: species catalog, enrichment from sources, corrections, care profile, review, specimens, cutting, archive      |
| [03-Light-and-Locations.md](03-light-and-locations.md)                               | Epic LIC: light zones, locations, distribution, position                                                                |
| [04-Care-Phases.md](04-care-phases.md)                                               | Epic PHA: dormancy/growth phase, location reconciliation                                                                |
| [05-Growth-and-Photos.md](05-growth-and-photos.md)                                   | Epic WAC: measurement, trend, etiolation, photos                                                                        |
| [06-Treatments.md](06-treatments.md)                                                 | Epic BEH: pests, diseases, courses of treatment                                                                         |
| [07-Wishlist.md](07-wishlist.md)                                                     | Epic WUN: purchase candidates, buffer, path to the plant                                                                |
| [08-Pokedex.md](08-pokedex.md)                                                       | Epic POK: collector cards, taxonomy, milestones                                                                         |
| [09-Reminders-and-Sensors.md](09-reminders-and-sensors.md)                           | Epic MON: notifications, watering, sensors                                                                              |
| [10-Social.md](10-social.md)                                                         | Epic SOZ: friends, feed, swapping                                                                                       |
| [11-Equipment-and-Recommendations.md](11-equipment-and-recommendations.md)           | Epic EQU: equipment, need, affiliate                                                                                    |
| [12-AI-Assistant.md](12-ai-assistant.md)                                             | Epic KI: AI access via an open interface, tasks, drafts, care by voice, profiles, photo assessment                      |
| [13-Business-Case.md](13-business-case.md)                                           | Stages: for us, pays for itself, profit                                                                                 |
| [14-Cross-Cutting.md](14-cross-cutting.md)                                           | Epic QS: privacy, security, mobile, quality                                                                             |
| [15-Migration-from-Prototype.md](15-migration-from-prototype.md)                     | Epic MIG: **dropped** (no import from the vault, IDs reserved)                                                          |
| [16-Releases-and-Decisions.md](16-releases-and-decisions.md)                         | Release cut, technology draft, open decisions, non-goals                                                                |
| [17-Discover.md](17-discover.md)                                                     | Epic ENT: swipe suggestions from the catalog, matching light and thriving plants, filling the wishlist                  |
| [18-Architecture-and-Quality-Gates.md](18-architecture-and-quality-gates.md)         | Epic QG: hooks, CI, structure rules, architecture boundaries, complexity, privacy gates, DoD                            |
| [19-Development-Process-and-Automation.md](19-development-process-and-automation.md) | Epic DEV: task runner, hooks, routines, skills, process, release, migrations, operations                                |
| [20-achievements.md](20-achievements.md)                                             | Epic ACH: achievements for care and growth, care rhythm, personal records, anniversaries, year in review, calm mode     |
| [21-swipe-matching.md](21-swipe-matching.md)                                         | Epic TAU: swipe matching of friends' swap offers against the own wishlist, yes/no/later, fits both ways                 |
| [22-introduction-and-unlocking.md](22-introduction-and-unlocking.md)                 | Epic ONB: playful introduction, first plant first, keeper style, staged unlocking with visible locks, function overview |

## Conventions

- **Actors:** _plant keeper_, _friend_, _operator_, _AI client_, _system_. See `00-Product-Overview.md`.
- **IDs:** `US-<EPIC>-nn`, `FR-<EPIC>-nn`, `DM-<EPIC>-nn`, `NFR-nn`. Stories that come from the prototype **keep their ID** (e.g. `US-PHA-01`) so they can be compared. New stories get the next free number. Do not renumber IDs. The epic codes are historical abbreviations (partly from the German names, e.g. BES = collection, KI = AI assistant) and stay as they are.
- **Status** (product): ⬜ planned, 🟨 in progress, ✅ implemented. The status of each story is in the heading of its section (`### US-… · ✅`), of each requirement in the last column of its row. The counts per epic are generated in the table below; do not list IDs here.
- **Prototype column** per story: `✅` tried in the prototype, `🟡` partly in the prototype, `neu` (new) not in the prototype. It says how well the behavior is already proven, not whether the web app can do it.
- **Acceptance criteria** in short Given/When/Then form. They are meant as tests (NFR-QS-08).
- **Technology-neutral:** the spec names behavior, data and limits, no frameworks. Technology decisions are in `16-Releases-and-Decisions.md` (E-nn).
- **No invented numbers:** thresholds and amounts are assumptions and marked as such.

## Status overview

The table is generated from the spec files: `node app/tools/dev/agent/spec-status.mjs` rewrites it (`--check` reports a stale table). Each PR changes only the row of its own epic.

<!-- spec-status:start (generated by app/tools/dev/agent/spec-status.mjs, do not edit by hand) -->

| Epic                           | Stories | ✅     | 🟨      | ⬜     | Requirements ✅ · 🟨 · ⬜ | Tried in the prototype | New     |
| ------------------------------ | ------- | ------ | ------- | ------ | ------------------------- | ---------------------- | ------- |
| ACC Accounts                   | 6       | 3      | 2       | 1      | 2 · 0 · 4                 | 0                      | 6       |
| BES Collection                 | 16      | 2      | 14      | 0      | 0 · 8 · 13                | 8                      | 8       |
| LIC Light and locations        | 5       | 4      | 1       | 0      | 0 · 5 · 1                 | 4                      | 1       |
| PHA Care phases                | 4       | 2      | 2       | 0      | 1 · 0 · 5                 | 4                      | 0       |
| WAC Growth/photos              | 6       | 4      | 2       | 0      | 5 · 0 · 1                 | 6                      | 0       |
| BEH Treatments                 | 4       | 4      | 0       | 0      | 4 · 0 · 2                 | 4                      | 0       |
| WUN Wishlist                   | 5       | 0      | 5       | 0      | 2 · 0 · 5                 | 5                      | 0       |
| POK Pokédex                    | 12      | 0      | 11      | 1      | 0 · 0 · 11                | 10                     | 2       |
| MON Reminders/sensors          | 8       | 0      | 6       | 2      | 0 · 0 · 8                 | 0                      | 8       |
| SOZ Social                     | 13      | 3      | 10      | 0      | 1 · 0 · 10                | 0                      | 13      |
| EQU Equipment                  | 12      | 0      | 11      | 1      | 0 · 0 · 10                | 0                      | 12      |
| KI AI access                   | 10      | 0      | 9       | 1      | 0 · 0 · 13                | 3                      | 7       |
| QS Cross-cutting               | 14      | 0      | 10      | 4      | 0 · 0 · 0                 | 6                      | 8       |
| MIG Migration (dropped)        | 0       | 0      | 0       | 0      | 0 · 0 · 0                 | 0                      | 0       |
| ENT Discover                   | 9       | 0      | 8       | 1      | 0 · 0 · 9                 | 0                      | 9       |
| QG Quality gates               | 9       | 0      | 7       | 2      | 2 · 5 · 16                | 0                      | 9       |
| DEV Development process        | 12      | 1      | 9       | 2      | 1 · 1 · 7                 | 0                      | 12      |
| ACH Achievements               | 8       | 7      | 1       | 0      | 0 · 0 · 0                 | 0                      | 8       |
| TAU Swipe matching             | 7       | 0      | 3       | 4      | 1 · 2 · 7                 | 0                      | 7       |
| ONB Introduction and unlocking | 8       | 5      | 3       | 0      | 1 · 0 · 9                 | 0                      | 8       |
| **Total**                      | **168** | **35** | **114** | **19** |                           | **50**                 | **118** |

<!-- spec-status:end -->

## Replacing existing documents

These documents in `docs/specs/prototype/` are **valid in terms of domain content but technically outdated** insofar as they assume the vault as the source of truth. From now on this spec is authoritative:

| Old document                         | Is replaced by                        | What is outdated                                                                                              |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `11-Social.md`                       | `10-Social.md`                        | "Hub", vault as truth (FR-SOZ-02), frontmatter fields                                                         |
| `12-Business-Case.md`                | `13-Business-Case.md`                 | Stage 1 in Obsidian, Obsidian hurdle                                                                          |
| `12-Target-Architecture-AI-first.md` | `16-Releases-and-Decisions.md`        | ADR-01 (vault stays truth), Markdown adapter, story "Own data, no platform lock-in" (ARC-05 in the prototype) |
| `13-Equipment-and-Affiliate.md`      | `11-Equipment-and-Recommendations.md` | Equipment notes in the vault, `processFrontMatter`                                                            |

Taken over from the target architecture remain: the guiding principles P-01 to P-06 (see `00-Product-Overview.md`), multi-tenancy from the start, PWA as the first interface and "specs are executable".
