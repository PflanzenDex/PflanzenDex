import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, withAccount, openPool } from "../kernel/index.ts";
import { LocationPostgres } from "../light/index.ts";
import { SpecimenPostgres } from "./index.ts";

// US-BES-02, DM-BES-02, P-04: Exemplare je Konto (echte PostgreSQL, `make db-up`).
let pool: Pool;
let specimens: SpecimenPostgres;
let locations: LocationPostgres;
const anna = randomUUID();
const ben = randomUUID();
const species = randomUUID();
const values = {
  speciesId: species,
  name: "Bogenhanf",
  marker: null,
  locationId: null,
  caughtAt: "2026-10-03",
};

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  specimens = new SpecimenPostgres(pool);
  locations = new LocationPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await pool.query("delete from account where id = any($1)", [[anna, ben]]);
  await pool.end();
});

const location = async (account: string, name: string) => {
  const s = await locations.create(account, { name, lightZoneId: null, kind: "indoor" });
  if (typeof s === "string") throw new Error(s);
  return s;
};

describe("US-BES-02 specimens in the database", () => {
  it("creates a specimen with prefill and reads it back; status is plant", async () => {
    const z = await specimens.create(anna, { ...values, name: "Anlegen" });
    expect(z).toMatchObject({
      name: "Anlegen",
      speciesId: species,
      status: "plant",
      locationId: null,
    });
    expect(typeof z === "object" && (await specimens.find(anna, z.id))).toEqual(z);
  });

  it("caught_at stays the stored calendar date, regardless of the server's time zone (NFR-08)", async () => {
    const before = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const z = await specimens.create(anna, {
        ...values,
        name: "Datum",
        caughtAt: "2026-01-01",
      });
      expect(z).toMatchObject({ caughtAt: "2026-01-01" });
      const id = typeof z === "object" ? z.id : "";
      expect(await specimens.find(anna, id)).toMatchObject({ caughtAt: "2026-01-01" });
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
    }
  });

  it("the name is unique per account (case-insensitive), not across accounts", async () => {
    await specimens.create(anna, { ...values, name: "Eindeutig" });
    expect(await specimens.create(anna, { ...values, name: "EINDEUTIG" })).toBe("name_taken");
    expect(await specimens.create(ben, { ...values, name: "Eindeutig" })).toMatchObject({
      name: "Eindeutig",
    });
  });

  it("a location of the own account is allowed, that of another account is not (foreign key (account_id, id))", async () => {
    const own = await location(anna, "Regal Anna");
    const foreign = await location(ben, "Regal Ben");
    expect(
      await specimens.create(anna, { ...values, name: "Mit Standort", locationId: own.id }),
    ).toMatchObject({ locationId: own.id });
    expect(
      await specimens.create(anna, { ...values, name: "Fremder Standort", locationId: foreign.id }),
    ).toBe("location_unknown");
    expect((await specimens.list(anna)).map((z) => z.name)).not.toContain("Fremder Standort");
  });

  it("an account sees and loads only its own specimens (P-04)", async () => {
    const z = await specimens.create(anna, { ...values, name: "Nur Anna" });
    const id = typeof z === "object" ? z.id : "";
    expect(await specimens.find(ben, id)).toBeNull();
    expect((await specimens.list(ben)).map((x) => x.id)).not.toContain(id);
  });

  it("values outside the limits and an unknown status already fail in the database", async () => {
    await expect(specimens.create(anna, { ...values, name: "" })).rejects.toThrow();
    await expect(
      withAccount(pool, anna, (c) =>
        c.query(
          "insert into specimen (account_id, species_id, name, status) values ($1, $2, 'S', 'tot')",
          [anna, species],
        ),
      ),
    ).rejects.toThrow();
  });
});
