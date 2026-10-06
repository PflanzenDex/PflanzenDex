import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, withAccount, openOwnerPool, openFixturePool } from "../kernel/index.ts";
import {
  speciesExists,
  createFixtureSpeciesAt,
  deleteSpecies,
  deleteSpeciesAsApplication,
} from "../fixtures.ts";
import { LocationPostgres } from "../light/index.ts";
import { SpecimenPostgres } from "./index.ts";

// US-BES-02, DM-BES-02, P-04: Exemplare je Konto (echte PostgreSQL, `make db-up`).
let pool: Pool;
// Deliberate cross-tenant cleanup/observation of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
let specimens: SpecimenPostgres;
let locations: LocationPostgres;
const anna = randomUUID();
const ben = randomUUID();
let species = "";
const values: {
  speciesId: string;
  name: string;
  marker: null;
  locationId: null;
  caughtAt: string;
} = {
  speciesId: "",
  name: "Bogenhanf",
  marker: null,
  locationId: null,
  caughtAt: "2026-10-03",
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  species = await createFixtureSpeciesAt();
  values.speciesId = species;
  specimens = new SpecimenPostgres(pool);
  locations = new LocationPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
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

  it("US-BES-02, AB-10: the foreign key holds, an unknown species cannot be entered", async () => {
    await expect(
      specimens.create(anna, { ...values, name: "Ohne Art", speciesId: randomUUID() }),
    ).rejects.toMatchObject({ code: "23503", constraint: "specimen_species" });
    expect((await specimens.list(anna)).map((z) => z.name)).not.toContain("Ohne Art");
  });

  it("US-BES-02, AB-10, P-10: a used species cannot be deleted (on delete restrict), not even with owner rights", async () => {
    const z = await specimens.create(anna, { ...values, name: "Benutzt" });
    expect(typeof z).toBe("object");
    await expect(deleteSpecies(species)).rejects.toMatchObject({
      code: "23503",
      constraint: "specimen_species",
    });
    expect(await speciesExists(species)).toBe(true);
  });

  it("US-BES-02, AB-10: the application role still may not delete species", async () => {
    await expect(deleteSpeciesAsApplication(pool, anna, species)).rejects.toMatchObject({
      code: "42501",
    });
  });
});

