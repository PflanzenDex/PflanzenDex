# 03 – Epic LIC: Light, Light Zones and Locations

Goal: every species gets the light level that enables its maximum growth, and the keeper sees where there is still room. Locations are named places that are assigned to a light zone.

Prototype reference: epic LIC. In the prototype the four lamp levels are **character-identical strings** in five places (B-07) and locations are **free text with exact comparison** (FR-PHA-03). In the app both are entities.

## Default light zones

| Zone   | Purpose                                             | Lux value | PPFD (approx.) |
| ------ | --------------------------------------------------- | --------- | -------------- |
| Lamp 1 | Cutting light, never an assignment level for adults | 1,500     | 36 µmol/m²/s   |
| Lamp 2 | Understory, partial shade                           | 15,000    | 300            |
| Lamp 3 | Subtropical full sun, stem succulents               | 100,000   | 1600           |
| Lamp 4 | Desert full sun, CAM cacti                          | 110,000   | 2000           |

These four are the default for new accounts. The keeper can adjust names and values and add zones (US-LIC-05).

## User stories

### US-LIC-01 · Assign a species to the right light zone · 🟨 (prototype ✅)

As a **plant keeper** I want every species to be assigned to a zone based on its biological demand, so that it grows and does not merely survive.

Acceptance criteria:

- The catalog carries the lux demand for maximum growth as an integer and a default level 2–4 of the default. The account's zone is derived from it (FR-BES-10) and can be overridden in the care profile (US-BES-09).
- The assignment follows the saturation point of photosynthesis.
- Cutting light is **never** the target zone for adults.
- Move up only if the demand reaches at least 80 % of the lux ceiling of the current level. If the demand is more than 30 % below the ceiling, the species stays there (more light brings stress).
- C3 plants with soft leaves ("sun-loving") are not automatically classified into the strong zone.

### US-LIC-02 · Know where there is still room · 🟨 (prototype ✅)

As a **plant keeper** I want to see the distribution of my specimens across the zones.

Acceptance criteria:

- Count per zone 2–4 at specimen level (the specimen's light zone before the species'); cutting light does not count.
- The display names the thinnest zone. On a tie all equally placed ones, with a hint to the wishlist.

### US-LIC-03 · Know how close the plant belongs to the lamp · 🟨 (prototype ✅)

As a **plant keeper** I want an overview by light hunger with a position recommendation.

Acceptance criteria:

- One row per species with at least one active specimen and a set lux demand, sorted descending by demand.
- Position mapping by lux demand:

  | Demand   | Position                 |
  | -------- | ------------------------ |
  | ≥ 50,000 | directly under the lamp  |
  | ≥ 15,000 | very close (~10 cm)      |
  | ≥ 8,000  | close (~20–30 cm)        |
  | ≥ 4,000  | medium distance (~40 cm) |
  | below    | may stand further away   |

- Columns: plant, zone, lux demand (locale-formatted), position. The thresholds are defaults and adjustable.

### US-LIC-04 · Look up the classification rules · ✅ (prototype ✅)

As a **plant keeper** I want to read the reference on levels, indicators and warning signs.

Acceptance criteria:

- A page "Light" contains the keeper's zone table, indicators for higher levels (CAM + arid origin, "full sun", thick cuticle, spines) and warning signs.
- The collection table (plant, zone, demand) updates without manual maintenance.

Decisions (assumption, decided by the PO): the zone table shows the keeper's own zones (name, lux ceiling, PPFD or "unbekannt"), not the four defaults. The collection table is the light overview of US-LIC-03, derived live. Indicators and warning signs are static reference text (`classificationRules()` in `core`); the percentages come from the derivation constants of US-LIC-01. The warning signs (etiolation, light stress, soft-leaved C3 plant, missing demand) are a starting set, each with a next step; no new API route is needed because the zones are already loaded.

### US-LIC-05 · Manage locations and light zones · ✅ new

As a **plant keeper** I want to define my locations and light zones myself, so that the app reflects my setup.

Acceptance criteria:

- A **location** has a name, light zone and kind (`indoor` / `outdoor`); any number, each assigned to one zone.
- A **light zone** has a name, lux ceiling, optional PPFD, sort order. Deleting a zone that specimens or species use is rejected and names which ones (no silent disappearing).
- Renaming a location changes no assignments (reference via id, no text comparison).
- Locations without a zone appear in "Hints" (US-BES-08).

## Requirements

| ID        | Requirement                                                                                                                                                                        | Status                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| FR-LIC-01 | Light zones are data of the account with a default, not hard-coded; counting, wishlist and recommendations read them centrally (solves B-07).                                      | 🟨 Data and default (LIC-05); reading by counting, wishlist and recommendations follows                                   |
| FR-LIC-02 | A specimen's light zone overrides that of the species (cutting → cutting light).                                                                                                   | 🟨 In the distribution (LIC-02): zone of the location, status cutting; an own zone field on the specimen follows (BES-04) |
| FR-LIC-03 | If the lux demand is missing, the species drops out of the light overview and appears in "Hints".                                                                                  | ⬜                                                                                                                        |
| FR-LIC-04 | Distribution and wishlist prioritization use the same counting (specimen level, only zones 2–4).                                                                                   | 🟨 Counting as a reusable function (LIC-02); the wishlist (WUN) does not use it yet                                       |
| FR-LIC-05 | The light overview (species view) uses the species' lux demand also for cuttings; the distribution (specimen view) respects the override. Intended and explained in the interface. | ⬜                                                                                                                        |
| FR-LIC-06 | A measured light intensity per lamp (phone app) can be stored per device (US-EQU-03). If it is missing, the zone's value applies, marked as "not measured".                        | ⬜                                                                                                                        |
