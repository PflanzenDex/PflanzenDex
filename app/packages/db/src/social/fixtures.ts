import { createFixtureSpecimenAt } from "../collection/index.ts";
import { asAccount, type Fixtures } from "../kernel/index.ts";

// The other side of the example friendship: a fixed account that stays in place (like the fixture species account),
// so deleting the two test accounts never depends on it.
const OTHER_SIDE = "00000000-0000-4000-8000-00000000fa03";

// Tables of the `social` module (FR-QG-07).
export const FIXTURES_SOCIAL: Fixtures = {
  friendship: async ({ query }) => {
    await asAccount(query, OTHER_SIDE, () =>
      query.query("insert into account (id) values ($1) on conflict do nothing", [OTHER_SIDE]),
    );
    return { other_id: OTHER_SIDE, other_name: "Test", direction: "sent" };
  },
  sharing: async (k) => ({ specimen_id: await createFixtureSpecimenAt(k) }),
  feed_seen: () => ({}),
};
