import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  IdempotencyPostgres,
  migrate,
  withAccount,
  openOwnerPool,
  openFixturePool,
} from "../kernel/index.ts";
import { LocationPostgres, ZonePostgres } from "./index.ts";

// US-LIC-05, FR-LIC-01, P-04: light zones and locations per account (real PostgreSQL, `make db-up`).
let pool: Pool;
// Deliberate cross-tenant cleanup/observation of FORCE-d tables: needs the superuser, the suite owner is under row security (#294).
let admin: Pool;
let zones: ZonePostgres;
let locations: LocationPostgres;
const anna = randomUUID();
const ben = randomUUID();
const values = { name: "Lampe 2", luxCeiling: 15000, ppfd: 300, sortOrder: 2 };

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  zones = new ZonePostgres(pool);
  locations = new LocationPostgres(pool);
  for (const id of [anna, ben])
    await withAccount(pool, id, (c) => c.query("insert into account (id) values ($1)", [id]));
});
afterAll(async () => {
  await admin.query("delete from account where id = any($1)", [[anna, ben]]);
  await admin.end();
  await pool.end();
});

const created = async (user: string, name: string) => {
  const z = await zones.create(user, { ...values, name, sortOrder: null });
  if (typeof z === "string") throw new Error(z);
  return z;
};

describe("US-LIC-05 light zones in the database", () => {
  it("creates zones, sorted by order, and appends at the end without a value", async () => {
    await zones.create(anna, { ...values, name: "Z-eins", sortOrder: 7 });
    const z = await zones.create(anna, {
      ...values,
      name: "Z-zwei",
      ppfd: null,
      sortOrder: null,
    });
    expect(z).toMatchObject({ sortOrder: 8, ppfd: null });
    const names = (await zones.list(anna)).map((x) => x.name);
    expect(names.indexOf("Z-eins")).toBeLessThan(names.indexOf("Z-zwei"));
  });

  it("the name is unique per account (case-insensitive), not across accounts", async () => {
    await created(anna, "Eindeutig");
    expect(await zones.create(anna, { ...values, name: "EINDEUTIG" })).toBe("name_taken");
    expect(await zones.create(ben, { ...values, name: "Eindeutig" })).toMatchObject({
      name: "Eindeutig",
    });
  });

  it("changes only zones of the own account", async () => {
    const z = await created(anna, "Aendern");
    expect(await zones.update(ben, z.id, { ...values, name: "Fremd" })).toBe("not_found");
    const fresh = await zones.update(anna, z.id, {
      ...values,
      name: "Umbenannt",
      luxCeiling: 999,
      sortOrder: null,
    });
    expect(fresh).toMatchObject({
      id: z.id,
      name: "Umbenannt",
      luxCeiling: 999,
      sortOrder: z.sortOrder,
    });
  });

  it("rejects values outside the limits already in the database", async () => {
    await expect(
      zones.create(anna, { ...values, name: "Zu hell", luxCeiling: 0 }),
    ).rejects.toThrow();
  });
});

describe("US-LIC-05 locations in the database", () => {
  it("creates locations with and without a zone; any number per zone", async () => {
    const z = await created(anna, "Mehrere");
    for (const name of ["S1", "S2", "S3"])
      expect(
        await locations.create(anna, { name, lightZoneId: z.id, kind: "indoor" }),
      ).toMatchObject({ lightZoneId: z.id });
    expect(
      await locations.create(anna, { name: "Ohne", lightZoneId: null, kind: "outdoor" }),
    ).toMatchObject({ lightZoneId: null });
  });

  it("the name is unique per account", async () => {
    await locations.create(anna, { name: "Fensterbank", lightZoneId: null, kind: "indoor" });
    expect(
      await locations.create(anna, { name: "fensterbank", lightZoneId: null, kind: "indoor" }),
    ).toBe("name_taken");
    expect(
      await locations.create(ben, { name: "Fensterbank", lightZoneId: null, kind: "indoor" }),
    ).toMatchObject({ name: "Fensterbank" });
  });

  it("the zone of another account cannot be assigned (composite foreign key)", async () => {
    const foreign = await created(ben, "Bens Zone");
    expect(
      await locations.create(anna, { name: "Klau", lightZoneId: foreign.id, kind: "indoor" }),
    ).toBe("zone_unknown");
    const own = await locations.create(anna, { name: "Eigen", lightZoneId: null, kind: "indoor" });
    if (typeof own === "string") throw new Error(own);
    expect(
      await locations.update(anna, own.id, {
        name: "Eigen",
        lightZoneId: foreign.id,
        kind: "indoor",
      }),
    ).toBe("zone_unknown");
  });

  it("renaming the zone does not change the assignment (id)", async () => {
    const z = await created(anna, "Vorher");
    const s = await locations.create(anna, {
      name: "Zugeordnet",
      lightZoneId: z.id,
      kind: "indoor",
    });
    await zones.update(anna, z.id, { ...values, name: "Nachher" });
    const list = await locations.list(anna);
    expect(list.find((x) => typeof s !== "string" && x.id === s.id)?.lightZoneId).toBe(z.id);
  });

  it("names the locations of a zone as users; foreign accounts see nothing", async () => {
    const z = await created(anna, "Genutzt");
    await locations.create(anna, { name: "Nutzer-Standort", lightZoneId: z.id, kind: "indoor" });
    expect(await locations.user(anna, z.id)).toEqual([
      { kind: "location", id: expect.any(String), name: "Nutzer-Standort" },
    ]);
    expect(await locations.user(ben, z.id)).toEqual([]);
  });

  it("a zone with locations cannot be deleted (foreign key as fallback), a free one can", async () => {
    const z = await created(anna, "Belegt");
    await locations.create(anna, { name: "Belegt-Standort", lightZoneId: z.id, kind: "indoor" });
    expect(await zones.remove(anna, z.id)).toBe("in_use");
    const free = await created(anna, "Frei");
    expect(await zones.remove(ben, free.id)).toBe("not_found");
    expect(await zones.remove(anna, free.id)).toBe("deleted");
  });
});

describe("repeat guard in the database", () => {
  const s = (userId: string, key = "k1") => ({ userId, operation: "t.t", key });

  it("two concurrent calls with the same key: exactly one is new", async () => {
    const idem = new IdempotencyPostgres(pool);
    const key = randomUUID();
    const r = await Promise.all([1, 2, 3].map(() => idem.begin(s(anna, key), "{}")));
    expect(r.filter((x) => x.kind === "fresh")).toHaveLength(1);
  });

  it("after completion returns the stored result, with different input a conflict", async () => {
    const idem = new IdempotencyPostgres(pool);
    const key = randomUUID();
    await idem.begin(s(anna, key), "a");
    await idem.complete(s(anna, key), { id: 1 });
    expect(await idem.begin(s(anna, key), "a")).toEqual({
      kind: "repeat",
      result: { id: 1 },
    });
    expect(await idem.begin(s(anna, key), "b")).toEqual({ kind: "conflict" });
  });

  it("discarded keys are free again; the same key of two accounts is separate", async () => {
    const idem = new IdempotencyPostgres(pool);
    const key = randomUUID();
    await idem.begin(s(anna, key), "a");
    expect((await idem.begin(s(ben, key), "a")).kind).toBe("fresh");
    await idem.discard(s(anna, key));
    expect((await idem.begin(s(anna, key), "a")).kind).toBe("fresh");
  });
});
