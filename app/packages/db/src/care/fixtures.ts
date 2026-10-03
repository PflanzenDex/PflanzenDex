import { createFixtureSpecimenAt } from "../collection/index.ts";
import type { Fixtures } from "../kernel/index.ts";

// Tables of the module `care` (FR-QG-07). The measurement belongs to a specimen of the same account.
export const FIXTURES_CARE: Fixtures = {
  measurement: async (k) => ({
    specimen_id: await createFixtureSpecimenAt(k),
    date: "2026-10-03",
    value: 12.5,
  }),
};
