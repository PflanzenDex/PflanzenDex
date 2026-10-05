import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-POK-06: ownership derived from the specimens through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `pok6-${randomUUID()}`;
const subB = `pok6-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
let app: ReturnType<typeof createApp>;

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const ownership = (sub: string | null, timeZone = "Europe/Berlin") =>
  call(sub, "GET", `/pokedex/ownership?timeZone=${encodeURIComponent(timeZone)}`);
const caught = (r: Response) =>
  (r.body["ownership"].caught as { species: string }[]).map((c) => c.species);

const newSpecies = async (sub: string, latinName: string, extra: Record<string, unknown> = {}) =>
  (
    await call(sub, "POST", "/species", {
      latinName,
      germanName: latinName,
      ...extra,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const specimen = async (sub: string, marker: string, speciesId: string) =>
  (await call(sub, "POST", "/specimens", { timeZone: "Europe/Berlin", speciesId, marker })).body[
    "id"
  ] as string;

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await pool.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await pool.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [[subA, subB]],
  );
  await pool.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
});

describe("US-POK-06 ownership: sign-in", () => {
  it("US-POK-07 without a valid time zone: 400 input.invalid", async () => {
    for (const path of ["/pokedex/ownership", "/pokedex/ownership?timeZone=Mars%2FBase"]) {
      const r = await call(subA, "GET", path);
      expect(r.status).toBe(400);
      expect(r.body["error"].code).toBe("input.invalid");
    }
  });

  it("GET /pokedex/ownership without token: 401", async () => {
    expect((await ownership(null)).status).toBe(401);
  });

  it("US-POK-06 a new account has caught nothing and has nothing to identify", async () => {
    const r = await ownership(subA);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ownership: { caught: [], unidentified: [] } });
  });
});

describe("US-POK-06 ownership: derived from the specimens", () => {
  it("catches the species of an active specimen, with the cultivar as chip, and not of an archived one", async () => {
    const plain = await newSpecies(subA, `Opuntia${run} microdasys`, {
      source: "https://example.test/opuntia",
    });
    const variety = await newSpecies(subA, `Opuntia${run} microdasys 'Albispina'`);
    const gone = await newSpecies(subA, `Aloe${run} vera`);
    await specimen(subA, `Kaktus ${run}`, plain);
    await specimen(subA, `Variante ${run}`, variety);
    const away = await specimen(subA, `Weg ${run}`, gone);
    const archived = await call(subA, "POST", `/specimens/${away}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "abgegeben",
    });
    expect(archived.status).toBe(200);
    const r = await ownership(subA);
    expect(r.status).toBe(200);
    const o = r.body["ownership"];
    expect(o.caught).toEqual([
      {
        species: `Opuntia${run} microdasys`,
        speciesId: plain,
        source: "https://example.test/opuntia",
        genus: `Opuntia${run}`,
        chips: ["'Albispina'"],
        specimenCount: 2,
        caughtDate: { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), source: "caught_at" },
        germanName: `Opuntia${run} microdasys`,
        familyLatin: null,
        familyGerman: null,
        genusSpeciesCount: null,
      },
    ]);
    expect(o.unidentified).toEqual([]);
  });

  it("a specimen without epithet is not caught and names what to do", async () => {
    const genusOnly = await newSpecies(subA, `Hippeastrum${run}`);
    await specimen(subA, `Amaryllis ${run}`, genusOnly);
    const o = (await ownership(subA)).body["ownership"];
    expect(o.unidentified).toEqual([
      expect.objectContaining({
        latinName: `Hippeastrum${run}`,
        nextAction: "Bestimme die Art, dann zählt es.",
      }),
    ]);
    expect(o.unidentified[0].text).toContain(`Amaryllis ${run}`);
    expect(o.caught.map((c: { species: string }) => c.species)).not.toContain(`Hippeastrum${run}`);
  });

  it("a second account sees none of this and its own appears separately (P-04)", async () => {
    expect((await ownership(subB)).body["ownership"]).toEqual({ caught: [], unidentified: [] });
    const lemon = await newSpecies(subB, `Citrus${run} limon`);
    await specimen(subB, `Zitrone ${run}`, lemon);
    const b = await ownership(subB);
    expect(caught(b)).toEqual([`Citrus${run} limon`]);
    expect(JSON.stringify((await ownership(subA)).body)).not.toContain(`Citrus${run}`);
    expect(JSON.stringify(b.body)).not.toContain(`Opuntia${run}`);
  });

  it("the route only reads: nothing is written", async () => {
    const count = () =>
      pool.query(
        "select count(*)::int as n from specimen where account_id in (select id from account where subject = $1)",
        [subA],
      );
    const before = await count();
    await ownership(subA);
    expect((await count()).rows[0].n).toBe(before.rows[0].n);
  });
});

