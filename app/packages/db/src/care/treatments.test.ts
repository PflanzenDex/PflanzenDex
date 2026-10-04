import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SpecimenPostgres } from "../collection/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { migrate, withAccount, openPool } from "../kernel/index.ts";
import { TreatmentsPostgres } from "./index.ts";

// US-BEH-01, DM-BEH-01, P-04: treatments per account (real PostgreSQL, `make db-up`).
let pool: Pool;
let treatments: TreatmentsPostgres;
const anna = randomUUID();
const ben = randomUUID();
let specimenAnna = "";
let specimenBen = "";
let species = "";
const values = (extra: Record<string, unknown> = {}) => ({
  specimenId: specimenAnna,
  reason: "Wollläuse",
  agent: null,
  dueAt: "2026-10-10",
  courseId: null,
  ...extra,
});

async function specimen(account: string, name: string): Promise<string> {
  const z = await new SpecimenPostgres(pool).create(account, {
    speciesId: species,
    name,
    marker: null,
    locationId: null,
    caughtAt: null,
  });
  if (typeof z === "string") throw new Error(z);
  return z.id;
}

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  species = await createFixtureSpeciesAt(pool);
  treatments = new TreatmentsPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  specimenAnna = await specimen(anna, "Anna Pflanze");
  specimenBen = await specimen(ben, "Ben Pflanze");
});
afterAll(async () => {
  await pool.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
});

describe("US-BEH-01 treatments in the database", () => {
  it("stores reason, agent, date and course, open and without a done date", async () => {
    const course = randomUUID();
    const r = await treatments.createMany(anna, [
      values({ agent: "Neemöl", courseId: course }),
      values({ dueAt: "2026-10-17", courseId: course }),
    ]);
    expect(r).toMatchObject([
      {
        specimenId: specimenAnna,
        reason: "Wollläuse",
        agent: "Neemöl",
        dueAt: "2026-10-10",
        done: false,
        doneAt: null,
        courseId: course,
      },
      { agent: null, dueAt: "2026-10-17", courseId: course },
    ]);
  });

  it("the date stays the stored calendar date, independent of the server's time zone (NFR-08)", async () => {
    const before = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const e = await specimen(anna, "Zeitzone");
      const r = await treatments.createMany(anna, [values({ specimenId: e, dueAt: "2026-01-01" })]);
      expect(r).toMatchObject([{ dueAt: "2026-01-01" }]);
      expect((await treatments.open(anna, [e])).get(e)).toMatchObject([{ dueAt: "2026-01-01" }]);
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
    }
  });

  it("all or nothing: one foreign specimen in the list writes none (P-04)", async () => {
    const e = await specimen(anna, "Alles oder nichts");
    expect(
      await treatments.createMany(anna, [
        values({ specimenId: e }),
        values({ specimenId: specimenBen }),
      ]),
    ).toBe("specimen_unknown");
    expect((await treatments.open(anna, [e])).size).toBe(0);
    expect((await treatments.open(ben, [specimenBen])).size).toBe(0);
  });

  it("values outside the limits fail already in the database", async () => {
    for (const extra of [{ reason: "" }, { reason: "x".repeat(201) }, { agent: "" }])
      await expect(treatments.createMany(anna, [values(extra)])).rejects.toThrow();
  });

  it("deleting the account takes its treatments along", async () => {
    const account = randomUUID();
    await withAccount(pool, account, (c) =>
      c.query("insert into account (id) values ($1)", [account]),
    );
    const ex = await specimen(account, "Weg");
    await treatments.createMany(account, [values({ specimenId: ex })]);
    await pool.query("delete from account where id = $1", [account]);
    const r = await pool.query("select 1 from treatment where specimen_id = $1", [ex]);
    expect(r.rowCount).toBe(0);
  });
});

