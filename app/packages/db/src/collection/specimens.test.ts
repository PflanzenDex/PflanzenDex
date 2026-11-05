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
import { createFixtureSpecimen } from "../fixtures.ts";
import {
  SpecimenPostgres,
  specimenCounts,
  specimenAnyActive,
  specimenPage,
  treatableSpecimens,
  unlockSummaryOf,
} from "./index.ts";
import type { SpecimenValues } from "./specimens.ts";

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
    // PostgreSQL 18 reports ON DELETE RESTRICT as restrict_violation (23001); 16 and 17 as foreign_key_violation (23503).
    const refused = await deleteSpecies(species).then(
      () => null,
      (e: { code?: string; constraint?: string }) => e,
    );
    expect(refused).not.toBeNull();
    expect(["23503", "23001"]).toContain(refused?.code);
    expect(refused?.constraint).toBe("specimen_species");
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
    const r = await specimens.repot(anna, z.id, null, null);
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
    expect(await specimens.repot(anna, plant.id, null, null)).toBe("not_a_cutting");
    expect(await specimens.repot(anna, archived.id, null, null)).toBe("not_a_cutting");
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
    expect(await specimens.repot(ben, z.id, null, null)).toBe("not_found");
    expect((await specimens.find(anna, z.id))?.status).toBe("cutting");
  });

  it("US-BES-04: an unknown id is not found", async () => {
    expect(await specimens.repot(anna, randomUUID(), null, null)).toBe("not_found");
  });

  it("US-BES-04: a chosen day before the catch date answers before_caught and writes nothing; the catch day itself is allowed", async () => {
    const z = await specimens.create(anna, {
      ...values,
      name: "Steckling Vor Fang",
      status: "cutting",
    });
    if (typeof z === "string") throw new Error(z);
    expect(await specimens.repot(anna, z.id, "2026-10-02", "2026-10-02")).toBe("before_caught");
    expect(await specimens.find(anna, z.id)).toEqual(z);
    expect(await specimens.repot(anna, z.id, "2026-10-03", "2026-10-03")).toMatchObject({
      status: "plant",
      repottedAt: "2026-10-03",
    });
  });

  it("US-BES-04, P-04: a foreign cutting is not_found even when the chosen day is before its catch date", async () => {
    const z = await specimens.create(anna, {
      ...values,
      name: "Steckling Fremd Fang",
      status: "cutting",
    });
    if (typeof z === "string") throw new Error(z);
    expect(await specimens.repot(ben, z.id, "2026-10-02", "2026-10-02")).toBe("not_found");
  });

  it("US-BES-04: a cutting without a catch date accepts any chosen day (unknown, P-08)", async () => {
    const z = await specimens.create(anna, {
      ...values,
      name: "Steckling ohne Fang",
      caughtAt: null,
      status: "cutting",
    });
    if (typeof z === "string") throw new Error(z);
    expect(await specimens.repot(anna, z.id, "1900-01-01", "1900-01-01")).toMatchObject({
      status: "plant",
      repottedAt: "1900-01-01",
    });
  });
});

