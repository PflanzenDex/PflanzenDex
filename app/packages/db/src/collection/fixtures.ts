import { randomUUID } from "node:crypto";
import type { FixtureContext, Fixtures } from "../kernel/index.ts";

// Tables of the module `collection` (FR-QG-07). The species is a foreign key to the global reference table `species`
// (AB-10): the fixed example species is created by `createFixtureSpecies` (db/src/fixtures.ts) before the test.
export const FIXTURE_SPECIES_ID = "00000000-0000-4000-8000-00000000fa01";
export const FIXTURES_COLLECTION: Fixtures = {
  specimen: () => ({ species_id: FIXTURE_SPECIES_ID, name: "Bogenhanf", caught_at: "2026-10-03" }),
  care_profile: () => ({ species_id: FIXTURE_SPECIES_ID, watering_growth_days: 7 }),
};

/**
 * Creates a specimen of the account and returns its ID. For fixtures of other modules whose tables reference a
 * specimen: they write no SQL on `specimen` (AB-9), but call this. The species is the fixed example species
 * (`createFixtureSpecies`); the name is random because it must be unique per account.
 */
export async function createFixtureSpecimenAt(k: FixtureContext): Promise<string> {
  const r = await k.query.query<{ id: string }>(
    "insert into specimen (account_id, species_id, name) values ($1, $2, $3) returning id",
    [k.accountId, FIXTURE_SPECIES_ID, `Fixture ${randomUUID()}`],
  );
  return (r.rows[0] as { id: string }).id;
}
