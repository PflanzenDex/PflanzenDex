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
  // A vote needs an open correction; the account's own is enough for the row rule (the function forbids voting on it).
  catalog_correction_vote: async ({ accountId, query }) => {
    const c = await query.query<{ id: string }>(
      `insert into catalog_correction (account_id, species_id, field, proposed_value, reason)
       values ($1, '00000000-0000-4000-8000-00000000fa01', 'german_name', $2, 'Fixture') returning id`,
      [accountId, `Stimme ${randomUUID()}`],
    );
    return { correction_id: c.rows[0]?.id, vote: "confirm" };
  },
};
