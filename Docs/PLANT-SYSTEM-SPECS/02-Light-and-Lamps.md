# 02 – Epic LIC: Light & Lamps

Goal: every species gets the lamp level that enables its maximum growth, and the keeper sees where in the cabinet there is still room.

Sources: `02-Areas/Pflanzen/Lampen-Zuordnung.md`, dashboard block "☀️ Alle Pflanzen", species template, `CLAUDE.md`.

## User stories

### US-LIC-01 · Assign a species to the right lamp level · ✅

As a **plant keeper** I want every species to be assigned to one of four lamp levels based on its biological demand, so that it grows and does not merely survive.

Acceptance criteria:

- The species template demands for `Licht_Hardware` exactly one of the four strings from DM-05 and for `Licht_Lux_Bedarf` the actual lux demand for maximum growth as an integer.
- The assignment follows the saturation point of photosynthesis. The rule of thumb is in `Lampen-Zuordnung.md`.
- Lamp 1 is **never** an assignment level for grown plants.
- Move up only if the demand reaches at least 80 % of the lux ceiling of the current level. If the demand is more than 30 % below the ceiling, the species stays there (more light brings stress).
- C3 plants with soft leaves ("sun-loving", e.g. basil) are not automatically classified into lamp 3.

### US-LIC-02 · Know where there is still room · ✅

As a **plant keeper** I want to see the distribution of the specimens across lamps 2–4, so that I know which level is the thinnest.

Acceptance criteria:

- `Lampen-Zuordnung.md` → "📋 Verteilung" counts specimens per lamp 2, 3, 4 (specimen value `Licht_Hardware` before species value).
- Lamp 1 does not count.
- The text names the thinnest level; on a tie all equally placed ones, with a hint to `Wunschliste`.

### US-LIC-03 · Know how close the plant belongs to the lamp · ✅

As a **plant keeper** I want an overview by light hunger with a position recommendation, so that I place the plants in the shelf correctly.

Acceptance criteria:

- Block "☀️ Alle Pflanzen (nach Lichthunger – nah → weit)": one row per species with at least one specimen and a set `Licht_Lux_Bedarf`, sorted descending by demand.
- Position mapping by lux demand:

  | Demand   | Position                    |
  | -------- | --------------------------- |
  | ≥ 50,000 | 🔆 Directly under the lamp  |
  | ≥ 15,000 | 🔆 Very close (~10 cm)      |
  | ≥ 8,000  | 🌤 Close (~20–30 cm)         |
  | ≥ 4,000  | ⛅ Medium distance (~40 cm) |
  | below    | 🌥 May stand further away    |

- Columns: plant, lamp, lux demand (formatted de-DE), position.

### US-LIC-04 · Look up the current assignment and classification rules · ✅

As a **plant keeper** I want a reference with the four levels, indicators and warning signs as well as the current collection table, so that I classify new species consistently.

Acceptance criteria:

- `Lampen-Zuordnung.md` contains the level table, indicators for higher levels (CAM + arid origin, "Full Sun", thick cuticle, spines), warning signs and the live table "Aktuelle Zuordnung (Bestand)" (plant, lamp, demand), sorted descending by demand.
- The table updates without manual maintenance.

## Requirements

| ID        | Requirement                                                                                                                                                                                      | Status              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| FR-LIC-01 | Lamp strings are character-identical in species notes, dashboard, wishlist and reference (DM-05). A deviation leads to silent non-counting.                                                      | ✅ (risk, see B-07) |
| FR-LIC-02 | The specimen field `Licht_Hardware` overrides the species value (cutting → lamp 1).                                                                                                              | ✅                  |
| FR-LIC-03 | `Licht_Lux_Bedarf` is a number. If it is missing, the species drops out of the light overview.                                                                                                   | ✅                  |
| FR-LIC-04 | Lamp distribution and wishlist prioritization use the same counting (specimen level, only lamps 2–4).                                                                                            | ✅                  |
| FR-LIC-05 | The light overview (species view) uses `Licht_Lux_Bedarf` of the species, also for cuttings; the distribution (specimen view) respects the cutting override. This is intended, but undocumented. | 🟡                  |
| FR-LIC-06 | The actually measured light intensity of the lamps is checked once with a phone app (Photone) and noted in `Lampen-Zuordnung.md` with date and method.                                           | ⬜ (see MON-07)     |
