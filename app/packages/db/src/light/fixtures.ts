import type { Fixtures } from "../kernel/index.ts";

// Tables of the `light` module (FR-QG-07).
export const FIXTURES_LIGHT: Fixtures = {
  light_zone: () => ({ name: "Lampe 2", lux_ceiling: 15000, sort_order: 2 }),
  location: () => ({ name: "Regal", kind: "indoor" }),
};