describe("NFR-12 the summary the unlock rules read", () => {
  it("NFR-12 counts the active specimens, keeps the first date of an archived one, and only its own (P-04)", async () => {
    const fresh = randomUUID();
    await admin.query("insert into account (id) values ($1)", [fresh]);
    try {
      expect(await unlockSummaryOf(pool, fresh)).toEqual({ active: 0, firstCreatedAt: null });
      const first = await createFixtureSpecimen(pool, fresh, "Erste");
      await createFixtureSpecimen(pool, fresh, "Zweite");
      await admin.query(
        "update specimen set created_at = '2026-01-02T23:30:00Z', status = 'archived', archived_at = now(), archived_reason = 'eingegangen' where id = $1",
        [first],
      );
      expect(await unlockSummaryOf(pool, fresh)).toEqual({
        active: 1,
        firstCreatedAt: "2026-01-02T23:30:00Z",
      });
      expect(await unlockSummaryOf(pool, randomUUID())).toEqual({
        active: 0,
        firstCreatedAt: null,
      });
    } finally {
      await admin.query("delete from account where id = $1", [fresh]);
    }
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

describe("US-SOZ-05 the day of the repot", () => {
  it("is stored with the repot, read back as a calendar date and null while unknown; a plant is not repotted again", async () => {
    const species = await createFixtureSpeciesAt();
    const make = async (name: string) => {
      const r = await new SpecimenPostgres(pool).create(anna, {
        speciesId: species,
        name,
        marker: null,
        locationId: null,
        caughtAt: "2026-09-01",
        status: "cutting",
      });
      if (typeof r === "string") throw new Error(r);
      return r.id;
    };
    const dated = await make("Datiert");
    const undated = await make("Undatiert");
    const repo = new SpecimenPostgres(pool);
    expect(await repo.repot(anna, dated, "2026-10-10", "2026-10-10")).toMatchObject({
      status: "plant",
      repottedAt: "2026-10-10",
    });
    expect(await repo.repot(anna, undated, null, null)).toMatchObject({
      status: "plant",
      repottedAt: null,
    });
    expect(await repo.repot(anna, dated, "2026-10-11", "2026-10-11")).toBe("not_a_cutting");
    expect((await repo.find(anna, dated))?.repottedAt).toBe("2026-10-10");
  });
});

describe("NFR-12 specimens in one read", () => {
  it("NFR-12 findMany equals find per ID: same order, foreign and unknown IDs are null", async () => {
    const mine = await specimens.create(anna, { ...values, name: "Viele eigen" });
    const theirs = await specimens.create(ben, { ...values, name: "Viele fremd" });
    if (typeof mine === "string" || typeof theirs === "string") throw new Error("seed");
    const ids = [mine.id, theirs.id, randomUUID(), mine.id.toUpperCase()];
    for (const user of [anna, ben])
      expect(await specimens.findMany(user, ids)).toEqual(
        await Promise.all(ids.map((id) => specimens.find(user, id))),
      );
    expect((await specimens.findMany(anna, ids)).map((x) => x?.id ?? null)).toEqual([
      mine.id,
      null,
      null,
      mine.id,
    ]);
    expect(await specimens.findMany(anna, [])).toEqual([]);
  });

  it("NFR-12 findMany needs one statement for any number of specimens", async () => {
    const made = [];
    for (let i = 0; i < 6; i++) {
      const z = await specimens.create(anna, { ...values, name: `Zaehl ${i} ${randomUUID()}` });
      if (typeof z === "string") throw new Error(z);
      made.push(z.id);
    }
    let statements = 0;
    const counted = new Proxy(pool, {
      get(target, prop) {
        if (prop === "connect")
          return async () => {
            const c = await target.connect();
            return new Proxy(c, {
              get(client, p) {
                const v = Reflect.get(client, p, client) as unknown;
                if (p !== "query") return typeof v === "function" ? v.bind(client) : v;
                return (...a: unknown[]) => (
                  statements++,
                  (v as (...x: unknown[]) => unknown).apply(client, a)
                );
              },
            });
          };
        const v = Reflect.get(target, prop, target) as unknown;
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const few = await new SpecimenPostgres(counted).findMany(anna, made.slice(0, 2));
    const afterFew = statements;
    statements = 0;
    const many = await new SpecimenPostgres(counted).findMany(anna, made);
    expect(few.every((x) => x !== null) && many.every((x) => x !== null)).toBe(true);
    expect(statements).toBe(afterFew);
  });

  it("NFR-12 findMany equals find for archived and foreign specimens; no IDs send no statement", async () => {
    const made = await specimens.create(anna, { ...values, name: `Archiv ${randomUUID()}` });
    if (typeof made === "string") throw new Error(made);
    expect(await specimens.archive(anna, made.id, "eingegangen", "2026-10-05")).toMatchObject({
      status: "archived",
    });
    const ids = [made.id, randomUUID()];
    for (const user of [anna, ben])
      expect(await specimens.findMany(user, ids)).toEqual(
        await Promise.all(ids.map((id) => specimens.find(user, id))),
      );
    // The archived specimen is returned by find and by findMany alike; a foreign one is null for the other account.
    expect((await specimens.findMany(anna, ids))[0]).toMatchObject({
      id: made.id,
      status: "archived",
    });
    expect(await specimens.findMany(ben, [made.id])).toEqual([null]);
    const counted = countedPool(pool);
    expect(await new SpecimenPostgres(counted.pool).findMany(anna, [])).toEqual([]);
    expect(counted.count()).toBe(0);
  });
});

/** The pool with a count of the statements sent through it and its connections (NFR-12, US-QG-07). */
function countedPool(target: Pool): { pool: Pool; count: () => number } {
  let n = 0;
  const wrap = <T extends object>(obj: T): T =>
    new Proxy(obj, {
      get(o, prop) {
        const v = Reflect.get(o, prop, o) as unknown;
        if (prop === "query")
          return (...a: unknown[]) => (n++, (v as (...x: unknown[]) => unknown).apply(o, a));
        if (prop === "connect") return async () => wrap(await (v as () => Promise<object>).call(o));
        return typeof v === "function" ? v.bind(o) : v;
      },
    });
  return { pool: wrap(target), count: () => n };
}

// US-BES-06 · NFR-12 · FR-BES-23: the paged card list, its filters and the summary read the database directly. Each test
// uses fresh accounts, so the counts are exact; the accounts are removed afterwards. Place names are resolved by `core`.
describe("US-BES-06 · NFR-12 · FR-BES-23 paged card list, summary and treatment list (database)", () => {
  const accounts: string[] = [];
  const fresh = async (): Promise<string> => {
    const id = randomUUID();
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
    accounts.push(id);
    return id;
  };
  const plant = async (account: string, name: string, extra: Partial<SpecimenValues> = {}) => {
    const r = await specimens.create(account, { ...values, name, ...extra });
    if (typeof r === "string") throw new Error(r);
    return r;
  };
  const cursorAfter = (row: { name: string; id: string } | undefined) => ({
    name: row?.name ?? "",
    id: row?.id ?? "",
  });
  const page = (
    account: string,
    q: {
      limit?: number;
      after?: { name: string; id: string } | null;
      location?: string | "none" | null;
      species?: string | null;
    } = {},
  ) =>
    specimenPage(pool, account, {
      limit: q.limit ?? 100,
      after: q.after ?? null,
      location: q.location ?? null,
      species: q.species ?? null,
    });
  afterAll(async () => {
    await admin.query("delete from account where id = any($1)", [accounts]);
  });

  it("FR-BES-23 pages in name order: a page holds `limit` rows, `more` tells whether a row follows, `total` counts the whole filter", async () => {
    const a = await fresh();
    for (const n of ["Dill", "aloe", "Basilikum", "Chili", "Efeu"]) await plant(a, n);
    const first = await page(a, { limit: 2 });
    expect(first).toMatchObject({ more: true, total: 5 });
    expect(first.rows.map((r) => r.name)).toEqual(["aloe", "Basilikum"]);
    const second = await page(a, { limit: 2, after: cursorAfter(first.rows.at(-1)) });
    expect(second).toMatchObject({ more: true, total: 5 });
    expect(second.rows.map((r) => r.name)).toEqual(["Chili", "Dill"]);
    const third = await page(a, { limit: 2, after: cursorAfter(second.rows.at(-1)) });
    expect(third).toMatchObject({ more: false, total: 5 });
    expect(third.rows.map((r) => r.name)).toEqual(["Efeu"]);
  });

  it("FR-BES-23 no skip and no repeat while a plant is added or archived between two pages, also when the cursor row itself is archived", async () => {
    const a = await fresh();
    const ids = new Map<string, string>();
    for (const n of ["Anke", "Bruno", "Clara", "Dieter", "Emil", "Frieda"])
      ids.set(n, (await plant(a, n)).id);
    const idOf = (name: string) => ids.get(name) ?? "";
    const first = await page(a, { limit: 2 });
    expect(first.rows.map((r) => r.name)).toEqual(["Anke", "Bruno"]);
    // Between the pages: one plant is added before the cursor, the cursor row, one after it and one shown already go.
    await plant(a, "0 Neu");
    await specimens.archive(a, idOf("Bruno"), "abgegeben", "2026-10-04");
    await specimens.archive(a, idOf("Clara"), "eingegangen", "2026-10-04");
    await specimens.archive(a, idOf("Anke"), "verschenkt", "2026-10-04");
    const second = await page(a, { limit: 2, after: cursorAfter(first.rows.at(-1)) });
    const third = await page(a, { limit: 2, after: cursorAfter(second.rows.at(-1)) });
    const seen = [...first.rows, ...second.rows, ...third.rows].map((r) => r.name);
    expect(seen).toEqual(["Anke", "Bruno", "Dieter", "Emil", "Frieda"]);
    expect(new Set(seen).size).toBe(seen.length);
    expect(third).toMatchObject({ more: false, total: 4 });
  });

  it("US-BES-06 the same name in two accounts pages separately: each account sees its own rows only (P-04)", async () => {
    const a = await fresh();
    const b = await fresh();
    for (const n of ["Gleich", "Ungleich"]) {
      await plant(a, n);
      await plant(b, n);
    }
    const mine = await page(a);
    const theirs = await page(b);
    expect(mine.rows.map((r) => r.name)).toEqual(["Gleich", "Ungleich"]);
    expect(theirs.rows.map((r) => r.name)).toEqual(["Gleich", "Ungleich"]);
    expect(mine.rows.map((r) => r.id)).not.toEqual(theirs.rows.map((r) => r.id));
    expect(mine.total).toBe(2);
  });

  it("FR-BES-23 location filter: a location, or `none` for plants without one; the total follows the filter; a foreign location shows nothing (P-04)", async () => {
    const a = await fresh();
    const b = await fresh();
    const shelf = await location(a, "Regal");
    const box = await location(a, "Kiste");
    const foreign = await location(b, "Fremd");
    await plant(a, "Am Regal", { locationId: shelf.id });
    await plant(a, "Andere Art", { locationId: shelf.id });
    await plant(a, "In der Kiste", { locationId: box.id });
    await plant(a, "Ohne Ort", { locationId: null });
    const atShelf = await page(a, { location: shelf.id, limit: 1 });
    expect(atShelf).toMatchObject({ more: true, total: 2 });
    expect(atShelf.rows.map((r) => r.name)).toEqual(["Am Regal"]);
    const unplaced = await page(a, { location: "none" });
    expect(unplaced).toMatchObject({ more: false, total: 1 });
    expect(unplaced.rows.map((r) => r.name)).toEqual(["Ohne Ort"]);
    expect(await page(a, { location: foreign.id })).toEqual({ rows: [], more: false, total: 0 });
  });

  it("FR-BES-23 species filter, and both filters together", async () => {
    const a = await fresh();
    const shelf = await location(a, "Regal");
    const fixture = await createFixtureSpeciesAt();
    await plant(a, "Aloe");
    await plant(a, "Basilikum", { locationId: shelf.id });
    expect(await page(a, { species: fixture })).toMatchObject({ total: 2 });
    expect(await page(a, { species: randomUUID() })).toEqual({ rows: [], more: false, total: 0 });
    expect(await page(a, { species: fixture, location: shelf.id })).toMatchObject({
      total: 1,
      rows: [expect.objectContaining({ name: "Basilikum" })],
    });
  });

  it("US-BES-06 archived specimens are missing from the page and the total; cuttings are listed", async () => {
    const a = await fresh();
    await plant(a, "Pflanze");
    await plant(a, "Steckling", { status: "cutting" });
    const gone = await plant(a, "Archiviert");
    await specimens.archive(a, gone.id, "eingegangen", "2026-10-04");
    const result = await page(a);
    expect(result).toMatchObject({ more: false, total: 2 });
    expect(result.rows.map((r) => r.name)).toEqual(["Pflanze", "Steckling"]);
  });

  it("US-BES-06 an account without specimens has an empty page, an empty summary and an empty treatment list", async () => {
    const a = await fresh();
    expect(await page(a)).toEqual({ rows: [], more: false, total: 0 });
    expect(await specimenCounts(pool, a)).toEqual({
      total: 0,
      unplaced: false,
      groups: [],
      lastLocationId: null,
    });
    expect(await treatableSpecimens(pool, a)).toEqual([]);
  });

  it("US-BES-06 summary covers all active plants: total, groups with their counts, unplaced, last location; archived plants count nowhere", async () => {
    const a = await fresh();
    const sued = await location(a, "Süd");
    const nord = await location(a, "Nord");
    await plant(a, "Eins", { locationId: sued.id, caughtAt: "2026-10-01" });
    await plant(a, "Zwei", { locationId: sued.id, caughtAt: "2026-10-02" });
    await plant(a, "Drei", { locationId: nord.id, caughtAt: "2026-09-30" });
    // The newest catch date, but no location: the last location is the one of the newest plant that has a location.
    await plant(a, "Vier", { locationId: null, caughtAt: "2026-10-03" });
    const gone = await plant(a, "Fünf", { locationId: nord.id, caughtAt: "2026-10-05" });
    await specimens.archive(a, gone.id, "abgegeben", "2026-10-06");
    const counts = await specimenCounts(pool, a);
    expect(counts).toMatchObject({ total: 4, unplaced: true, lastLocationId: sued.id });
    expect(counts.groups).toHaveLength(2);
    expect(counts.groups).toEqual(
      expect.arrayContaining([
        { locationId: nord.id, count: 1 },
        { locationId: sued.id, count: 2 },
      ]),
    );
  });

  it("US-BES-06 summary: a plant without a catch date counts as the oldest; without any unplaced plant `unplaced` is false", async () => {
    const a = await fresh();
    const undated = await location(a, "Ohne Datum");
    const dated = await location(a, "Mit Datum");
    await plant(a, "Undatiert", { locationId: undated.id, caughtAt: null });
    await plant(a, "Datiert", { locationId: dated.id, caughtAt: "2026-01-01" });
    expect(await specimenCounts(pool, a)).toMatchObject({
      unplaced: false,
      lastLocationId: dated.id,
    });
  });

  it("US-BES-06 treatment list: every active specimen with its place ID or null, cuttings included, archived ones left out", async () => {
    const a = await fresh();
    const box = await location(a, "Kiste");
    await plant(a, "Mit Ort", { locationId: box.id });
    await plant(a, "Ohne Ort");
    await plant(a, "Steckling", { status: "cutting" });
    const gone = await plant(a, "Weg");
    await specimens.archive(a, gone.id, "verkauft", "2026-10-04");
    expect(await treatableSpecimens(pool, a)).toEqual([
      { id: expect.any(String), name: "Mit Ort", locationId: box.id },
      { id: expect.any(String), name: "Ohne Ort", locationId: null },
      { id: expect.any(String), name: "Steckling", locationId: null },
    ]);
  });

  it("US-BES-06 any active of the given specimens: archived, foreign and unknown IDs do not count (P-04)", async () => {
    const a = await fresh();
    const b = await fresh();
    const active = await plant(a, "Aktiv");
    const gone = await plant(a, "Weg");
    await specimens.archive(a, gone.id, "verkauft", "2026-10-04");
    const foreign = await plant(b, "Fremd");
    expect(await specimenAnyActive(pool, a, [gone.id])).toBe(false);
    expect(await specimenAnyActive(pool, a, [foreign.id])).toBe(false);
    expect(await specimenAnyActive(pool, a, [randomUUID()])).toBe(false);
    expect(await specimenAnyActive(pool, a, [gone.id, active.id])).toBe(true);
    expect(await specimenAnyActive(pool, a, [])).toBe(false);
  });

  it("US-BES-06 P-04: another account's plants and places are invisible to the page, the total, the summary and the treatment list", async () => {
    const mine = await fresh();
    const theirs = await fresh();
    const theirPlace = await location(theirs, "Fremd");
    await plant(theirs, "Fremde Pflanze", { locationId: theirPlace.id });
    await plant(mine, "Meine Pflanze");
    expect(await page(mine)).toMatchObject({ total: 1 });
    expect((await page(mine)).rows.map((r) => r.name)).toEqual(["Meine Pflanze"]);
    expect(await specimenCounts(pool, mine)).toMatchObject({ total: 1, groups: [] });
    expect(await treatableSpecimens(pool, mine)).toEqual([
      expect.objectContaining({ name: "Meine Pflanze" }),
    ]);
    expect(await page(mine, { location: theirPlace.id })).toMatchObject({ total: 0, rows: [] });
  });
});
