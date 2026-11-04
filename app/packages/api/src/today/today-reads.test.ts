import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";
import { countingPool, type CountingPool } from "../count-queries";
import { repeatFindings } from "../query-count-statements";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// NFR-12 (issue #1240): the phase path reads the care profiles once, not once per phased plant, and the reads of one
// GET request are answered once, per account (P-04). Real PostgreSQL (`make db-up`), every statement counted.
let pool: Pool;
let admin: Pool; // superuser fixture pool: setup and cleanup (QG-D1)
let counter: CountingPool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `reads-a-${randomUUID()}`;
const subB = `reads-b-${randomUUID()}`;
const TZ = "Europe/Berlin";
// 2026-11-04 in the middle of the day: the dormancy period 11-01 to 02-28 is the phase of every plant below.
const NOW = new Date("2026-11-04T10:00:00Z");
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(sub: string, method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "idempotency-key": randomUUID(),
    authorization: `Bearer valid:${sub}`,
  };
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Keeper = { sub: string; species: string; growth: string; dormant: string; plants: string[] };
const keepers: Record<string, Keeper> = {};

/** One keeper: a zone, a growth and a dormancy location, a species with a dormancy period and its care profile. */
async function setUp(sub: string, tag: string): Promise<Keeper> {
  await call(sub, "POST", "/light-zones/defaults", {});
  const zones = (await call(sub, "GET", "/light-zones")).body["zones"] as {
    id: string;
    name: string;
  }[];
  const zone = zones[1]?.id as string; // zone 2 and up: adult plants (not the cutting light)
  const growth = (
    await call(sub, "POST", "/locations", {
      name: `Wachstum ${run}${tag}`,
      kind: "indoor",
      lightZoneId: zone,
    })
  ).body["id"] as string;
  const dormant = (
    await call(sub, "POST", "/locations", {
      name: `Ruhe ${run}${tag}`,
      kind: "indoor",
      lightZoneId: zone,
    })
  ).body["id"] as string;
  const species = (
    await call(sub, "POST", "/species", {
      latinName: `Phasereads${run}${tag} test`,
      germanName: `Phasenart ${run} ${tag}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      dormancyFrom: "11-01",
      dormancyUntil: "02-28",
    })
  ).body["id"] as string;
  await call(sub, "PUT", `/care-profiles/${species}`, {
    growthLocationId: growth,
    dormancyLocationId: dormant,
  });
  return { sub, species, growth, dormant, plants: [] };
}

/** One more plant of the keeper, standing on the growth location: in the dormancy phase it is a deviation. */
async function addPlant(keeper: Keeper): Promise<void> {
  const n = keeper.plants.length + 1;
  const created = await call(keeper.sub, "POST", "/specimens", {
    speciesId: keeper.species,
    marker: `Topf ${run} ${n}`,
    locationId: keeper.growth,
    timeZone: TZ,
    catchDate: "2026-07-01",
  });
  if (created.status < 200 || created.status >= 300)
    throw new Error(`specimen not created: ${JSON.stringify(created.body)}`);
  keeper.plants.push(created.body["id"] as string);
}

/** The statements of one GET request after one warm-up request, and the texts that repeat in it. */
async function statementsOf(sub: string, path: string) {
  await call(sub, "GET", path);
  counter.reset();
  const r = await call(sub, "GET", path);
  return {
    status: r.status,
    body: r.body,
    count: counter.count(),
    repeats: repeatFindings(counter.statements()),
  };
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  counter = countingPool(pool);
  app = createApp({ reviewer, pool: counter.pool, clock: () => NOW });
  keepers.a = await setUp(subA, "a");
  keepers.b = await setUp(subB, "b");
});

afterAll(async () => {
  const subs = [subA, subB];
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [subs],
  );
  // Care profiles hold their species with `on delete restrict`: they go before the species.
  await admin.query(
    "delete from care_profile where account_id in (select id from account where subject = any($1))",
    [subs],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [subs],
  );
  await admin.query("delete from account where subject = any($1)", [subs]);
  await pool.end();
  await admin.end();
});

describe("NFR-12 the phase path does not read the profiles once per phased plant", () => {
  it("NFR-12 GET /care-phases sends the same statements for six phased plants as for two, and repeats none", async () => {
    const keeper = keepers.a as Keeper;
    await addPlant(keeper);
    await addPlant(keeper);
    const two = await statementsOf(keeper.sub, `/care-phases?timeZone=${encodeURIComponent(TZ)}`);
    for (let i = 0; i < 4; i++) await addPlant(keeper);
    const six = await statementsOf(keeper.sub, `/care-phases?timeZone=${encodeURIComponent(TZ)}`);
    expect(two.status).toBe(200);
    expect(six.body["phases"]).toHaveLength(6);
    expect(six.body["phases"].every((p: { phase: string }) => p.phase === "dormancy")).toBe(true);
    expect(six.count).toBe(two.count);
    expect(six.repeats).toEqual([]);
  });

  it("NFR-12 GET /today sends no statement text twice for the same keeper", async () => {
    const keeper = keepers.a as Keeper;
    const today = await statementsOf(keeper.sub, `/today?timeZone=${encodeURIComponent(TZ)}`);
    expect(today.status).toBe(200);
    expect(today.body["items"].length).toBeGreaterThan(0);
    expect(today.repeats).toEqual([]);
  });
});

describe("NFR-12 reads of one request do not mix keepers (P-04)", () => {
  it("NFR-12 two keepers asked at the same time get the same answer as one after the other", async () => {
    const path = `/today?timeZone=${encodeURIComponent(TZ)}`;
    const [a, b] = [keepers.a as Keeper, keepers.b as Keeper];
    await addPlant(b);
    const alone = { a: await call(a.sub, "GET", path), b: await call(b.sub, "GET", path) };
    const together = await Promise.all([call(a.sub, "GET", path), call(b.sub, "GET", path)]);
    expect(together[0]?.body).toEqual(alone.a.body);
    expect(together[1]?.body).toEqual(alone.b.body);
    // Each answer names only its own plants (P-04): no specimen of the other keeper appears in it.
    const ids = (r: Response) =>
      (r.body["items"] as { specimenId: string | null }[])
        .map((i) => i.specimenId)
        .filter((id): id is string => id !== null);
    expect(ids(together[0] as Response).every((id) => a.plants.includes(id))).toBe(true);
    expect(ids(together[1] as Response).every((id) => b.plants.includes(id))).toBe(true);
    expect(ids(together[1] as Response).length).toBeGreaterThan(0);
  });
});
