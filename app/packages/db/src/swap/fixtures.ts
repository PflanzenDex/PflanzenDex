import { createFixtureSpecimenAt } from "../collection/index.ts";
import { asAccount, type Fixtures } from "../kernel/index.ts";

// The other side of the example swap: a fixed account that stays in place (like the one of the friendship fixture), so
// deleting the two test accounts never depends on it.
const OTHER_SIDE = "00000000-0000-4000-8000-00000000fa04";

// Tables of the `swap` module (FR-QG-07). The offer belongs to a specimen of the same account; a swap row is one side of
// a swap and points at the offer of the other account without a foreign key (AB-10).
export const FIXTURES_SWAP: Fixtures = {
  offer: async (k) => ({
    specimen_id: await createFixtureSpecimenAt(k),
    type: "cutting",
    mode: "swap",
  }),
  swap: async ({ query }) => {
    await asAccount(query, OTHER_SIDE, () =>
      query.query("insert into account (id) values ($1) on conflict do nothing", [OTHER_SIDE]),
    );
    return {
      swap_id: "00000000-0000-4000-8000-00000000fb01",
      role: "recipient",
      other_id: OTHER_SIDE,
      other_name: "Test",
      offer_id: "00000000-0000-4000-8000-00000000fb02",
      type: "cutting",
      mode: "swap",
    };
  },
};
