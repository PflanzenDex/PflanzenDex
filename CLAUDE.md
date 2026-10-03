# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

This repo holds the **specs** (German) and, as decided in E-05 (`Docs/PRODUKT-SPECS/16-Releases-und-Entscheidungen.md`), will also hold the **app code under `/app`**. All documentation lives under `/Docs`: the two spec sets below and, next to them, the process documentation (principles register, ADRs, runbooks, pitfalls: `Docs/principles/`, `Docs/decisions/`, `Docs/operations/`, `Docs/pitfalls/`). `app/` holds the TypeScript monorepo skeleton (`core`, `api`, `web`; see `app/README.md`). All tasks go through the root `Makefile`: `make help` lists them, `make ci` runs every gate (lint, typecheck, architecture boundaries, format, tests, build). There are two spec sets:

| Folder | Describes | Status semantics |
|---|---|---|
| `Docs/PRODUKT-SPECS/` | **The product:** the PflanzenDex web app (multi-user, mobile-first PWA, shared species catalog, social, AI assistant). This is the authoritative spec for new work. | Everything ⬜ (planned). Each story also carries a "Prototyp" column (✅/🟡 tried in the vault, or `neu`). |
| `Docs/PFLANZENSYSTEM-SPECS/` | **The prototype:** the as-is state of a single-user Obsidian vault (`dataviewjs` dashboard, `scripts/pflanzen/`, `post-commit` hook). Its `11`–`13` are superseded by `PRODUKT-SPECS` (see the replacement table in `Docs/PRODUKT-SPECS/README.md`). | ✅/🟡/⬜ = implemented in the vault, derived from vault code. |

The vault paths referenced in the prototype specs (`02-Areas/…`, `scripts/pflanzen/…`, `docs/superpowers/specs/…`) are **not in this repo**.

Start with `Docs/PRODUKT-SPECS/README.md` (index, conventions, replacement table), then `Docs/PRODUKT-SPECS/00-Produktueberblick.md` (principles P-01…P-11, domain model, glossary) and `16-Releases-und-Entscheidungen.md` (release cut R0–R6, open decisions E-nn, non-goals).

## Language

- **German:** product specs (`Docs/PRODUKT-SPECS/`, `Docs/PFLANZENSYSTEM-SPECS/`), the glossary, domain code identifiers (`konto`, `exemplar`, `mitKonto`, …), the app UI and the roadmap issues that mirror the specs.
- **English:** everything in the tooling and process layer: scripts, workflows, Makefile, hooks, config comments, `app/README.md`, ADRs, runbooks, PR/issue templates, labels, branch names, commit messages, PR titles and descriptions.
- Never mix languages within one file. When you touch a tooling file that is still German, translate it completely. Dated records (`Docs/spikes/`, `Docs/testprotokolle/`) stay as written.

## Spec conventions (keep when editing)

- **New features go into `Docs/PRODUKT-SPECS/`.** Only touch `Docs/PFLANZENSYSTEM-SPECS/` to correct the description of the vault's actual state.
- Product IDs: `US-<EPIC>-nn`, `FR-<EPIC>-nn`, `DM-<EPIC>-nn`, `NFR-nn`, decisions `E-nn`. Stories taken over from the prototype **keep their prototype ID** so the two can be compared. IDs are never renumbered.
- Product epics: ACC, BES, LIC, PHA, WAC, BEH, WUN, POK, MON, SOZ, EQU, KI, QS, ENT (`17-Entdecken.md`, swipe suggestions from the catalog into the wishlist).
- When adding a product epic: new numbered file, then update the file and status tables in `Docs/PRODUKT-SPECS/README.md`, cross-reference the affected epics, add glossary terms to `00`, and place it in the release cut in `16`.
- Product specs are **technology-neutral**: behavior, data and limits. Technology choices belong in `16` as decisions.
- Acceptance criteria use a short Gegeben/Wenn/Dann form and are meant to become tests (P-06).
- Write in German and use the glossary terms (Art, Exemplar, Steckling, Lichtzone, Pflegephase, Vergeilung, Gefangen, Puffer, Wunsch …).
- Numbers that are not measured or sourced must be marked as assumptions ("Annahme", "Startwert").

## Git workflow (E-13)

- `main` holds the finished, released product; `dev` holds the current development state. Neither gets direct commits.
- Every change lives on a dedicated short-lived branch (one task, one worktree) and enters `dev` through a pull request. `dev` collects changes until a release; then `dev` goes into `main` through a pull request.
- Commit messages follow Conventional Commits (type and scope from the epics, e.g. `feat(soz)`), `docs:` for documentation. Spec status and counters in `Docs/PRODUKT-SPECS/README.md` change in the same PR as the code.
- The product epic MIG (import from the vault) was dropped; its IDs stay reserved.

## Principles that shape every requirement

From `Docs/PRODUKT-SPECS/00-Produktueberblick.md`:

- **P-01:** the AI judges, the code computes and writes.
- **P-03:** writes go only through validating operations.
- **P-04/P-05:** multi-tenant from day one, and private by default.
- **P-08:** no invented numbers. Compare against the user's own history or citable sources (GBIF, Wikipedia), and show "unbekannt" when a value is unknown.
- **P-09:** every view says what to do next.
- **P-10:** nothing disappears silently.

Recurring consequences:

- No comparisons against species averages.
- Etiolated growth ("Vergeilung") never counts as success.
- Leaderboards and rankings between friends are excluded.
- Affiliate recommendations appear only for a derived need and are always labeled (EQU).

## Domain big picture

- **Art vs. Exemplar:** an Art (species) lives once in a shared catalog. An Exemplar is one pot owned by a user. An Exemplar field overrides the same field on its Art.
- **Lichtzone / Standort:** light zones and locations are entities. Zone 1 is cutting light; zones 2–4 are for adult plants.
- **Derived data:** Pokédex ownership ("gefangen"), care phases, growth trends and zone distribution are derived live and never stored.
- **Pokédex catalog:** built by a background job (OpenTree → Wikidata → Wikipedia → GBIF). The prototype's `build_pokedex.py` (73 tests) and `pokedex-core.js` (66 tests) are reuse candidates (E-01).