describe("US-BEH-01 open treatments per specimen (for the cards, US-BES-06)", () => {
  it("returns only open treatments, earliest first, grouped by specimen; one query for all IDs", async () => {
    const a = await specimen(anna, "Offen A");
    const b = await specimen(anna, "Offen B");
    const none = await specimen(anna, "Ohne");
    await treatments.createMany(anna, [
      values({ specimenId: a, dueAt: "2026-10-20", reason: "später" }),
      values({ specimenId: a, dueAt: "2026-10-05", reason: "früher" }),
      values({ specimenId: b, dueAt: "2026-10-07" }),
    ]);
    await pool.query(
      "update treatment set done = true, done_at = '2026-10-04' where reason = 'früher'",
    );
    const r = await treatments.open(anna, [a, b, none]);
    expect([...r.keys()].sort()).toEqual([a, b].sort());
    expect(r.get(a)?.map((t) => t.reason)).toEqual(["später"]);
    expect(r.get(b)).toHaveLength(1);
    expect((await treatments.open(anna, [])).size).toBe(0);
  });

  it("tenant: Ben asks for Anna's specimen and gets nothing; Anna does not see Ben's treatment", async () => {
    const e = await specimen(anna, "Anna's open");
    await treatments.createMany(anna, [values({ specimenId: e })]);
    await treatments.createMany(ben, [values({ specimenId: specimenBen })]);
    expect((await treatments.open(ben, [e])).size).toBe(0);
    expect((await treatments.open(anna, [specimenBen])).size).toBe(0);
    expect((await treatments.open(ben, [specimenBen])).size).toBe(1);
  });

  it("a done treatment needs its done date and the other way round (FR-BEH-03)", async () => {
    await expect(
      pool.query("update treatment set done = true where specimen_id = $1", [specimenAnna]),
    ).rejects.toThrow();
  });
});

describe("US-BEH-03 ticking off in the database", () => {
  async function open(account: string, specimenId: string, dueAt = "2026-10-10") {
    const r = await treatments.createMany(account, [values({ specimenId, dueAt })]);
    if (typeof r === "string") throw new Error(r);
    return (r[0] as { id: string }).id;
  }

  it("US-BEH-03 sets done and the done date in one statement and returns the row", async () => {
    const id = await open(anna, specimenAnna);
    expect(await treatments.complete(anna, id, "2026-10-03")).toMatchObject({
      id,
      done: true,
      doneAt: "2026-10-03",
      dueAt: "2026-10-10",
    });
    expect(await treatments.find(anna, id)).toMatchObject({ done: true, doneAt: "2026-10-03" });
  });

  it("US-BEH-03 the second call (second device) changes nothing and keeps the first done date", async () => {
    const id = await open(anna, specimenAnna);
    const first = await treatments.complete(anna, id, "2026-10-03");
    const again = await treatments.complete(anna, id, "2026-10-09");
    expect(again).toEqual(first);
    expect(await treatments.find(anna, id)).toMatchObject({ doneAt: "2026-10-03" });
  });

  it("US-BEH-03 the done date is the stored calendar date, independent of the server's time zone (NFR-08)", async () => {
    const before = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const id = await open(anna, specimenAnna);
      expect(await treatments.complete(anna, id, "2026-01-01")).toMatchObject({
        doneAt: "2026-01-01",
      });
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
    }
  });

  it("US-BEH-03 tenant: a foreign or unknown ID is unknown and stays untouched (P-04)", async () => {
    const id = await open(ben, specimenBen);
    expect(await treatments.complete(anna, id, "2026-10-03")).toBe("unknown");
    expect(await treatments.find(anna, id)).toBeNull();
    expect(await treatments.find(ben, id)).toMatchObject({ done: false, doneAt: null });
    expect(await treatments.complete(anna, randomUUID(), "2026-10-03")).toBe("unknown");
  });

  it("US-BEH-03 the history lists the done treatments of one specimen, latest done date first, no open ones", async () => {
    const e = await specimen(anna, "Verlauf");
    const a = await open(anna, e, "2026-10-01");
    const b = await open(anna, e, "2026-10-08");
    await open(anna, e, "2026-10-15");
    await treatments.complete(anna, a, "2026-10-02");
    await treatments.complete(anna, b, "2026-10-09");
    expect((await treatments.done(anna, e)).map((t) => t.id)).toEqual([b, a]);
    expect((await treatments.open(anna, [e])).get(e)).toHaveLength(1);
  });

  it("US-BEH-03 tenant: Ben's history of Anna's specimen is empty (P-04)", async () => {
    const e = await specimen(anna, "Privat");
    await treatments.complete(anna, await open(anna, e), "2026-10-03");
    expect(await treatments.done(ben, e)).toEqual([]);
    expect(await treatments.done(anna, e)).toHaveLength(1);
  });
});
