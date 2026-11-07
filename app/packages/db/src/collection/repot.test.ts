import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, withAccount, openOwnerPool, openFixturePool } from "../kernel/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { RepotPostgres, SpecimenPostgres } from "./index.ts";

// US-BES-19, DM-BES-09, P-04, P-10: the repot history and the repot observations (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
let specimens: SpecimenPostgres;
let repots: RepotPostgres;
let species = "";
const anna = randomUUID();
const ben = randomUUID();

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  species = await createFixtureSpeciesAt();
  specimens = new SpecimenPostgres(pool);
  repots = new RepotPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

const make = async (account: string, name: string, status: "plant" | "cutting") => {
  const r = await specimens.create(account, {
    speciesId: species,
    name,
    marker: null,
    locationId: null,
    caughtAt: "2026-09-01",
    status,
  });
  if (typeof r === "string") throw new Error(r);
  return r.id;
};

describe("US-BES-19 the repot history in the database", () => {
  it("US-BES-19 a repot of a cutting writes the repot day and the history; a plant's repot keeps its own day", async () => {
    const id = await make(anna, "Verlauf Steckling", "cutting");
    expect(await specimens.repot(anna, id, "2026-09-10", "2026-09-10")).toMatchObject({
      status: "plant",
      repottedAt: "2026-09-10",
    });
    expect(await specimens.repot(anna, id, "2026-10-02", "2026-10-02")).toMatchObject({
      status: "plant",
      repottedAt: "2026-09-10",
    });
    const latest = await repots.lastRepotted(anna, [id]);
    expect(latest.get(id)).toBe("2026-10-02");
  });

  it("US-BES-19 a plant with no repot has no last repot day (unknown, P-08); a foreign one is not read", async () => {
    const id = await make(anna, "Ohne Umtopfen", "plant");
    expect((await repots.lastRepotted(anna, [id])).has(id)).toBe(false);
    expect((await repots.lastRepotted(ben, [id])).has(id)).toBe(false);
  });

  it("US-BES-19 a repot is refused with its reason and writes nothing: archived, a plant without a day, a day before the catch date", async () => {
    const archived = await make(anna, "Archiv Umtopfen", "cutting");
    await specimens.archive(anna, archived, "abgegeben", "2026-10-01");
    expect(await specimens.repot(anna, archived, "2026-10-02", "2026-10-02")).toBe("archived");
    const plant = await make(anna, "Pflanze ohne Tag", "plant");
    expect(await specimens.repot(anna, plant, null, null)).toBe("day_unknown");
    expect(await specimens.repot(anna, plant, "2026-08-01", "2026-08-01")).toBe("before_caught");
    expect((await repots.lastRepotted(anna, [archived, plant])).size).toBe(0);
  });

  it("US-BES-19, P-04 another account cannot repot the plant and sees no history", async () => {
    const id = await make(anna, "Fremd Umtopfen", "plant");
    expect(await specimens.repot(ben, id, "2026-10-02", "2026-10-02")).toBe("not_found");
    expect((await repots.lastRepotted(ben, [id])).size).toBe(0);
  });
});

describe("US-BES-19 the repot observations in the database", () => {
  it("US-BES-19 a tick is open once, an untick clears it on its day, and a second untick writes nothing", async () => {
    const id = await make(anna, "Beobachtet", "plant");
    expect(await repots.tickSign(anna, id, "roots_out", "2026-10-03")).toEqual([
      { sign: "roots_out", tickedOn: "2026-10-03" },
    ]);
    // A second tick of the open observation keeps the first day (US-QS-03).
    expect(await repots.tickSign(anna, id, "roots_out", "2026-10-05")).toEqual([
      { sign: "roots_out", tickedOn: "2026-10-03" },
    ]);
    expect(await repots.untickSign(anna, id, "roots_out", "2026-10-06")).toEqual([]);
    expect(await repots.untickSign(anna, id, "roots_out", "2026-10-07")).toEqual([]);
    const rows = await withAccount(pool, anna, (c) =>
      c.query<{ cleared: string }>(
        `select to_char(cleared_on, 'YYYY-MM-DD') as cleared from repot_sign where specimen_id = $1`,
        [id],
      ),
    );
    expect(rows.rows).toEqual([{ cleared: "2026-10-06" }]);
  });

  it("US-BES-19 the open observations come back in the order of the sign list", async () => {
    const id = await make(anna, "Reihenfolge", "plant");
    await repots.tickSign(anna, id, "tips_over", "2026-10-03");
    await repots.tickSign(anna, id, "dries_fast", "2026-10-03");
    await repots.tickSign(anna, id, "roots_out", "2026-10-03");
    expect(await repots.openSigns(anna, id)).toEqual([
      { sign: "roots_out", tickedOn: "2026-10-03" },
      { sign: "dries_fast", tickedOn: "2026-10-03" },
      { sign: "tips_over", tickedOn: "2026-10-03" },
    ]);
  });

  it("US-BES-19 a repot clears every open observation on its day, never before the tick, and keeps them as history", async () => {
    const id = await make(anna, "Umgetopft", "plant");
    await repots.tickSign(anna, id, "dries_fast", "2026-10-08");
    expect(await specimens.repot(anna, id, "2026-10-01", "2026-10-01")).toMatchObject({
      status: "plant",
    });
    expect(await repots.openSigns(anna, id)).toEqual([]);
    const rows = await withAccount(pool, anna, (c) =>
      c.query<{ ticked: string; cleared: string }>(
        `select to_char(ticked_on, 'YYYY-MM-DD') as ticked, to_char(cleared_on, 'YYYY-MM-DD') as cleared
           from repot_sign where specimen_id = $1`,
        [id],
      ),
    );
    expect(rows.rows).toEqual([{ ticked: "2026-10-08", cleared: "2026-10-08" }]);
  });

  it("US-BES-19 a cutting and an archived plant cannot be ticked, a foreign plant looks unknown (P-04)", async () => {
    const cutting = await make(anna, "Steckling Beobachtet", "cutting");
    expect(await repots.tickSign(anna, cutting, "roots_out", "2026-10-03")).toBe("not_a_plant");
    const archived = await make(anna, "Archiv Beobachtet", "plant");
    await specimens.archive(anna, archived, "abgegeben", "2026-10-01");
    expect(await repots.tickSign(anna, archived, "roots_out", "2026-10-03")).toBe("archived");
    const foreign = await make(ben, "Fremd Beobachtet", "plant");
    expect(await repots.tickSign(anna, foreign, "roots_out", "2026-10-03")).toBe("not_found");
    expect(await repots.openSigns(ben, foreign)).toEqual([]);
  });

  it("US-BES-19, P-04 the database refuses a second open observation of one sign and an unknown sign name", async () => {
    const id = await make(anna, "Doppelt", "plant");
    await repots.tickSign(anna, id, "roots_out", "2026-10-03");
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into repot_sign (account_id, specimen_id, sign, ticked_on) values ($1, $2, 'roots_out', '2026-10-04')",
          [anna, id],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into repot_sign (account_id, specimen_id, sign, ticked_on) values ($1, $2, 'yellow', '2026-10-04')",
          [anna, id],
        ),
      ),
    ).rejects.toThrow();
  });
});
