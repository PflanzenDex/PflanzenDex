---
paths:
  - "app/packages/**"
  - "docs/specs/product/**"
---

# Domain big picture

The model and the glossary are in `docs/specs/product/00-product-overview.md`; this is the short form.

- **Species vs. specimen:** a species lives once in a shared catalog. A specimen is one pot owned by a user. A specimen field overrides the same field on its species.
- **Light zone / location:** light zones and locations are entities. Zone 1 is cutting light; zones 2–4 are for adult plants.
- **Derived data:** Pokédex ownership ("caught"), care phases, growth trends and zone distribution are derived live and never stored.
- **Pokédex catalog:** built by a background job (OpenTree → Wikidata → Wikipedia → GBIF). The prototype's `build_pokedex.py` (73 tests) and `pokedex-core.js` (66 tests) are reuse candidates (E-01).

Recurring consequences of the principles (P-01 to P-12, one line each in `CLAUDE.md`):

- No comparisons against species averages.
- Etiolated growth never counts as success.
- Leaderboards and rankings between friends are excluded.
- Affiliate recommendations appear only for a derived need and are always labeled (EQU).
