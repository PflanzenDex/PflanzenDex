import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithName } from "./fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "./kernel/index.ts";
import { FriendsPostgres } from "./social/index.ts";
import { WishesPostgres, WishVisibilityPostgres } from "./wishlist/index.ts";

// DM-TAU-02, US-TAU-05, FR-WUN-07, P-04, P-05, QG-D1: the wish flag and friend_wants() (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let wishes: WishesPostgres;
let visibility: WishVisibilityPostgres;
let friends: FriendsPostgres;
const [anna, ben, cleo, dora] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
let seed = 0;
const newCode = () => {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let n = Date.now() * 1000 + ++seed;
  let out = "";
  for (let i = 0; i < 24; i++) {
    out += alphabet[n % 32];
    n = Math.floor(n / 32) + i * 7 + seed;
  }
  return out;
};
async function befriend(a: string, b: string) {
  const code = newCode();
  await friends.createCode(a, { code, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  await friends.requestWithCode(b, code);
  const id = (await friends.openRequests(a))[0]?.id as string;
  await friends.answer(a, id, true);
}
const base = {
  german: null,
  targetZoneId: null,
  difficulty: null,
  reasoning: null,
  imageUrl: null,
  imageSource: null,
  license: null,
};
async function wish(owner: string, name: string): Promise<string> {
  const r = await wishes.create(owner, { name, nameKey: name.toLowerCase(), ...base });
  if (typeof r === "string") throw new Error(r);
  return r.id;
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  wishes = new WishesPostgres(pool);
  visibility = new WishVisibilityPostgres(pool);
  friends = new FriendsPostgres(pool);
  for (const id of [anna, ben, cleo, dora])
    await createAccountWithName(pool, id, `V-${id.slice(0, 4)}`);
  await befriend(anna, ben);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben, cleo, dora]]);
  await pool.end();
  await admin.end();
});

describe("DM-TAU-02 the wish flag", () => {
  it("is off by default and only the owner can set it and take it back", async () => {
    const id = await wish(anna, "aloe vera");
    expect(await visibility.flagged(anna)).toEqual([]);
    expect(await visibility.set(anna, id, true)).toEqual({
      wishId: id,
      visible: true,
      changed: true,
    });
    expect(await visibility.flagged(anna)).toEqual([id]);
    expect(await visibility.set(anna, id, true)).toMatchObject({ changed: false });
    expect(await visibility.set(anna, id, false)).toMatchObject({ visible: false, changed: true });
    expect(await visibility.flagged(anna)).toEqual([]);
  });

  it("a foreign wish looks unknown and stays untouched (P-04)", async () => {
    const id = await wish(anna, "echeveria elegans");
    expect(await visibility.set(ben, id, true)).toBe("not_found");
    expect(await visibility.flagged(ben)).toEqual([]);
    const row = await admin.query("select visible_to_friends as v from wish where id = $1", [id]);
    expect(row.rows[0].v).toBe(false);
  });

  it("only an open wish can be made visible; taking the mark back always works", async () => {
    const id = await wish(anna, "gekauft");
    await visibility.set(anna, id, true);
    await wishes.buy(anna, id);
    expect(await visibility.flagged(anna)).toEqual([]);
    expect(await visibility.set(anna, id, false)).toMatchObject({ visible: false });
    expect(await visibility.set(anna, id, true)).toBe("not_open");
  });
});

describe("DM-TAU-02 friend_wants(): what a friend may learn (QG-D1)", () => {
  it("a confirmed friend sees only the asked species that are marked, never the list", async () => {
    const marked = await wish(anna, "haworthia fasciata");
    await wish(anna, "sedum morganianum"); // not marked
    const other = await wish(anna, "lithops");
    await visibility.set(anna, marked, true);
    await visibility.set(anna, other, true);
    const seen = await visibility.friendWants(ben, ["haworthia fasciata", "sedum morganianum"]);
    expect([...(seen.get(anna) ?? [])]).toEqual(["haworthia fasciata"]);
    // A species that is marked but was not asked about is not returned: the question bounds the answer.
    const only = await visibility.friendWants(ben, ["haworthia fasciata"]);
    expect([...(only.get(anna) ?? [])]).toEqual(["haworthia fasciata"]);
  });

  it("QG-D2 contract: the function returns exactly the friend and the asked species key, nothing else of the wish", async () => {
    const id = await wish(anna, "tillandsia ionantha");
    await visibility.set(anna, id, true);
    const raw = await withAccount(pool, ben, (c) =>
      c.query("select * from friend_wants(array['tillandsia ionantha'])"),
    );
    expect(raw.fields.map((f) => f.name)).toEqual(["owner_id", "name_key"]);
    expect(raw.rows).toEqual([{ owner_id: anna, name_key: "tillandsia ionantha" }]);
  });

  it("without the flag nothing is returned", async () => {
    await wish(cleo, "nur privat");
    await befriend(cleo, ben);
    expect((await visibility.friendWants(ben, ["nur privat"])).size).toBe(0);
  });

  it("a stranger and a friend of somebody else see nothing and cannot tell if the wish exists", async () => {
    const marked = await wish(anna, "senecio rowleyanus");
    await visibility.set(anna, marked, true);
    expect((await visibility.friendWants(dora, ["senecio rowleyanus"])).size).toBe(0);
    expect((await visibility.friendWants(dora, ["gibt es nicht"])).size).toBe(0);
    const direct = await withAccount(pool, dora, (c) =>
      c.query("select id from wish where id = $1", [marked]),
    );
    expect(direct.rows).toEqual([]);
    expect(await visibility.flagged(dora)).toEqual([]);
  });

  it("a pending (not confirmed) friendship shows nothing", async () => {
    const code = newCode();
    await friends.createCode(anna, {
      code,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await friends.requestWithCode(dora, code);
    expect((await visibility.friendWants(dora, ["senecio rowleyanus"])).size).toBe(0);
  });

  it("a friend with 'Everything private' on shows nothing", async () => {
    const marked = await wish(cleo, "ceropegia woodii");
    await visibility.set(cleo, marked, true);
    expect((await visibility.friendWants(ben, ["ceropegia woodii"])).get(cleo)?.size).toBe(1);
    await admin.query("update account_data set everything_private = true where account_id = $1", [
      cleo,
    ]);
    expect((await visibility.friendWants(ben, ["ceropegia woodii"])).size).toBe(0);
  });

  it("a bought wish is no longer shown, the account is restored and the function is closed to the public role", async () => {
    const id = await wish(anna, "crassula ovata");
    await visibility.set(anna, id, true);
    expect((await visibility.friendWants(ben, ["crassula ovata"])).get(anna)?.size).toBe(1);
    await wishes.buy(anna, id);
    expect((await visibility.friendWants(ben, ["crassula ovata"])).size).toBe(0);
    await withAccount(pool, ben, async (c) => {
      await c.query("select * from friend_wants(array['x'])");
      const me = await c.query("select current_setting('app.account_id') as id");
      expect(me.rows[0].id).toBe(ben);
    });
    const acl = await admin.query(
      "select has_function_privilege('public', 'friend_wants(text[])', 'execute') as p, has_function_privilege('pflanzendex_app', 'friend_wants(text[])', 'execute') as a",
    );
    expect(acl.rows[0]).toEqual({ p: false, a: true });
  });

  it("without an account nothing is read (42501)", async () => {
    await expect(pool.query("select * from friend_wants(array['x'])")).rejects.toThrow();
  });
});
