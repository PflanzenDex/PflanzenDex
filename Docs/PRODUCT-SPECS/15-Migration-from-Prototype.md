# 15 – Epic MIG: Migration from the Prototype (dropped)

**Status: ⛔ dropped** (decision 2026-10-03). There is no import from the Obsidian vault. The start users record their collection anew in the app (forms or AI client, US-KI-01). The vault stays unchanged as reference and backup; the app does not read from it and never writes into it.

The IDs stay **reserved** and are not reassigned (convention: IDs are never renumbered). The stories do not count in the status overview of the `README.md`.

| ID                      | Former meaning                                                           | Status      |
| ----------------------- | ------------------------------------------------------------------------ | ----------- |
| US-MIG-01               | Import vault data (dry run, idempotent, error report)                    | ⛔ dropped  |
| US-MIG-02               | Align locations, light zones and scales                                  | ⛔ dropped  |
| US-MIG-03               | Parallel operation and switching (comparison view prototype vs. app)     | ⛔ dropped  |
| FR-MIG-01 | Import tool | ⛔ dropped |
| FR-MIG-02 | Import only into the own account | ⛔ dropped |
| FR-MIG-03 | Source (vault) untouched | ⛔ dropped |
| FR-MIG-04 | Tolerant parsing | ⛔ dropped |

## Consequences of the decision

- **Switching from the vault:** whoever switches creates locations, species and specimens anew and afterwards maintains only the app. This is a hurdle for stage 1 (see risk R-10 in `16-Releases-and-Decisions.md`).
- **Prototype figures** (13 species, 17 specimens, 2 archived, 8 wishlist candidates, 215 catalog species) serve as orientation for test data (US-DEV-07) and for the catalog build-out (US-POK-02), not as an import target.
- **Initial catalog stock:** the 215 catalog species (`Arten.md`) and the 13 curated species notes are material for the operator batches of the catalog build-out, not the subject of an import tool.
- **Parallel operation:** prototype and app can run side by side; there is no comparison view.
