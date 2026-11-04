import type { Pool } from "pg";
import type { Api } from "./query-count-api-test-helpers";
import {
  seedCare,
  seedGear,
  seedKeeper,
  seedWishes,
  speciesBody,
  type Grown,
  type Seat,
  type SeedIds,
} from "./query-count-seed-test-helpers";
import {
  befriend,
  friendName,
  seedFriend,
  seedSwaps,
} from "./query-count-seed-social-test-helpers";

// US-QG-07: the accounts of one size. Friendships are per keeper, so each size gets its own two friends; the reviewer
// approves the keeper's first species (corrections are read only for an approved species). `tag` keeps the names of
// the two sizes apart (catalog names are unique).
export type Cast = {
  tag: string;
  keeper: string;
  friendA: string;
  friendB: string;
  reviewer: string;
};
/** What a seed writes with: the API of the app, the admin pool for the two fixtures no route writes, the run tag. */
export type World = { api: Api; admin: Pool; run: string };

const TAXA_WISHED = 3;

/** Name of the taxa that the test inserts into the shared catalog, and that the keeper wishes for. */
export const taxonName = (run: string, g: number): string => `Qcgenus${run}${g} species`;

const first = (ids: readonly string[]): string => {
  const id = ids[0];
  if (id === undefined) throw new Error("seed: no row to measure");
  return id;
};

/** The reviewer approves the species as a reviewer would: the role is granted in the database (no route grants it), the
 * case is looked up in the database (the review list is installation-wide), the decision goes through the review route. */
async function approve(api: Api, admin: Pool, reviewer: string, speciesId: string): Promise<void> {
  await api.ok(reviewer, "GET", "/account"); // the first sign-in creates the account
  await admin.query(
    "insert into account_role (account, role) select id, 'reviewer' from account where subject = $1",
    [reviewer],
  );
  const { rows } = await admin.query<{ id: string }>(
    "select id from review_case where object_kind = 'species' and object_id = $1",
    [speciesId],
  );
  const caseId = rows[0]?.id;
  if (!caseId) throw new Error(`seed: no review case for species ${speciesId}`);
  await api.ok(reviewer, "POST", `/review/${caseId}/decide`, { status: "reviewed" });
}

/** Seeds one size end to end (keeper, reviewer, friends, friendships, wishes, swaps) and returns the ids the paths take. */
export async function seedSize(world: World, cast: Cast, n: number): Promise<SeedIds> {
  const { api, admin, run } = world;
  const t = cast.tag;
  const keeper: Seat = { api, sub: cast.keeper, run, tag: `${t}k` };
  const grown: Grown = await seedKeeper(keeper, n);
  await approve(api, admin, cast.reviewer, first(grown.species));
  await seedCare(keeper, grown);
  await seedGear(keeper, n);
  await seedFriend({ api, sub: cast.friendA, run, tag: `${t}a` }, n, true);
  await seedFriend({ api, sub: cast.friendB, run, tag: `${t}b` }, n, false);
  const friend = await befriend(api, cast.keeper, cast.friendA, friendName(run, `${t}a`));
  await befriend(api, cast.keeper, cast.friendB, friendName(run, `${t}b`));
  const taxa = Array.from({ length: TAXA_WISHED }, (_, g) => taxonName(run, g));
  const friendsSpecies = [`${t}a`, `${t}b`].map((tag) =>
    String(speciesBody(run, tag, 0)["latinName"]),
  );
  await seedWishes(keeper, [...taxa, ...friendsSpecies]);
  await seedSwaps(api, cast.keeper, cast.friendA, cast.friendB);
  return { specimen: first(grown.specimens), species: first(grown.species), friend };
}
