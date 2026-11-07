import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, withAccount } from "../kernel/index.ts";
import { EquipmentPostgres, PotPlacementPostgres, PotRepotPostgres } from "./index.ts";
import { RepotPostgres, SpecimenPostgres } from "../collection/index.ts";

// US-BES-19, DM-EQU-06, P-04, P-10: pot placements and the repot with a pot in the database (real PostgreSQL).
let pool: Pool;
let admin: Pool;
let equipment: EquipmentPostgres;
let placements: PotPlacementPostgres;
let specimens: SpecimenPostgres;
let repots: RepotPostgres;
let units: PotRepotPostgres;
const anna = randomUUID();
const ben = randomUUID();
let species = "";

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  equipment = new EquipmentPostgres(pool);
  placements = new PotPlacementPostgres(pool);
  specimens = new SpecimenPostgres(pool);
  repots = new RepotPostgres(pool);
  units = new PotRepotPostgres(pool);
  const { createFixtureSpeciesAt } = await import("../fixtures.ts");
  species = await createFixtureSpeciesAt();
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

const pot = async (user: string, name: string, diameterCm: number | null = 12) => {
  const r = await equipment.create(
    user,
    {
      type: "Pot",
      name,
      manufacturer: null,
      model: null,
      productId: null,
      priceEur: null,
      boughtAt: null,
      note: null,
      lightZoneId: null,
      diameterCm,
      heightCm: null,
      material: null,
      drainage: null,
    },
    "active",
  );
  if (typeof r === "string") throw new Error(r);
  return r.id;
};
const plant = async (user: string, name: string, status: "plant" | "cutting" = "plant") => {
  const r = await specimens.create(user, {
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

describe("US-BES-19 the placement of a plant into a pot (DM-EQU-06)", () => {
  it("US-BES-19 a free pot takes a plant, a second plant is refused as taken and nothing is written", async () => {
    const p = await pot(anna, "Topf frei");
    const first = await plant(anna, "Erste");
    const second = await plant(anna, "Zweite");
    expect(await placements.place(anna, first, p, "2026-10-01")).toEqual({
      potId: p,
      placedOn: "2026-10-01",
      changed: true,
    });
    expect(await placements.place(anna, second, p, "2026-10-02")).toBe("pot_taken");
    expect(await placements.currentPot(anna, second)).toBeNull();
    expect(await placements.currentPot(anna, first)).toMatchObject({ id: p, name: "Topf frei" });
  });

  it("US-BES-19 an archived plant frees its pot without a write; the next plant takes it and the stale placement closes", async () => {
    const p = await pot(anna, "Topf Archiv");
    const old = await plant(anna, "Alt");
    const next = await plant(anna, "Neu");
    await placements.place(anna, old, p, "2026-10-01");
    await specimens.archive(anna, old, "abgegeben", "2026-10-05");
    expect((await placements.freePots(anna)).map((x) => x.id)).toContain(p);
    expect(await placements.place(anna, next, p, "2026-10-06")).toMatchObject({
      potId: p,
      changed: true,
    });
    const rows = await withAccount(pool, anna, (c) =>
      c.query<{ specimen: string; left: string | null }>(
        `select specimen_id as specimen, to_char(left_on, 'YYYY-MM-DD') as left from pot_placement
          where pot_id = $1 order by placed_on`,
        [p],
      ),
    );
    expect(rows.rows.map((r) => [r.specimen === old, r.left])).toEqual([
      [true, "2026-10-06"],
      [false, null],
    ]);
  });

  it("US-BES-19 a foreign or defective pot is pot_not_found, a cutting cannot be the holder of a pot through the database either", async () => {
    const foreign = await pot(ben, "Fremdtopf");
    const mine = await plant(anna, "Mein");
    expect(await placements.place(anna, mine, foreign, "2026-10-01")).toBe("pot_not_found");
    const defective = await pot(anna, "Kaputt");
    await withAccount(pool, anna, (c) =>
      c.query("update equipment set status = 'defective' where id = $1", [defective]),
    );
    expect(await placements.place(anna, mine, defective, "2026-10-01")).toBe("pot_not_found");
    expect(await placements.currentPot(anna, mine)).toBeNull();
  });

  it("US-BES-19 taking a plant out closes its placement on the day; the same pot again changes nothing", async () => {
    const p = await pot(anna, "Topf raus");
    const x = await plant(anna, "Raus");
    await placements.place(anna, x, p, "2026-10-01");
    expect(await placements.place(anna, x, p, "2026-10-09")).toEqual({
      potId: p,
      placedOn: "2026-10-01",
      changed: false,
    });
    expect(await placements.place(anna, x, null, "2026-10-09")).toEqual({
      potId: null,
      placedOn: null,
      changed: true,
    });
    expect(await placements.currentPot(anna, x)).toBeNull();
    expect((await placements.freePots(anna)).map((q) => q.id)).toContain(p);
  });

  it("US-BES-19, P-04 a pot of another account is never listed as free and a placement of a foreign plant is not found", async () => {
    const benPot = await pot(ben, "Bens Topf");
    expect((await placements.freePots(anna)).map((q) => q.id)).not.toContain(benPot);
    const benPlant = await plant(ben, "Bens Pflanze");
    expect(await placements.place(anna, benPlant, null, "2026-10-01")).toEqual({
      potId: null,
      placedOn: null,
      changed: false,
    });
    expect(await placements.currentPot(ben, benPlant)).toBeNull();
  });
});

describe("US-BES-19 the repot with a pot is one transaction (US-BES-04, ADR 0012)", () => {
  it("US-BES-19 a refused placement rolls back the repot as well: the cutting stays a cutting and no repot is recorded", async () => {
    const taken = await pot(anna, "Topf belegt");
    const holder = await plant(anna, "Halter");
    await placements.place(anna, holder, taken, "2026-10-01");
    const cutting = await plant(anna, "Steckling Rollback", "cutting");
    const result = await units.run<unknown>(anna, async (steps) => {
      const repot = await steps.specimens.repot(anna, cutting, "2026-10-02", "2026-10-02");
      if (typeof repot === "string") return { commit: false, value: repot };
      const placed = await steps.pots.place(anna, cutting, taken, "2026-10-02");
      if (typeof placed === "string") return { commit: false, value: placed };
      return { commit: true, value: placed };
    });
    expect(result).toBe("pot_taken");
    expect((await specimens.find(anna, cutting))?.status).toBe("cutting");
    expect((await repots.lastRepotted(anna, [cutting])).has(cutting)).toBe(false);
  });

  it("US-BES-19 a committed unit repots the cutting and places it in its pot on the same day", async () => {
    const free = await pot(anna, "Topf gemeinsam");
    const cutting = await plant(anna, "Steckling Gemeinsam", "cutting");
    const result = await units.run<unknown>(anna, async (steps) => {
      const repot = await steps.specimens.repot(anna, cutting, "2026-10-03", "2026-10-03");
      if (typeof repot === "string") return { commit: false, value: repot };
      const placed = await steps.pots.place(anna, cutting, free, "2026-10-03");
      if (typeof placed === "string") return { commit: false, value: placed };
      return { commit: true, value: placed };
    });
    expect(result).toMatchObject({ potId: free, placedOn: "2026-10-03", changed: true });
    expect(await specimens.find(anna, cutting)).toMatchObject({
      status: "plant",
      repottedAt: "2026-10-03",
    });
    expect((await repots.lastRepotted(anna, [cutting])).get(cutting)).toBe("2026-10-03");
  });
});
