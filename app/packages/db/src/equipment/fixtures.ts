import type { Fixtures } from "../kernel/index.ts";

// Tables of the `equipment` module (FR-QG-07).
export const FIXTURES_EQUIPMENT: Fixtures = {
  equipment: () => ({ type: "Lamp", name: "Lampe 3", status: "active" }),
};
