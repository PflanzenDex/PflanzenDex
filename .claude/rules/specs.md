---
paths:
  - "docs/specs/**"
---

# Rules for the specs

- New features go into `docs/specs/product/`, the authoritative spec for new work. Touch `docs/specs/prototype/` only to correct the description of the vault's actual state.
- The prototype specs describe the single-user Obsidian vault as it is (`dataviewjs` dashboard, `scripts/pflanzen/`, `post-commit` hook); their status ✅/🟡/⬜ means implemented in the vault, derived from vault code. Their `11`–`13` are superseded by `docs/specs/product/` (replacement table in `docs/specs/product/readme.md`). The vault paths they reference (`02-Areas/…`, `scripts/pflanzen/…`, `docs/superpowers/specs/…`) are not in this repo.
- Product stories carry a "Prototype" column (✅/🟡 tried in the vault, or `new`).
- Write new and touched text by `docs/writing-english.md` (short sentences, active voice, avoid list; E-32).
- Write in English and use the glossary terms from `00-product-overview.md` (Species, Specimen, Cutting, Light zone, Care phase, Etiolation, Caught, Buffer, Wish, ...).
- IDs (`US-<EPIC>-nn`, `FR-`, `DM-`, `NFR-`, `E-nn`) are never renumbered or reused. Stories taken from the prototype keep their prototype ID so the two can be compared. The epic codes and their files are the index in `readme.md`; the dropped epic MIG keeps its IDs reserved.
- Specs are technology-neutral: behavior, data and limits. Technology choices are decisions in `16-releases-and-decisions.md`.
- Acceptance criteria use Given/When/Then and are meant to become tests (P-06).
- Numbers that are neither measured nor sourced are marked "assumption" or "starting value".
- Status symbols: ⬜ planned, 🟨 in progress, ✅ done. Change the status and the counters in `readme.md` in the same PR as the code.
- A new epic needs: a numbered file, README tables updated, cross-references, glossary terms in `00`, a place in the release cut in `16`.
- Respect the principles (P-01 to P-12) and their recurring consequences (`.claude/rules/domain.md`).
- `app/tools/check/docs/specs/check-specs.mjs` validates structure; run `make gates` after editing.
