import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { PokedexStatePostgres } from "./index.ts";

// US-POK-12, P-04: the seen state of the Pokédex per account (real PostgreSQL, `make db-up`).
let pool: Pool;
// Deliberate cross-tenant cleanup of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
let state: PokedexStatePostgres;
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  state = new PokedexStatePostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) =>
      c.query("insert into account (id) values ($1) on conflict do nothing", [id]),
    );
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

describe("US-POK-12 seen state per account", () => {
  it("US-POK-12 has no state before the first write", async () => {
    expect(await state.find(anna)).toBeNull();
  });

  it("US-POK-12 creates the state with the given species and adds to it later without duplicates", async () => {
    expect((await state.add(anna, ["Aloe vera", "Aloe vera"])).sort()).toEqual(["Aloe vera"]);
    expect((await state.add(anna, ["Citrus limon", "Aloe vera"])).sort()).toEqual([
      "Aloe vera",
      "Citrus limon",
    ]);
    expect((await state.find(anna))?.sort()).toEqual(["Aloe vera", "Citrus limon"]);
  });

  it("US-POK-12 creates an empty state when nothing is caught yet", async () => {
    expect(await state.add(ben, [])).toEqual([]);
    expect(await state.find(ben)).toEqual([]);
  });

  it("US-POK-12 nobody sees or changes the state of another account (P-04)", async () => {
    await state.add(ben, ["Ficus lyrata"]);
    expect(await state.find(ben)).toEqual(["Ficus lyrata"]);
    expect((await state.find(anna))?.sort()).toEqual(["Aloe vera", "Citrus limon"]);
    // A write as anna that names ben's row is refused by the row rule, never applied to ben.
    await expect(
      withAccount(pool, anna, (c) =>
        c.query("insert into pokedex_state (account_id, seen_species) values ($1, '{x}')", [ben]),
      ),
    ).rejects.toThrow();
    const stolen = await withAccount(pool, anna, (c) =>
      c.query("update pokedex_state set seen_species = '{x}' where account_id = $1", [ben]),
    );
    expect(stolen.rowCount).toBe(0);
    expect(await state.find(ben)).toEqual(["Ficus lyrata"]);
  });

  it("US-POK-12 deleting the account removes its state", async () => {
    const gone = randomUUID();
    await withAccount(pool, gone, (c) => c.query("insert into account (id) values ($1)", [gone]));
    await state.add(gone, ["Aloe vera"]);
    await admin.query("delete from account where id = $1", [gone]);
    const left = await admin.query("select 1 from pokedex_state where account_id = $1", [gone]);
    expect(left.rowCount).toBe(0);
  });
});
