import type { Fixtures } from "../kern/index.ts";

// Tabellen des Moduls `licht` (FR-QG-07).
export const FIXTURES_LICHT: Fixtures = {
  lichtzone: () => ({ name: "Lampe 2", lux_decke: 15000, reihenfolge: 2 }),
  standort: () => ({ name: "Regal", art: "innen" }),
};
