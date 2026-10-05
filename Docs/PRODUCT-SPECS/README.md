# PflanzenDex – Product Specification (Web App)

As of: 2026-10-02 · **Draft.** None of it is implemented. This spec describes the **own web app** as a product. The Obsidian vault (`../PLANT-SYSTEM-SPECS/`) was the **prototype**: it showed what works and is a reference and data source here, not an architecture requirement.

## How this spec relates to the prototype

|           | Prototype (`Docs/PLANT-SYSTEM-SPECS/`) | Product (this spec)                                        |
| --------- | -------------------------------------- | ---------------------------------------------------------- |
| Users     | one person                             | many people with accounts                                  |
| Storage   | Markdown + frontmatter in the vault    | server-side data storage, described technology-neutrally   |
| Interface | Dataview dashboard in Obsidian         | web app, mobile-first                                      |
| Input     | click forms, Claude in Claude Code     | forms **and** the keeper's AI client via an open interface |
| Social    | not present                            | core feature                                               |
| Statement | as-is state, derived from the code     | target state, requirements for the product                 |

What is taken over from the prototype: the **domain behavior** (phases, growth trend, etiolation, lamp logic, Pokédex, wishlist buffer). What is not taken over: file names, wikilinks, frontmatter keys, Dataview, `processFrontMatter`, the `post-commit` hook.

## Files

| File                                                                                 | Content                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [00-Product-Overview.md](00-Product-Overview.md)                                     | Vision, target group, actors, principles, domain model, glossary                                       |
| [01-Accounts-and-Onboarding.md](01-Accounts-and-Onboarding.md)                       | Epic ACC: account, sign-in, profile, invitation                                                        |
| [02-Collection.md](02-Collection.md)                                                 | Epic BES: species catalog, care profile, review, specimens, cutting, archive                           |
| [03-Light-and-Locations.md](03-Light-and-Locations.md)                               | Epic LIC: light zones, locations, distribution, position                                               |
| [04-Care-Phases.md](04-Care-Phases.md)                                               | Epic PHA: dormancy/growth phase, location reconciliation                                               |
| [05-Growth-and-Photos.md](05-Growth-and-Photos.md)                                   | Epic WAC: measurement, trend, etiolation, photos                                                       |
| [06-Treatments.md](06-Treatments.md)                                                 | Epic BEH: pests, diseases, courses of treatment                                                        |
| [07-Wishlist.md](07-Wishlist.md)                                                     | Epic WUN: purchase candidates, buffer, path to the plant                                               |
| [08-Pokedex.md](08-Pokedex.md)                                                       | Epic POK: collector cards, taxonomy, milestones                                                        |
| [09-Reminders-and-Sensors.md](09-Reminders-and-Sensors.md)                           | Epic MON: notifications, watering, sensors                                                             |
| [10-Social.md](10-Social.md)                                                         | Epic SOZ: friends, feed, swapping                                                                      |
| [11-Equipment-and-Recommendations.md](11-Equipment-and-Recommendations.md)           | Epic EQU: equipment, need, affiliate                                                                   |
| [12-AI-Assistant.md](12-AI-Assistant.md)                                             | Epic KI: AI access via an open interface, tasks, drafts, care by voice, profiles, photo assessment     |
| [13-Business-Case.md](13-Business-Case.md)                                           | Stages: for us, pays for itself, profit                                                                |
| [14-Cross-Cutting.md](14-Cross-Cutting.md)                                           | Epic QS: privacy, security, mobile, quality                                                            |
| [15-Migration-from-Prototype.md](15-Migration-from-Prototype.md)                     | Epic MIG: **dropped** (no import from the vault, IDs reserved)                                         |
| [16-Releases-and-Decisions.md](16-Releases-and-Decisions.md)                         | Release cut, technology draft, open decisions, non-goals                                               |
| [17-Discover.md](17-Discover.md)                                                     | Epic ENT: swipe suggestions from the catalog, matching light and thriving plants, filling the wishlist |
| [18-Architecture-and-Quality-Gates.md](18-Architecture-and-Quality-Gates.md)         | Epic QG: hooks, CI, structure rules, architecture boundaries, complexity, privacy gates, DoD           |
| [19-Development-Process-and-Automation.md](19-Development-Process-and-Automation.md) | Epic DEV: task runner, hooks, routines, skills, process, release, migrations, operations               |

## Conventions

