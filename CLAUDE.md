# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

So far this repo holds **only a requirements specification** (German), in `PFLANZENSYSTEM-SPECS/`. There is no code, no build, and no tests here yet. The specs describe a plant-care system as it exists today in a separate **Obsidian vault**: an Obsidian dashboard built from `dataviewjs` blocks, scripts in `scripts/pflanzen/`, a `post-commit` hook, and design specs in `docs/superpowers/specs/`. Those vault paths are referenced throughout the specs but are **not in this repo**. Don't look for them here, and don't assume they exist next to this repo.

Start with `PFLANZENSYSTEM-SPECS/README.md` (index, status overview, key findings). Then read `00-Systemueberblick.md` (architecture, data model DM-01…DM-06, glossary).

## Spec conventions (keep when editing)

- One file per epic: BES (inventory), LIC (lights), PHA (care phases), WAC (growth/photos), BEH (treatments), WUN (wishlist), POK (Pokédex), MON (monitoring, planned only), SOZ (social, planned only), EQU (equipment and affiliate, planned only), QS (cross-cutting/NFRs). `10-Luecken-und-Backlog.md` holds findings `B-nn` and the prioritized backlog.
- IDs are stable and must never be renumbered: `US-<EPIC>-nn` user story, `FR-<EPIC>-nn` functional requirement, `DM-nn` data model, `NFR-nn` non-functional.
- Status markers: ✅ implemented, 🟡 partial/known deviation, ⬜ planned only. If you change a status, also update the status table in `README.md`.
- Acceptance criteria use a short Given/When/Then form.
- When sources conflict, this order wins: vault code, then the vault's `CLAUDE.md`, then the design specs.
- The specs are written in German, so write new content in German with the same terminology (Art, Exemplar, Steckling, Pflegephase, Vergeilung, Gefangen, Puffer …; see the glossary in `00`).

## Architecture of the described system (big picture)

- **Art vs. Exemplar:** an *Art* (species) note holds the knowledge, one note per species. An *Exemplar* note is one pot and holds only the values that differ from its Art. Lookup rule: an Exemplar field overrides the Art field of the same name (`p[k] ?? art[k]`).
- **Inputs go through UI, never raw YAML:** buttons and forms write frontmatter via `app.fileManager.processFrontMatter`. Everything derivable (ownership, phases, trends, lamp distribution) is computed live on render, so no second copy exists.
- **Pokédex pipeline:** `Arten.md` (hand-curated) is the input. Committing it fires the `post-commit` hook, which runs `build_pokedex.py` (OpenTree → Wikidata → Wikipedia → GBIF). That writes `Pokedex-Baum.json` (generated only, atomic writes, exit code 2 on network failure). `pokedex-core.js` holds pure logic and `pokedex.css` holds the styling. Ownership ("gefangen") is derived from the Exemplar notes and is never stored.
- **Lamp strings (DM-05) are hardcoded character-for-character** in several places. Any change has to be made everywhere (B-07).
- **Tests in the vault:** `node --test scripts/pflanzen/pokedex-core.test.js` and `pytest scripts/pflanzen/test_build_pokedex.py`. The care dashboard logic has no tests. Backlog item B-02 proposes extracting it into `pflanzen-core.js`, which is also a prerequisite for the MON bot.
- **Obsidian constraints (NFR-09):** expand UI inline instead of using `position: fixed`, and assign handlers directly instead of delegating through `closest()`. After editing external JS/CSS, reload the note.

## Design principles that drive requirements

These come from the vault's `System-Design-Prinzipien.md`, summarized in `09-Querschnitt-Qualitaet.md`. Never invent numbers: compare only against your own history or citable sources, and show "unbekannt" when a value is unknown. Never drop records silently. Every block must say what to do next. The human supplies only what only a human can supply. Raw sensor data must never enter the git-synced vault.
