import { randomUUID } from "node:crypto";
import type { Fixtures } from "../kernel/index.ts";

// Tables of the `collection` module (FR-QG-07). The species has no foreign key, any id suffices.
export const FIXTURES_COLLECTION: Fixtures = {
  specimen: () => ({ species_id: randomUUID(), name: "Bogenhanf", caught_at: "2026-10-03" }),
};