- **Actors:** _plant keeper_, _friend_, _operator_, _AI client_, _system_. See `00-Product-Overview.md`.
- **IDs:** `US-<EPIC>-nn`, `FR-<EPIC>-nn`, `DM-<EPIC>-nn`, `NFR-nn`. Stories that come from the prototype **keep their ID** (e.g. `US-PHA-01`) so they can be compared. New stories get the next free number. Do not renumber IDs. The epic codes are historical abbreviations (partly from the German names, e.g. BES = collection, KI = AI assistant) and stay as they are.
- **Status** (product): ⬜ planned, 🟨 in progress, ✅ implemented. Currently everything is ⬜ except `US-ACC-01`, `US-ACC-03`, `US-LIC-05`, `FR-ACC-01`, `FR-ACC-03` and `FR-QG-06`, `FR-QG-19`, `FR-DEV-05`, `US-BES-03`, `US-BES-05`, `US-PHA-02`, `US-PHA-04`, `FR-PHA-04`, `US-BEH-01`, `US-BEH-02`, `US-BEH-03`, `US-BEH-04`, `FR-BEH-01`, `FR-BEH-02`, `FR-BEH-03`, `FR-BEH-04` and `US-DEV-10` (✅), `US-ACC-02`, `US-LIC-01`, `US-LIC-02`, `US-LIC-03`, `FR-LIC-02`, `FR-LIC-04`, `US-QG-03`, `US-QG-04`, `US-QG-06`, `US-QG-09`, `US-QS-03`, `US-DEV-01`, `US-DEV-08`, `FR-QG-09`, `FR-QG-21`, `FR-QG-22`, `FR-DEV-04`, `US-BES-01`, `US-BES-02`, `US-BES-04`, `US-BES-06`, `US-BES-07`, `US-BES-08`, `US-BES-09`, `US-BES-10`, `US-BES-11`, `US-PHA-01`, `US-PHA-03`, `US-POK-06`, `US-POK-07`, `US-POK-08`, `US-POK-09`, `US-ACC-05`, `US-WAC-01`, `US-WUN-01`, `US-WUN-03`, `FR-BES-01`, `FR-BES-02`, `FR-BES-03`, `FR-BES-04`, `FR-BES-05`, `FR-BES-11`, `FR-BES-14` and `NFR-08` (🟨; for `US-ACC-02` the effect of the two global switches (they are saved, but sharing and recommendations do not exist yet: SOZ-04, EQU-11) and the sending of reminders, with time, quiet hours and pause (US-MON-08); for `US-BES-01` the task for the AI client and the catalog build are missing, for `US-LIC-01` the catalog field for soft-leaved C3 plants and the use in the care profile (BES-09), for `US-LIC-02` the own zone field on the specimen (BES-04) and the wishlist, to which the hint on a tie only points in the text (WUN), for `US-LIC-03` adjustable thresholds (account setting; spec: defaults and adjustable, related FR-LIC-05), for `US-BES-02` the target location of the phase (PHA), for `FR-BES-04` the correction of an archived specimen in the UI (US-BES-11), for `US-BES-11` the entry point in the section "Archiv" (an archived specimen can be corrected through the API only) and the manual test protocol, for `US-BES-04` the feed entry "Eingetopft" for shared specimens (SOZ), for `US-BES-06` the photo (it comes with WAC-05 through the port), for `US-BES-07` the archiving on a swap (SOZ-11) and the evaluations that do not exist yet (treatments, Pokédex ownership, today list; they will filter with `isActive`), for `US-BES-08` the hints in the central today list (TE-07) and the deviations (QS-04), which do not exist yet, for `US-BES-09` the hint when the catalog changes a value I did not override (FR-BES-12, needs catalog versions), the wish as a trigger (WUN) and the reading of the watering intervals (US-MON-05), for `US-PHA-01` a dormancy period on the specimen itself, for `US-POK-06` the additions `var.`, `subsp.` and `f.` (they belong to the specimen extra, DM-BES-02, which does not exist yet; today only a cultivar in the catalog name becomes a chip) and the collector cards of the catalog tree (POK-01), for `US-POK-07` the photo (the latest measurement photo comes with WAC-05 through a port, the Wikipedia image with the taxonomy build, US-POK-03; neither exists yet, so no photo is shown, nothing is invented) while the catch date per species is derived (`caught_at`, else creation date as "≈", else "unknown"; earliest across active and archived specimens), for `US-POK-08` search (species, German name, genus, family) and the sorts by family (collapsible, `n / unknown` because the family total needs the tree), alphabet and catch date work on the caught species; missing: the filter "Missing" and the species list of the tree (catalog tree, US-POK-03), the search over the order (taxonomy, US-POK-03) and the genus species count (GBIF, US-POK-03), so the filter "Species-poor" is disabled and the sort by species count leaves everything unknown and alphabetical (nothing is invented, P-08), for `US-POK-09` the detail view of a caught species works (name, genus, family, status, specimen count, chips, catch date, source of the catalog, link to the species profile); missing: the larger image and the full short text (Wikipedia, taxonomy build, US-POK-03; shown as "no image" and "unknown"), the Missing cards with their actions "to the wishlist" (US-WUN, `Source: Pokédex`) and "Friend has it" (US-SOZ-07) because there is no species list of the tree and no wishlist or friends yet, and the source link of the taxonomy build (today the catalog's own source field), for `US-ACC-05` the automatic cost measurement (NFR-16, TE-10; the cost per user comes from a manual monthly figure of the operator until then) and closing the self-registration at the sign-in service itself (Keycloak realm setting, decided 2026-10-05; runbook `Docs/operations/invitation-phase.md`, needs a public deployment with its own sign-in service; the app already creates no account without a valid code), for `US-WUN-01` the candidate list works (open wishes sorted by the stock of the target zone 2 to 4, unknown zone last, picture link with source, German name, zone with stock, difficulty, reasoning and the reason for the rank; recording a wish); missing: displaying the picture (needs local storage, US-WUN-04; by privacy decision only a link is shown today, P-05), the per-candidate action "discarded" (US-WUN-05; "bought" exists since US-WUN-03) and the hints for wishes with a zone outside 2 to 4 (FR-WUN-03), for `US-WUN-03` the guided path from the purchase to the plant (US-WUN-05), an undo and the manual test protocol, for `US-WAC-01` the photo as well as rate and trend in the view (US-WAC-03), for `NFR-08` the lint rule (QG-D4), for the `FR-BES` the reviewer page; for `US-BES-10` the editing of a rejected proposal by its creator, the taxonomy build after approval (US-POK-03), the re-pointing of wishes (WUN) and the AI connection that guards FR-BES-06 only through its missing role (KI); for `FR-BES-14` the grant of rights in the terms of use (E-12); for `US-QG-06`/`FR-DEV-04` register and validator exist, report-before-blocking, ratchet and usefulness check are missing; for `US-QG-03` the structure script is `make layout` (FR-QG-21; the marker exceptions of FR-QG-04 are replaced by the baseline), for `US-QG-09` the `make layout-fix` target (the tool exists as `npm run layout-fix`) and the check that the children of a module root are the modules of `modules.config.mjs` are missing, for `FR-QG-21` the target directories (FR-QG-23), for `FR-QG-22` the touch-it rule, for `US-QS-03` the background jobs and the redelivery of buffered write actions, for `US-DEV-01` `test-e2e`, `db-seed`, `pokedex-build` and `clean-ports` are missing, for `US-DEV-08` an owner per epic in `CODEOWNERS` and a CI gate for the claim, which is checked only locally today) as well as whatever the technical enablers (TE) provide.
- **Prototype column** per story: `✅` tried in the prototype, `🟡` partly in the prototype, `neu` (new) not in the prototype. It says how well the behavior is already proven, not whether the web app can do it.
- **Acceptance criteria** in short Given/When/Then form. They are meant as tests (NFR-QS-08).
- **Technology-neutral:** the spec names behavior, data and limits, no frameworks. Technology decisions are in `16-Releases-and-Decisions.md` (E-nn).
- **No invented numbers:** thresholds and amounts are assumptions and marked as such.

## Status overview

| Epic                    | Stories | tried in the prototype | new    |
| ----------------------- | ------- | ---------------------- | ------ |
| ACC Accounts            | 5       | 0                      | 5      |
| BES Collection          | 11      | 8                      | 3      |
| LIC Light and locations | 5       | 4                      | 1      |
| PHA Care phases         | 4       | 4                      | 0      |
| WAC Growth/photos       | 6       | 6                      | 0      |
| BEH Treatments          | 4       | 4                      | 0      |
| WUN Wishlist            | 5       | 5                      | 0      |
| POK Pokédex             | 10      | 10                     | 0      |
| MON Reminders/sensors   | 8       | 0                      | 8      |
| SOZ Social              | 13      | 0                      | 13     |
| EQU Equipment           | 12      | 0                      | 12     |
| KI AI access            | 10      | 3                      | 7      |
| QS Cross-cutting        | 7       | 6                      | 1      |
| MIG Migration (dropped) | 0       | 0                      | 0      |
| ENT Discover            | 8       | 0                      | 8      |
| QG Quality gates        | 9       | 0                      | 9      |
| DEV Development process | 10      | 0                      | 10     |
| **Total**               | **127** | **50**                 | **77** |

## Replacing existing documents

These documents in `Docs/PLANT-SYSTEM-SPECS/` are **valid in terms of domain content but technically outdated** insofar as they assume the vault as the source of truth. From now on this spec is authoritative:

| Old document                         | Is replaced by                        | What is outdated                                                                                              |
| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `11-Social.md`                       | `10-Social.md`                        | "Hub", vault as truth (FR-SOZ-02), frontmatter fields                                                         |
| `12-Business-Case.md`                | `13-Business-Case.md`                 | Stage 1 in Obsidian, Obsidian hurdle                                                                          |
| `12-Target-Architecture-AI-first.md` | `16-Releases-and-Decisions.md`        | ADR-01 (vault stays truth), Markdown adapter, story "Own data, no platform lock-in" (ARC-05 in the prototype) |
| `13-Equipment-and-Affiliate.md`      | `11-Equipment-and-Recommendations.md` | Equipment notes in the vault, `processFrontMatter`                                                            |

Taken over from the target architecture remain: the guiding principles P-01 to P-06 (see `00-Product-Overview.md`), multi-tenancy from the start, PWA as the first interface and "specs are executable".
