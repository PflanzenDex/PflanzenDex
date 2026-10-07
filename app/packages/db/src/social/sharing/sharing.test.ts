import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithName, createFixtureSpecimen } from "../../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { FriendsPostgres, SharingPostgres } from "../index.ts";

// US-SOZ-04, DM-SOZ-04, P-04, P-05: sharing settings per specimen (real PostgreSQL, `make db-up`).
let pool: Pool;
// Deliberate cross-tenant observation and cleanup: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
let sharing: SharingPostgres;
let friends: FriendsPostgres;
const [anna, ben, cleo] = [randomUUID(), randomUUID(), randomUUID()];
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
const specimen = (owner: string, name: string) => createFixtureSpecimen(pool, owner, name);
async function befriend(a: string, b: string) {
  const code = newCode();
  await friends.createCode(a, { code, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  await friends.requestWithCode(b, code);
  const id = (await friends.openRequests(a))[0]?.id as string;
  await friends.answer(a, id, true);
  return (await friends.friends(a)).find((f) => f.accountId === b)?.id as string;
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  sharing = new SharingPostgres(pool);
  friends = new FriendsPostgres(pool);
  for (const id of [anna, ben, cleo]) await createAccountWithName(pool, id, `N-${id.slice(0, 4)}`);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben, cleo]]);
  await pool.end();
  await admin.end();
});

describe("US-SOZ-04 sharing settings in the database", () => {
  it("US-SOZ-04 a specimen is private by default; sharing and withdrawing it, photos stored", async () => {
    const s = await specimen(anna, "Privat per Voreinstellung");
    expect(await sharing.list(anna)).toEqual([]);
    await sharing.set(anna, s, true, false);
    await sharing.set(anna, s, true, true);
    expect(await sharing.list(anna)).toEqual([{ specimenId: s, photos: true }]);
    await sharing.set(anna, s, false, false);
    expect(await sharing.list(anna)).toEqual([]);
  });

  it("US-SOZ-04 the sharing rows of an account are invisible to others and a foreign specimen cannot be shared (P-04)", async () => {
    const s = await specimen(anna, "Nur Annas");
    await sharing.set(anna, s, true, false);
    expect(await sharing.list(ben)).toEqual([]);
    await expect(sharing.set(ben, s, true, false)).rejects.toThrow(/foreign key|violates/);
    await sharing.set(ben, s, false, false);
    expect(await sharing.list(anna)).toContainEqual({ specimenId: s, photos: false });
    await sharing.set(anna, s, false, false);
  });

  it("US-SOZ-04 bulk setting is all or nothing", async () => {
    const [a, b] = [await specimen(anna, "Bulk 1"), await specimen(anna, "Bulk 2")];
    await expect(sharing.setMany(anna, [a, randomUUID()], true, false)).rejects.toThrow();
    expect(await sharing.list(anna)).toEqual([]);
    await sharing.setMany(anna, [a, b], true, false);
    expect(await sharing.list(anna)).toHaveLength(2);
    await sharing.setMany(anna, [a, b], false, false);
  });

  it("US-SOZ-04 a friend reads the shared specimens only while the friendship is confirmed (P-05)", async () => {
    const s = await specimen(anna, "Fuer Freunde");
    await sharing.set(anna, s, true, true);
    expect(await sharing.sharedBy(ben, anna)).toEqual([]);
    const friendId = await befriend(anna, ben);
    expect(await sharing.sharedBy(ben, anna)).toEqual([{ specimenId: s, photos: true }]);
    expect(await sharing.sharedBy(anna, ben)).toEqual([]);
    expect(await sharing.sharedBy(cleo, anna)).toEqual([]);
    expect(await friends.end(anna, friendId)).toBe("ended");
    expect(await sharing.sharedBy(ben, anna)).toEqual([]);
    // Nothing was deleted: the owner's settings are still there.
    expect(await sharing.list(anna)).toContainEqual({ specimenId: s, photos: true });
    await sharing.set(anna, s, false, false);
  });

  it("US-SOZ-04 the account of the caller is restored after reading a friend's rows", async () => {
    const s = await specimen(anna, "Restore");
    await sharing.set(anna, s, true, false);
    await befriend(anna, cleo);
    await withAccount(pool, cleo, async (c) => {
      await c.query("select * from friend_shares($1)", [anna]);
      const me = await c.query("select current_setting('app.account_id') as id");
      expect(me.rows[0].id).toBe(cleo);
    });
    await sharing.set(anna, s, false, false);
  });
});
