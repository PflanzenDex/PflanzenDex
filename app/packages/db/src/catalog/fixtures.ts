import { randomUUID } from "node:crypto";
import type { Fixtures } from "../kernel/index.ts";

// Tables of the `catalog` module (FR-QG-07).
export const FIXTURES_CATALOG: Fixtures = {
  review_case: () => ({ object_kind: "species", object_id: randomUUID(), status: "proposal" }),
  // The species is the fixed example species of the collection fixtures (global reference table, AB-10).
  catalog_correction: () => ({
    species_id: "00000000-0000-4000-8000-00000000fa01",
    field: "german_name",
    proposed_value: `Beispiel ${randomUUID()}`,
    reason: "Fixture",
  }),
};