describe("US-BES-07 archive in the database", () => {
  const create = async (account: string, name: string) => {
    const z = await specimens.create(account, { ...values, name });
    if (typeof z === "string") throw new Error(z);
    return z;
  };

  it("US-BES-07: sets status, date and reason; the date stays the calendar date (NFR-08)", async () => {
    const before = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const z = await create(anna, "Archiv Datum");
      const r = await specimens.archive(anna, z.id, "eingegangen", "2026-01-01");
      expect(r).toMatchObject({
        status: "archived",
        archivedAt: "2026-01-01",
        archivedReason: "eingegangen",
      });
      expect(await specimens.find(anna, z.id)).toEqual(r);
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
    }
  });

  it("US-BES-07: a second archiving does not change date and reason (P-10)", async () => {
    const z = await create(anna, "Archiv Zweimal");
    await specimens.archive(anna, z.id, "eingegangen", "2026-10-01");
    expect(await specimens.archive(anna, z.id, "verkauft", "2026-10-03")).toBe("already_archived");
    expect(await specimens.find(anna, z.id)).toMatchObject({
      archivedAt: "2026-10-01",
      archivedReason: "eingegangen",
    });
  });

  it("US-BES-07: restoring sets the previous status and deletes date and reason", async () => {
    const z = await create(anna, "Archiv Zurück");
    await withAccount(pool, anna, (c) =>
      c.query("update specimen set status = 'cutting' where id = $1", [z.id]),
    );
    await specimens.archive(anna, z.id, "abgegeben", "2026-10-01");
    expect(await specimens.restore(anna, z.id)).toMatchObject({
      status: "cutting",
      archivedAt: null,
      archivedReason: null,
    });
    expect(await specimens.restore(anna, z.id)).toBe("not_archived");
  });

  it("US-BES-07, P-04: another account can neither archive nor restore", async () => {
    const z = await create(anna, "Archiv Mandant");
    expect(await specimens.archive(ben, z.id, "verkauft", "2026-10-03")).toBe("not_found");
    await specimens.archive(anna, z.id, "verkauft", "2026-10-03");
    expect(await specimens.restore(ben, z.id)).toBe("not_found");
    expect(await specimens.find(anna, z.id)).toMatchObject({ status: "archived" });
  });

  it("US-BES-07: status, date and reason belong together (the database enforces it)", async () => {
    const z = await create(anna, "Archiv Check");
    const set = (sql: string) => withAccount(pool, anna, (c) => c.query(sql, [z.id]));
    await expect(
      set("update specimen set status = 'archived' where id = $1"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      set("update specimen set archived_reason = 'x' where id = $1"),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("US-BES-07: an archived name stays taken, so restoring never collides", async () => {
    const z = await create(anna, "Archiv Name");
    await specimens.archive(anna, z.id, "verkauft", "2026-10-03");
    expect(await specimens.create(anna, { ...values, name: "archiv name" })).toBe("name_taken");
  });
});

describe("US-BES-04 cutting in the database", () => {
  it("US-BES-04: creates a cutting with status cutting; without a value it is a plant", async () => {
    const cutting = await specimens.create(anna, {
      ...values,
      name: "Steckling Anlegen",
      status: "cutting",
    });
    expect(cutting).toMatchObject({ name: "Steckling Anlegen", status: "cutting" });
    const plant = await specimens.create(anna, { ...values, name: "Pflanze Anlegen" });
    expect(plant).toMatchObject({ status: "plant" });
  });

  it("US-BES-04: repotting turns a cutting into a plant and leaves everything else alone", async () => {
    const z = await specimens.create(anna, {
      ...values,
      name: "Steckling Eintopfen",
      status: "cutting",
    });
    if (typeof z === "string") throw new Error(z);
    const r = await specimens.repot(anna, z.id);
    expect(r).toEqual({ ...z, status: "plant" });
    expect(await specimens.find(anna, z.id)).toEqual({ ...z, status: "plant" });
  });

  it("US-BES-04: a plant and an archived cutting report not_a_cutting and stay unchanged", async () => {
    const plant = await specimens.create(anna, { ...values, name: "Pflanze Topf" });
    const archived = await specimens.create(anna, {
      ...values,
      name: "Steckling Archiv",
      status: "cutting",
    });
    if (typeof plant === "string" || typeof archived === "string") throw new Error("create");
    await specimens.archive(anna, archived.id, "abgegeben", "2026-10-03");
    expect(await specimens.repot(anna, plant.id)).toBe("not_a_cutting");
    expect(await specimens.repot(anna, archived.id)).toBe("not_a_cutting");
    expect((await specimens.find(anna, archived.id))?.status).toBe("archived");
    expect(await specimens.find(anna, plant.id)).toEqual(plant);
  });

  it("US-BES-04, P-04: another account cannot repot the cutting and does not see it", async () => {
    const z = await specimens.create(anna, {
      ...values,
      name: "Steckling Fremd",
      status: "cutting",
    });
    if (typeof z === "string") throw new Error(z);
    expect(await specimens.repot(ben, z.id)).toBe("not_found");
    expect((await specimens.find(anna, z.id))?.status).toBe("cutting");
  });

  it("US-BES-04: an unknown id is not found", async () => {
    expect(await specimens.repot(anna, randomUUID())).toBe("not_found");
  });
});

describe("US-ACC-03 count of the active specimens (start page)", () => {
  it("US-ACC-03 counts the active specimens of the account only, archived ones not, and writes nothing", async () => {
    const carla = randomUUID();
    await withAccount(pool, carla, (c) => c.query("insert into account (id) values ($1)", [carla]));
    expect(await specimens.countByStatus(carla)).toEqual({ active: 0, archived: 0 });
    const a = await specimens.create(carla, { ...values, name: "Zähler 1" });
    const b = await specimens.create(carla, { ...values, name: "Zähler 2" });
    if (typeof a === "string" || typeof b === "string") throw new Error("create failed");
    expect(await specimens.countByStatus(carla)).toEqual({ active: 2, archived: 0 });
    await specimens.archive(carla, a.id, "abgegeben", "2026-10-03");
    expect(await specimens.countByStatus(carla)).toEqual({ active: 1, archived: 1 });
    // US-ACC-03 (#291): an account with only archived plants still counts them.
    await specimens.archive(carla, b.id, "eingegangen", "2026-10-04");
    expect(await specimens.countByStatus(carla)).toEqual({ active: 0, archived: 2 });
    expect(await specimens.countByStatus(randomUUID())).toEqual({ active: 0, archived: 0 });
    await admin.query("delete from account where id = $1", [carla]);
  });
});

describe("US-BES-11 correct the catch date in the database", () => {
  const create = async (account: string, name: string) => {
    const z = await specimens.create(account, { ...values, name });
    if (typeof z === "string") throw new Error(z);
    return z;
  };

  it("US-BES-11: only caught_at changes; the date stays the calendar date (NFR-08)", async () => {
    const before = process.env["TZ"];
    process.env["TZ"] = "Pacific/Kiritimati";
    try {
      const z = await create(anna, "Fang Korrektur");
      const r = await specimens.setCaughtAt(anna, z.id, "2019-05-17");
      expect(r).toEqual({ ...z, caughtAt: "2019-05-17" });
      expect(await specimens.find(anna, z.id)).toEqual(r);
    } finally {
      if (before === undefined) delete process.env["TZ"];
      else process.env["TZ"] = before;
    }
  });

  it("US-BES-11: an archived specimen up to its archiving date; a later date changes nothing", async () => {
    const z = await create(anna, "Fang Archiv");
    await specimens.archive(anna, z.id, "abgegeben", "2026-01-10");
    expect(await specimens.setCaughtAt(anna, z.id, "2026-01-11")).toBe("after_archived");
    expect(await specimens.find(anna, z.id)).toMatchObject({ caughtAt: "2026-10-03" });
    expect(await specimens.setCaughtAt(anna, z.id, "2026-01-10")).toMatchObject({
      caughtAt: "2026-01-10",
      status: "archived",
      archivedAt: "2026-01-10",
      archivedReason: "abgegeben",
    });
  });

  it("US-BES-11, P-04: another account cannot correct it and gets the answer of an unknown specimen", async () => {
    const z = await create(anna, "Fang Mandant");
    expect(await specimens.setCaughtAt(ben, z.id, "2020-01-01")).toBe("not_found");
    expect(await specimens.setCaughtAt(anna, randomUUID(), "2020-01-01")).toBe("not_found");
    expect(await specimens.find(anna, z.id)).toMatchObject({ caughtAt: "2026-10-03" });
  });
});
