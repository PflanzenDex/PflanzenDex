import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccountWithName, createFixtureSpecimen } from "../fixtures.ts";
import { migrate, openFixturePool, openOwnerPool } from "../kernel/index.ts";
import { OffersPostgres } from "./index.ts";

// US-SOZ-08, DM-SOZ-02, P-04: offers per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant observation and cleanup (#294)
let offers: OffersPostgres;
const [anna, ben] = [randomUUID(), randomUUID()];
const values = (specimenId: string, extra: Record<string, unknown> = {}) => ({
  specimenId,
  type: "cutting" as const,
  mode: "swap" as const,
  wish: null,
  note: null,
  ...extra,
});

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  offers = new OffersPostgres(pool);
  for (const id of [anna, ben]) await createAccountWithName(pool, id, `N-${id.slice(0, 4)}`);
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
  await admin.end();
});

describe("US-SOZ-08 offers in the database", () => {
  it("US-SOZ-08 stores an offer as open with all fields and reads it back", async () => {
    const s = await createFixtureSpecimen(pool, anna, "Angebot 1");
    const r = await offers.create(
      anna,
      values(s, { type: "offshoot", mode: "give_away", wish: "Ableger", note: "Gut bewurzelt." }),
    );
    expect(r).toMatchObject({
      specimenId: s,
      type: "offshoot",
      mode: "give_away",
      wish: "Ableger",
      note: "Gut bewurzelt.",
      status: "open",
    });
    expect(await offers.find(anna, (r as { id: string }).id)).toEqual(r);
    expect(await offers.list(anna)).toContainEqual(r);
  });

  it("US-SOZ-08 a specimen has at most one open offer, the database holds the rule; a withdrawn offer frees it", async () => {
    const s = await createFixtureSpecimen(pool, anna, "Angebot 2");
    const first = (await offers.create(anna, values(s))) as { id: string };
    expect(await offers.create(anna, values(s))).toBe("already_open");
    expect(await offers.withdraw(anna, first.id)).toMatchObject({ status: "withdrawn" });
    expect(await offers.create(anna, values(s))).toMatchObject({ status: "open" });
  });

  it("US-SOZ-08 withdrawing is repeatable, unknown and foreign ids are not found and nothing changes (P-04)", async () => {
    const s = await createFixtureSpecimen(pool, anna, "Angebot 3");
    const o = (await offers.create(anna, values(s))) as { id: string };
    expect(await offers.withdraw(ben, o.id)).toBe("not_found");
    expect(await offers.find(ben, o.id)).toBeNull();
    expect(await offers.withdraw(anna, randomUUID())).toBe("not_found");
    await offers.withdraw(anna, o.id);
    expect(await offers.withdraw(anna, o.id)).toMatchObject({ status: "withdrawn" });
  });

  it("US-SOZ-08 a handed-over offer cannot be withdrawn", async () => {
    const s = await createFixtureSpecimen(pool, anna, "Angebot 4");
    const o = (await offers.create(anna, values(s))) as { id: string };
    await admin.query("update offer set status = 'handed_over' where id = $1", [o.id]);
    expect(await offers.withdraw(anna, o.id)).toBe("not_active");
  });

  it("US-SOZ-08 the offers of an account are invisible to others and a foreign specimen cannot be offered (P-04, P-05)", async () => {
    const mine = await createFixtureSpecimen(pool, anna, "Angebot 5");
    await offers.create(anna, values(mine));
    expect(await offers.list(ben)).toEqual([]);
    await expect(offers.create(ben, values(mine))).rejects.toThrow(/foreign key|violates/);
  });
});
