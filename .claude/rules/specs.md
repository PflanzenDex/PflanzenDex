---
paths:
  - "Docs/PRODUCT-SPECS/**"
---

# Rules for the product specs

- Write in English and use the glossary terms from `00-Product-Overview.md` (Species, Specimen, Cutting, Light zone, Care phase, Etiolation, Caught, Buffer, Wish, ...).
- IDs (`US-<EPIC>-nn`, `FR-`, `DM-`, `NFR-`, `E-nn`) are never renumbered or reused. Stories taken from the prototype keep their prototype ID.
- Specs are technology-neutral: behavior, data and limits. Technology choices are decisions in `16-Releases-and-Decisions.md`.
- Acceptance criteria use Given/When/Then and are meant to become tests (P-06).
- Numbers that are neither measured nor sourced are marked "assumption" or "starting value".
- Status symbols: ⬜ planned, 🟨 in progress, ✅ done. Change the status and the counters in `README.md` in the same PR as the code.
- A new epic needs: a numbered file, README tables updated, cross-references, glossary terms in `00`, a place in the release cut in `16`.
- Respect the principles (P-01 to P-11): no comparisons against species averages, no rankings between friends, etiolation never counts as success.
- `app/tools/check/docs/check-specs.mjs` validates structure; run `make gates` after editing.
