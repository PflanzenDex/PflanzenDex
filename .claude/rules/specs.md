---
paths:
  - "Docs/PRODUCT-SPECS/**"
---

# Rules for the product specs

- Write in German and use the glossary terms from `00-Product-Overview.md` (Art, Exemplar, Steckling, Lichtzone, Pflegephase, Vergeilung, Gefangen, Puffer, Wunsch, ...).
- IDs (`US-<EPIC>-nn`, `FR-`, `DM-`, `NFR-`, `E-nn`) are never renumbered or reused. Stories taken from the prototype keep their prototype ID.
- Specs are technology-neutral: behavior, data and limits. Technology choices are decisions in `16-Releases-and-Decisions.md`.
- Acceptance criteria use Gegeben/Wenn/Dann and are meant to become tests (P-06).
- Numbers that are neither measured nor sourced are marked "Annahme" or "Startwert".
- Status symbols: ⬜ planned, 🟨 in progress, ✅ done. Change the status and the counters in `README.md` in the same PR as the code.
- A new epic needs: a numbered file, README tables updated, cross-references, glossary terms in `00`, a place in the release cut in `16`.
- Respect the principles (P-01 to P-11): no comparisons against species averages, no rankings between friends, Vergeilung never counts as success.
- `app/scripts/check-specs.mjs` validates structure; run `make gates` after editing.