describe("US-POK-07 catch date through the API", () => {
  const datesOf = async (sub: string, species: string, timeZone?: string) =>
    (
      (await ownership(sub, timeZone)).body["ownership"].caught as {
        species: string;
        caughtDate: unknown;
      }[]
    ).find((c) => c.species === species)?.caughtDate;

  it("US-POK-07 earliest across active and archived specimens; creation date is approximate and local", async () => {
    const lemon = await newSpecies(subA, `Limonia${run} acidissima`);
    const kept = await specimen(subA, `Limonia neu ${run}`, lemon);
    const old = await specimen(subA, `Limonia alt ${run}`, lemon);
    const created = await specimen(subA, `Limonia ohne ${run}`, lemon);
    await pool.query("update specimen set caught_at = '2026-06-01' where id = $1", [kept]);
    await pool.query(
      "update specimen set caught_at = '2025-02-03', status = 'archived', archived_at = '2026-01-01', archived_reason = 'abgegeben' where id = $1",
      [old],
    );
    await pool.query("update specimen set caught_at = null where id = $1", [created]);
    expect(await datesOf(subA, `Limonia${run} acidissima`)).toEqual({
      date: "2025-02-03",
      source: "caught_at",
    });
    await pool.query(
      "update specimen set caught_at = null, status = 'plant', archived_at = null, archived_reason = null where id = $1",
      [old],
    );
    await pool.query("update specimen set created_at = '2024-12-31T23:30:00Z' where id = $1", [
      old,
    ]);
    expect(await datesOf(subA, `Limonia${run} acidissima`, "Europe/Berlin")).toEqual({
      date: "2025-01-01",
      source: "created_at",
    });
    expect((await datesOf(subA, `Limonia${run} acidissima`, "UTC")) as { date: string }).toEqual({
      date: "2024-12-31",
      source: "created_at",
    });
  });

  it("US-POK-07 another account sees none of it and its date is its own (P-04)", async () => {
    const other = await newSpecies(subB, `Limonia${run} acidissima`);
    await specimen(subB, `Limonia B ${run}`, other);
    const own = (await datesOf(subB, `Limonia${run} acidissima`)) as {
      date: string;
      source: string;
    };
    expect(own.source).toBe("caught_at");
    expect(own.date).not.toBe("2025-02-03");
  });
});

describe("US-POK-08 the data the page searches and groups by", () => {
  it("US-POK-08 each caught species carries German name and family; the genus species count stays unknown (P-08)", async () => {
    const fam = await newSpecies(subA, `Ficus${run} lyrata`, {
      germanName: "Geigenfeige",
      familyLatin: "Moraceae",
      familyGerman: "Maulbeergewächse",
    });
    await specimen(subA, `Geige ${run}`, fam);
    const r = await ownership(subA);
    const card = (r.body["ownership"].caught as Record<string, unknown>[]).find(
      (c) => c["species"] === `Ficus${run} lyrata`,
    );
    expect(card).toMatchObject({
      germanName: "Geigenfeige",
      familyLatin: "Moraceae",
      familyGerman: "Maulbeergewächse",
      genusSpeciesCount: null,
    });
  });

  it("US-POK-08 another account that owns a species of its own never sees the private family and German name of A's proposal (P-04)", async () => {
    const mine = await newSpecies(subB, `Ficus${run} lyrata`, { germanName: "Eigene Feige" });
    await specimen(subB, `Feige B ${run}`, mine);
    const b = await ownership(subB);
    const card = (b.body["ownership"].caught as Record<string, unknown>[]).find(
      (c) => c["species"] === `Ficus${run} lyrata`,
    );
    expect(card).toMatchObject({
      speciesId: mine,
      germanName: "Eigene Feige",
      familyLatin: null,
      familyGerman: null,
    });
    const text = JSON.stringify(b.body);
    expect(text).not.toContain("Moraceae");
    expect(text).not.toContain("Geigenfeige");
    expect(text).not.toContain("Maulbeergewächse");
  });
});

describe("US-POK-09 species ID and source stay with the account that may read the species", () => {
  it("US-POK-09 two accounts: the private proposal of A, its ID and its source never reach B (P-04)", async () => {
    const source = `https://example.test/private-${run}`;
    const id = await newSpecies(subA, `Privata${run} secreta`, { source });
    await specimen(subA, `Geheim ${run}`, id);
    const a = JSON.stringify((await ownership(subA)).body);
    expect(a).toContain(id);
    expect(a).toContain(source);
    const b = JSON.stringify((await ownership(subB)).body);
    expect(b).not.toContain(id);
    expect(b).not.toContain(source);
    expect(b).not.toContain(`Privata${run}`);
  });
});
