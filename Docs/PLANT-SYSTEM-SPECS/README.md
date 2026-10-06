# Plant System – User Stories & Requirements

As of: 2026-10-02 · Derived from the **as-is state** of the vault (dashboard, notes, scripts, hook, tests, existing design specs). No new design: it describes what the system does today, what is planned and where the as-is state and the documentation diverge.

> **Note (2026-10-02):** this spec describes the **prototype** (Obsidian vault, as-is state). The product is the own web app; its requirements are in [`../PRODUCT-SPECS/`](../PRODUCT-SPECS/README.md). Social, business case, target architecture and equipment (`11` to `13`) are revised there; here they only count as a draft from the vault's point of view.
>
> The vault uses German names (note names, frontmatter keys such as `Lateinischer_Name`, lamp strings). They are kept verbatim in backticks because they describe the real vault files; the prose around them is English.

## Files

| File                                                                             | Content                                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [00-System-Overview.md](00-System-Overview.md)                                   | Goal, actors, architecture, components, data model, glossary                          |
| [01-Collection-Species-and-Specimens.md](01-Collection-Species-and-Specimens.md) | Epic BES: species notes, specimens, creating, cutting, archive                        |
| [02-Light-and-Lamps.md](02-Light-and-Lamps.md)                                   | Epic LIC: lamp levels, assignment, distribution, position                             |
| [03-Care-Phases.md](03-Care-Phases.md)                                           | Epic PHA: dormancy/growth phase, location reconciliation                              |
| [04-Growth-and-Photos.md](04-Growth-and-Photos.md)                               | Epic WAC: measurement, trend, etiolation, photo assessment                            |
| [05-Treatments.md](05-Treatments.md)                                             | Epic BEH: pests, diseases, courses of treatment                                       |
| [06-Wishlist.md](06-Wishlist.md)                                                 | Epic WUN: purchase candidates, buffer check, research                                 |
| [07-Pokedex.md](07-Pokedex.md)                                                   | Epic POK: collector cards, taxonomy tree, milestones                                  |
| [08-Monitoring-and-Sensors.md](08-Monitoring-and-Sensors.md)                     | Epic MON: bot reminders, watering, sensors (**planned**)                              |
| [09-Cross-Cutting-Quality.md](09-Cross-Cutting-Quality.md)                       | Epic QS: non-functional requirements, principles check                                |
| [11-Social.md](11-Social.md)                                                     | Epic SOZ: friends, feed "New among friends", swapping (**planned**)                   |
| [13-Equipment-and-Affiliate.md](13-Equipment-and-Affiliate.md)                   | Epic EQU: track equipment/lamps, derive need, affiliate recommendations (**planned**) |
| [12-Business-Case.md](12-Business-Case.md)                                       | Product stages: for us, pays for itself, profit; assumptions and metrics              |
| [10-Gaps-and-Backlog.md](10-Gaps-and-Backlog.md)                                 | Findings (as-is ≠ docs, defects, data gaps) and prioritized backlog                   |
| [12-Target-Architecture-AI-first.md](12-Target-Architecture-AI-first.md)         | Target architecture: AI-first, tech stack, hub proposal for E-SOZ-01 (**draft**)      |

## Conventions

- **Actors:** _plant keeper_ (the user), _friend_ (another plant keeper, epic SOZ only), _operator_ (whoever runs the system and manages partner programs, epic EQU only), _Claude_ (assistant in Claude Code or chat), _system_ (hook, script, Dataview block, bot). See `00-System-Overview.md`.
- **IDs:** `US-<EPIC>-nn` user story, `FR-<EPIC>-nn` functional requirement, `DM-nn` data model, `NFR-nn` non-functional. IDs are stable, do not renumber.
- **Status per story/requirement:**
  - ✅ implemented and present in the vault
  - 🟡 partly implemented or with a known deviation
  - ⬜ planned, not implemented (spec/draft only)
- **Acceptance criteria** are written in short Given/When/Then form and checked against the code where the status is ✅.
- **Source** names the file the item was derived from. In case of a contradiction the code applies, then `CLAUDE.md`, then the design specs in `docs/superpowers/specs/`.

## Status overview

| Epic             | Stories | ✅     | 🟡    | ⬜     |
| ---------------- | ------- | ------ | ----- | ------ |
| BES Collection   | 8       | 7      | 1     | 0      |
| LIC Light        | 4       | 4      | 0     | 0      |
| PHA Care phases  | 4       | 4      | 0     | 0      |
| WAC Growth/photo | 7       | 6      | 1     | 0      |
| BEH Treatments   | 4       | 4      | 0     | 0      |
| WUN Wishlist     | 5       | 4      | 1     | 0      |
| POK Pokédex      | 13      | 12     | 1     | 0      |
| MON Monitoring   | 7       | 0      | 0     | 7      |
| SOZ Social       | 13      | 0      | 0     | 13     |
| EQU Equipment    | 12      | 0      | 0     | 12     |
| QS Cross-cutting | 6       | 4      | 2     | 0      |
| **Total**        | **83**  | **45** | **6** | **32** |

## Figures of the as-is state (2026-10-02)

- 13 species notes, 17 specimen notes (of which 1 cutting), 2 archived plants (`04-Archive/Pflanzen/`)
- Lamp distribution of the species: lamp 2 ×8, lamp 3 ×4, lamp 4 ×1
- Pokédex: 215 species in `Arten.md`, 26 orders in the tree, 0 resolution errors (tree as of 2026-09-29)
- Own species in the Pokédex: 11 of 13 count as caught (`Hippeastrum` and `Parodia sp.` without species epithet)
- Wishlist: 8 open candidates (lamp 2 ×3, lamp 3 ×2, lamp 4 ×3), buffer check currently without warning
- Tests: `node --test scripts/pflanzen/pokedex-core.test.js` 66/66, `pytest scripts/pflanzen/test_build_pokedex.py` 73/73 (run on 2026-10-02)
- No test for the Dataview logic of the plant dashboard (it lives inline in 8 `dataviewjs` blocks)

## Most important findings (details in `10-Gaps-and-Backlog.md`)

1. The monitoring/reminder concept (bot, watering log, sensors) exists only as a spec; in the bot and in the notes there is no code and no fields for it. The dashboard is still a pure pull system.
2. The growth input writes the date as UTC (`toISOString`); between 00:00 and 02:00 local time the measurement lands on the previous day.
3. The dashboard logic (species tables, phases, trend, lamp counters) is a copy in several blocks without tests, unlike the Pokédex (`pokedex-core.js`) and the finances (`finanz-core.js`).
4. Spec and as-is state differ: the v2/v3 specs describe silhouettes and name masking for missing species, the code and `CLAUDE.md` deliberately show everything openly. The dashboard text says "12 species", there are 13.
5. `Schwierigkeit` has two scales: text (`Einfach/Medium/Schwer`) in species notes and wishlist, number 1–3 in `Arten.md`.
