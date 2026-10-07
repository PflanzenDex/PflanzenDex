import { createFixtureSpecimenAt } from "../collection/index.ts";
import type { Fixtures } from "../kernel/index.ts";

// Tables of the `swap` module (FR-QG-07). The offer belongs to a specimen of the same account.
export const FIXTURES_SWAP: Fixtures = {
  offer: async (k) => ({
    specimen_id: await createFixtureSpecimenAt(k),
    type: "cutting",
    mode: "swap",
  }),
};
