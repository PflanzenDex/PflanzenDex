import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SpecimenPostgres } from "../collection/index.ts";
import { createFixtureSpeciesAt } from "../fixtures.ts";
import { migrate, withAccount, openOwnerPool, openFixturePool } from "../kernel/index.ts";
import { LeavesPostgres } from "./index.ts";

// US-WAC-07, DM-WAC-02, P-04: leaves per account (real PostgreSQL, `make db-up`).
let pool: Pool;
// Deliberate cross-tenant cleanup of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
let leaves: LeavesPostgres;
const anna = randomUUID();
const ben = randomUUID();
let plantAnna = "";
let plantBen = "";
let species = "";
const values = (extra: Record<string, unknown> = {}) => ({
  specimenId: plantAnna,
  date: "2026-10-03",
  lengthMm: null,
  widthMm: null,
  note: null,
  ...extra,
});

async function plant(account: string, name: string): Promise<string> {
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
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  species = await createFixtureSpeciesAt();
  leaves = new LeavesPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
  plantAnna = await plant(anna, "Anna Pflanze");
  plantBen = await plant(ben, "Ben Pflanze");
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

describe("US-WAC-07 leaves in the database", () => {
  it("US-WAC-07 stores a tap-only leaf with no size and no note, and reads its date back as text", async () => {
    const z = await leaves.create(anna, values());
    expect(z).toMatchObject({
      specimenId: plantAnna,
      date: "2026-10-03",
      lengthMm: null,
      widthMm: null,
      note: null,
    });
    expect(typeof (z as { createdAt: unknown }).createdAt).toBe("string");
  });

  it("US-WAC-07 stores sizes and a note, and lists the newest date first, the one created last on a tie", async () => {
    const older = await leaves.create(anna, values({ date: "2026-09-01", lengthMm: 20 }));
    const first = await leaves.create(anna, values({ date: "2026-10-05", widthMm: 7 }));
    const second = await leaves.create(
      anna,
      values({ date: "2026-10-05", lengthMm: 31, widthMm: 9, note: "Fensterung" }),
    );
    const listed = await leaves.list(anna, plantAnna);
    expect(listed.map((l) => l.id).slice(0, 2)).toEqual([
      (second as { id: string }).id,
      (first as { id: string }).id,
    ]);
    expect(listed.find((l) => l.id === (older as { id: string }).id)).toMatchObject({
      date: "2026-09-01",
      lengthMm: 20,
    });
    expect(listed.find((l) => l.id === (second as { id: string }).id)).toMatchObject({
      lengthMm: 31,
      widthMm: 9,
      note: "Fensterung",
    });
  });

  it("US-WAC-07 another account can neither list nor delete the leaves of a plant (P-04)", async () => {
    const mine = (await leaves.create(anna, values({ lengthMm: 15 }))) as { id: string };
    expect(await leaves.list(ben, plantAnna)).toEqual([]);
    expect(await leaves.remove(ben, plantAnna, mine.id)).toBe(false);
    expect((await leaves.list(anna, plantAnna)).some((l) => l.id === mine.id)).toBe(true);
  });

  it("US-WAC-07 a plant of another account is unknown for a create and writes nothing (P-04)", async () => {
    const r = await leaves.create(anna, values({ specimenId: plantBen }));
    expect(r).toBe("specimen_unknown");
    expect(await leaves.list(ben, plantBen)).toEqual([]);
  });

  it("US-WAC-07 removing a leaf takes it away; the same id again deletes nothing", async () => {
    const z = (await leaves.create(anna, values({ lengthMm: 12 }))) as { id: string };
    expect(await leaves.remove(anna, plantAnna, z.id)).toBe(true);
    expect(await leaves.remove(anna, plantAnna, z.id)).toBe(false);
  });

  it("US-WAC-07 a leaf of one plant cannot be removed through another plant of the same account", async () => {
    const z = (await leaves.create(anna, values({ lengthMm: 12 }))) as { id: string };
    const other = await plant(anna, "Anna zweite Pflanze");
    expect(await leaves.remove(anna, other, z.id)).toBe(false);
    expect(await leaves.remove(anna, plantAnna, z.id)).toBe(true);
  });

  it("US-WAC-07 the size and note limits are enforced by the database too (1 to 5000, 1 to 500 characters)", async () => {
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into leaf (account_id, specimen_id, date, length_mm) values ($1, $2, '2026-10-03', 5001)",
          [anna, plantAnna],
        ),
      ),
    ).rejects.toThrow(/leaf_length_mm_check/);
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into leaf (account_id, specimen_id, date, width_mm) values ($1, $2, '2026-10-03', 0)",
          [anna, plantAnna],
        ),
      ),
    ).rejects.toThrow(/leaf_width_mm_check/);
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into leaf (account_id, specimen_id, date, note) values ($1, $2, '2026-10-03', $3)",
          [anna, plantAnna, "a".repeat(501)],
        ),
      ),
    ).rejects.toThrow(/leaf_note_check/);
  });
});
