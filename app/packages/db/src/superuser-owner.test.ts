import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  befriend,
  createAccountWithName,
  createSuperuserOwnerDatabase,
  type SuperuserOwnerDatabase,
} from "./fixtures.ts";
import { FriendsPostgres } from "./social/index.ts";
import { WishesPostgres, WishVisibilityPostgres } from "./wishlist/index.ts";

// #907, QG-D1, P-04, P-05: the friend graph and the wish lookup with a SUPERUSER as owner of the tables. A `security
// definer` function runs with the owner's rights, so row security does not protect it there (see createSuperuserOwnerDatabase).
// These functions name the account explicitly, so the answer must equal the one under the plain owner of the suite.
let db: SuperuserOwnerDatabase;
let pool: Pool;
const [anna, ben, cleo, dora] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];

beforeAll(async () => {
  db = await createSuperuserOwnerDatabase("friends");
  pool = db.pool;
  for (const id of [anna, ben, cleo, dora])
    await createAccountWithName(pool, id, `S-${id.slice(0, 4)}`);
});
afterAll(async () => {
  await db.drop();
});

describe("US-SOZ-01 / US-SOZ-02 / US-SOZ-03 friendships with a superuser as table owner (#907)", () => {
  it("US-SOZ-01 a request and its answer touch only the two accounts involved", async () => {
    await befriend(pool, anna, ben);
    const friends = new FriendsPostgres(pool);
    expect((await friends.friends(anna)).map((f) => f.accountId)).toEqual([ben]);
    expect((await friends.friends(ben)).map((f) => f.accountId)).toEqual([anna]);
    expect(await friends.friends(cleo)).toEqual([]);
    expect(await friends.openRequests(cleo)).toEqual([]);
  });

  it("US-SOZ-03 ending a friendship ends both sides and leaves other friendships alone", async () => {
    await befriend(pool, anna, cleo);
    const friends = new FriendsPostgres(pool);
    const withCleo = (await friends.friends(anna)).find((f) => f.accountId === cleo);
    expect(await friends.end(anna, withCleo?.id as string)).toBe("ended");
    expect((await friends.friends(anna)).map((f) => f.accountId)).toEqual([ben]);
    expect(await friends.friends(cleo)).toEqual([]);
    expect((await friends.friends(ben)).map((f) => f.accountId)).toEqual([anna]);
  });
});

describe("US-TAU-05 friend_wants() with a superuser as table owner (#907)", () => {
  it("US-TAU-05 a friend sees the marked wish he asked for, a stranger nothing, nobody the wishes of other friends", async () => {
    const wishes = new WishesPostgres(pool);
    const visibility = new WishVisibilityPostgres(pool);
    const base = {
      german: null,
      targetZoneId: null,
      difficulty: null,
      reasoning: null,
      imageUrl: null,
      imageSource: null,
      license: null,
    };
    const mark = async (owner: string, name: string) => {
      const w = await wishes.create(owner, { name, nameKey: name, ...base });
      if (typeof w === "string") throw new Error(w);
      await visibility.set(owner, w.id, true);
    };
    await mark(anna, "haworthia fasciata");
    await mark(dora, "haworthia fasciata"); // not a friend of ben
    const seen = await visibility.friendWants(ben, ["haworthia fasciata"]);
    expect([...seen.keys()]).toEqual([anna]);
    expect((await visibility.friendWants(cleo, ["haworthia fasciata"])).size).toBe(0);
  });
});
