import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assignRole, createAccountWithName, createFixtureSpecimen } from "../../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../../kernel/index.ts";
import { FriendsPostgres, SharingPostgres } from "../../social/index.ts";
import { OffersPostgres, SwapsPostgres } from "../index.ts";

// US-ONB-08, P-04, P-05: the `security definer` functions that read `specimen` as the owner (`request_swap()`,
// `friend_shares()`, `friend_equipment()`, `friend_offers()`) answer the same whether or not the application has set
// the old switch of the operator's figures (`pflanzendex.introduction_figures`) in its transaction. Two accounts, one
// connection.
const SWITCH = "select set_config('pflanzendex.introduction_figures', 'on', true)";
let pool: Pool;
let single: Pool;
let admin: Pool;
const [operator, anna, ben, dora] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
let annaSpecimen: string;
let annaOffer: string;
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

beforeAll(async () => {
  pool = openOwnerPool();
  single = new pg.Pool({
    connectionString: (pool as unknown as { options: { connectionString: string } }).options
      .connectionString,
    max: 1,
  });
  admin = openFixturePool();
  await migrate(pool);
  for (const id of [operator, anna, ben, dora])
    await createAccountWithName(pool, id, `I-${id.slice(0, 4)}`);
  await assignRole(pool, operator, "operator");
  const friends = new FriendsPostgres(pool);
  const code = newCode();
  await friends.createCode(anna, {
    code,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  await friends.requestWithCode(ben, code);
  await friends.answer(anna, (await friends.openRequests(anna))[0]?.id as string, true);
  annaSpecimen = await createFixtureSpecimen(pool, anna, "Anna-secret");
  await new SharingPostgres(pool).set(anna, annaSpecimen, true, false);
  const o = (await new OffersPostgres(pool).create(anna, {
    specimenId: annaSpecimen,
    type: "cutting",
    mode: "swap",
    wish: null,
    note: null,
  })) as { id: string };
  annaOffer = o.id;
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[operator, anna, ben, dora]]);
  await admin.end();
  await single.end();
  await pool.end();
});

describe("US-ONB-08 · P-04 the old switch changes no answer of the functions that read specimens", () => {
  it("US-ONB-08 a foreign specimen as counter-offer stays 'unknown', with or without the switch (no existence oracle)", async () => {
    const plain = await new SwapsPostgres(pool).request(ben, annaOffer, annaSpecimen, null);
    expect(plain.outcome).toBe("counter_unknown");
    const withSwitch = await withAccount(single, ben, async (c) => {
      await c.query(SWITCH);
      return c.query("select outcome from request_swap($1, $2, null)", [annaOffer, annaSpecimen]);
    });
    expect(withSwitch.rows[0].outcome).toBe("counter_unknown");
  });

  it("US-ONB-08 a stranger sees no shared specimen, no equipment and no offer of the owner, with the switch set", async () => {
    const counts = await withAccount(single, dora, async (c) => {
      await c.query(SWITCH);
      const shared = await c.query("select * from friend_shares($1)", [anna]);
      const equipment = await c.query("select * from friend_equipment($1)", [anna]);
      const offers = await c.query("select * from friend_offers()");
      return [shared.rows.length, equipment.rows.length, offers.rows.length];
    });
    expect(counts).toEqual([0, 0, 0]);
  });
});
