import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-WUN-01: candidates sorted by the space need of the target light zone through the API (real PostgreSQL).
let pool: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `wun1-${randomUUID()}`;
const subB = `wun1-${randomUUID()}`;
const subC = `wun1-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  key: string | null = randomUUID(),
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (key && method !== "GET") headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Candidate = {
  name: string;
  title: string;
  stock: number | null;
  zoneText: string;
  zone: { id: string; name: string } | null;
  priority: { kind: string; text: string };
  image: { url: string; source: string } | null;
};
const candidates = (sub: string | null) => call(sub, "GET", "/wishes/candidates");
const names = async (sub: string) =>
  ((await candidates(sub)).body["candidates"] as Candidate[]).map((c) => c.name);
const wish = (sub: string | null, input: Record<string, unknown>, key?: string | null) =>
  call(sub, "POST", "/wishes", input, key);

const newSpecies = async (sub: string, name: string) =>
  (
    await call(sub, "POST", "/species", {
      latinName: name,
      germanName: name,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    })
  ).body["id"] as string;
const defaults = async (sub: string) => {
  const r = await call(sub, "POST", "/light-zones/defaults", {});
  return Object.fromEntries(
    (r.body["zones"] as { id: string; name: string }[]).map((z) => [z.name, z.id]),
  ) as Record<string, string>;
};
const location = async (sub: string, name: string, lightZoneId: string | undefined) =>
  (
    await call(sub, "POST", "/locations", {
      name,
      kind: "indoor",
      lightZoneId: lightZoneId ?? null,
    })
  ).body["id"] as string;
const specimen = async (sub: string, marker: string, speciesId: string, locationId: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      marker,
      locationId,
    })
  ).body["id"] as string;

let zoneA: Record<string, string> = {};
const specimenIds: string[] = [];

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  zoneA = await defaults(subA);
  const species = await newSpecies(subA, `Aloe${run} vera`);
  const window = await location(subA, `Fenster ${run}`, zoneA["Lampe 2"]);
  const shelf = await location(subA, `Regal ${run}`, zoneA["Lampe 3"]);
  // Lampe 2: 2 specimens, Lampe 3: 1, Lampe 4: 0.
  for (const [marker, place] of [
    ["a1", window],
    ["a2", window],
    ["a3", shelf],
  ] as const)
    specimenIds.push(await specimen(subA, marker, species, place));
  await defaults(subB);
});
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subC]];
  await pool.query(`delete from wish where account_id in (${accounts})`, subs);
  await pool.query(`delete from specimen where account_id in (${accounts})`, subs);
  await pool.query(
    `delete from species where id in (select object_id from review_case where account_id in (${accounts}))`,
    subs,
  );
  await pool.query("delete from account where subject = any($1)", subs);
  await pool.end();
});

describe("US-WUN-01 sign-in and input", () => {
  it("GET /wishes/candidates and POST /wishes without a token: 401", async () => {
    expect((await candidates(null)).status).toBe(401);
    expect((await wish(null, { name: "x" })).status).toBe(401);
  });

  it("POST /wishes without Idempotency-Key: 400 with a stable code, nothing written", async () => {
    const r = await wish(subA, { name: `Ohne Schlüssel ${run}` }, null);
    expect(r).toMatchObject({ status: 400, body: { error: { code: "idempotency.key_missing" } } });
    expect(await names(subA)).not.toContain(`Ohne Schlüssel ${run}`);
  });

  it("invalid input: 400 input.invalid naming the field", async () => {
    const r = await wish(subA, { name: `Falsch ${run}`, difficulty: 4 });
    expect(r).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid", details: [{ field: "difficulty" }] } },
    });
  });
});

describe("US-WUN-01 candidates sorted by the stock of the target zone", () => {
  it("lists the open candidates ascending by the specimen count of the target zone, unknown zone last", async () => {
    for (const [name, zone] of [
      [`Aloe ${run}`, "Lampe 2"],
      [`Bryo ${run}`, "Lampe 3"],
      [`Cereus ${run}`, "Lampe 4"],
      [`Dudleya ${run}`, undefined],
    ] as const) {
      const r = await wish(subA, {
        name,
        german: `${name} deutsch`,
        difficulty: 2,
        reasoning: "Passt in die Lücke.",
        ...(zone ? { targetZoneId: zoneA[zone] } : {}),
      });
      expect(r.status).toBe(201);
    }
    const r = await candidates(subA);
    expect(r.status).toBe(200);
    const list = r.body["candidates"] as Candidate[];
    expect(list.map((c) => [c.name, c.stock])).toEqual([
      [`Cereus ${run}`, 0],
      [`Bryo ${run}`, 1],
      [`Aloe ${run}`, 2],
      [`Dudleya ${run}`, null],
    ]);
    expect(list[0]).toMatchObject({
      title: `Cereus ${run} deutsch (Cereus ${run})`,
      zoneText: "Lampe 4 — 0 Pflanzen",
      priority: { kind: "thinnest" },
    });
    expect(list[3]).toMatchObject({ zone: null, priority: { kind: "zone_unknown" } });
    expect(r.body["hint"].nextAction).toEqual(expect.any(String));
    expect(
      (r.body["zones"] as { name: string; count: number }[]).map((z) => [z.name, z.count]),
    ).toEqual([
      ["Lampe 2", 2],
      ["Lampe 3", 1],
      ["Lampe 4", 0],
    ]);
  });

  it("an archived specimen no longer counts in the stock (isActive)", async () => {
    const before = (await candidates(subA)).body["zones"] as { name: string; count: number }[];
    expect(before.find((z) => z.name === "Lampe 3")?.count).toBe(1);
    const archived = await call(subA, "POST", `/specimens/${specimenIds[2]}/archive`, {
      timeZone: "Europe/Berlin",
      reason: "eingegangen",
    });
    expect(archived.status).toBe(200);
    const after = (await candidates(subA)).body["candidates"] as Candidate[];
    expect(after.find((c) => c.name === `Bryo ${run}`)?.stock).toBe(0);
  });

  it("without open candidates: 'Keine offenen Kandidaten in der Wunschliste.' and a next action", async () => {
    const r = await candidates(subC);
    expect(r.status).toBe(200);
    expect(r.body["candidates"]).toEqual([]);
    expect(r.body["hint"]).toMatchObject({ text: "Keine offenen Kandidaten in der Wunschliste." });
    expect(r.body["hint"].nextAction).not.toBe("");
  });

  it("a wish that is no longer open leaves the list (FR-WUN-02)", async () => {
    await wish(subA, { name: `Gekauft ${run}`, targetZoneId: zoneA["Lampe 4"] });
    await pool.query("update wish set status = 'bought' where name = $1", [`Gekauft ${run}`]);
    expect(await names(subA)).not.toContain(`Gekauft ${run}`);
  });

  it("a picture is shown with its source", async () => {
    await wish(subA, {
      name: `Bild ${run}`,
      targetZoneId: zoneA["Lampe 4"],
      imageUrl: "https://example.test/bild.jpg",
      imageSource: "Wikimedia Commons",
    });
    const list = (await candidates(subA)).body["candidates"] as Candidate[];
    expect(list.find((c) => c.name === `Bild ${run}`)?.image).toEqual({
      url: "https://example.test/bild.jpg",
      source: "Wikimedia Commons",
    });
  });
});

describe("US-WUN-01 writing a wish (P-03)", () => {
  it("the same Idempotency-Key writes once and answers the same", async () => {
    const key = randomUUID();
    const first = await wish(subA, { name: `Einmal ${run}` }, key);
    const again = await wish(subA, { name: `Einmal ${run}` }, key);
    expect(first.status).toBe(201);
    expect(again.body).toEqual(first.body);
    expect((await names(subA)).filter((n) => n === `Einmal ${run}`)).toHaveLength(1);
  });

  it("a duplicate name is refused: 409 wish.name_taken, also in another letter case (FR-WUN-06)", async () => {
    const r = await wish(subA, { name: `ALOE ${run}` });
    expect(r).toMatchObject({ status: 409, body: { error: { code: "wish.name_taken" } } });
  });
});

describe("US-WUN-01 names are unique after folding diacritics (FR-WUN-06)", () => {
  it("US-WUN-01 a name that differs only in diacritics or composition is refused with 409 wish.name_taken", async () => {
    const first = await wish(subA, { name: `Café ${run}` });
    expect(first.status).toBe(201);
    for (const name of [`Cafe ${run}`, `CAFÉ ${run}`, `Cafe\u0301 ${run}`]) {
      const r = await wish(subA, { name });
      expect(r).toMatchObject({ status: 409, body: { error: { code: "wish.name_taken" } } });
    }
  });
});

describe("US-WUN-01 tenant isolation and privacy (P-04, P-05)", () => {
  it("another account sees none of my wishes and its stock does not rank mine", async () => {
    expect(await names(subB)).toEqual([]);
    const own = (await candidates(subB)).body["zones"] as { count: number }[];
    expect(own.map((z) => z.count)).toEqual([0, 0, 0]);
  });

  it("the same name in another account is no duplicate; each account sees its own wish only", async () => {
    const r = await wish(subB, { name: `Aloe ${run}` });
    expect(r.status).toBe(201);
    expect(await names(subB)).toEqual([`Aloe ${run}`]);
    expect(await names(subA)).toContain(`Aloe ${run}`);
    expect(await names(subA)).not.toContain("Bens");
  });

  it("a target zone of another account looks unknown: 404 light_zone.not_found, nothing written", async () => {
    const r = await wish(subB, { name: `Fremdzone ${run}`, targetZoneId: zoneA["Lampe 2"] });
    expect(r).toMatchObject({ status: 404, body: { error: { code: "light_zone.not_found" } } });
    expect(await names(subB)).not.toContain(`Fremdzone ${run}`);
  });
});

describe("US-WUN-01 a zone a wish points to cannot be deleted unnoticed (P-10)", () => {
  it("DELETE /light-zones/:id answers 409 light_zone.in_use and names the wish", async () => {
    const r = await call(subA, "DELETE", `/light-zones/${zoneA["Lampe 4"]}`);
    expect(r).toMatchObject({ status: 409, body: { error: { code: "light_zone.in_use" } } });
    expect(JSON.stringify(r.body)).toContain(`Cereus ${run}`);
    expect((await call(subA, "GET", "/light-zones")).body["zones"]).toHaveLength(4);
  });
});

describe("US-WUN-03 record a purchase through the API", () => {
  const buy = (sub: string | null, id: string, key?: string | null) =>
    call(sub, "POST", `/wishes/${id}/buy`, undefined, key);
  const bought = (sub: string | null) => call(sub, "GET", "/wishes/bought");
  const created = async (sub: string, name: string) => {
    const r = await wish(sub, { name, german: `${name} deutsch` });
    expect(r.status).toBe(201);
    return r.body["wish"].id as string;
  };

  it("US-WUN-03 without a token: 401; without Idempotency-Key: 400, nothing bought", async () => {
    const id = await created(subA, `Schlüssellos ${run}`);
    expect((await buy(null, id)).status).toBe(401);
    expect((await bought(null)).status).toBe(401);
    expect(await buy(subA, id, null)).toMatchObject({
      status: 400,
      body: { error: { code: "idempotency.key_missing" } },
    });
    expect(await names(subA)).toContain(`Schlüssellos ${run}`);
  });

  it("US-WUN-03 'Bought' answers with the bought wish and what comes next, hides it and keeps it in the history", async () => {
    const id = await created(subA, `Kauf ${run}`);
    const r = await buy(subA, id);
    expect(r).toMatchObject({
      status: 200,
      body: { changed: true, wish: { id, status: "bought" } },
    });
    expect(r.body["hint"].text).toContain(`Kauf ${run} deutsch (Kauf ${run})`);
    expect(r.body["hint"].nextAction).toContain("Exemplar");
    expect(await names(subA)).not.toContain(`Kauf ${run}`);
    const history = await bought(subA);
    expect(history.status).toBe(200);
    expect(history.body["bought"]).toContainEqual({
      id,
      name: `Kauf ${run}`,
      title: `Kauf ${run} deutsch (Kauf ${run})`,
    });
  });

  it("US-WUN-03 buying again: 200 with changed false (idempotent); the same key replays the first answer", async () => {
    const id = await created(subA, `Nochmal ${run}`);
    const key = randomUUID();
    const first = await buy(subA, id, key);
    expect(await buy(subA, id, key)).toEqual(first);
    expect(await buy(subA, id)).toMatchObject({ status: 200, body: { changed: false } });
  });

  it("US-WUN-03 a discarded wish: 409 wish.not_open; an unknown or malformed id: 404 / 400", async () => {
    const id = await created(subA, `Verworfen ${run}`);
    await pool.query("update wish set status = 'discarded' where id = $1", [id]);
    expect(await buy(subA, id)).toMatchObject({
      status: 409,
      body: { error: { code: "wish.not_open" } },
    });
    expect(await buy(subA, randomUUID())).toMatchObject({
      status: 404,
      body: { error: { code: "wish.not_found" } },
    });
    expect((await buy(subA, "kein-id")).status).toBe(400);
  });

  it("US-WUN-03 a wish of another account: 404 wish.not_found, it stays open and out of my history (P-04)", async () => {
    const id = await created(subB, `Bens Kauf ${run}`);
    expect(await buy(subA, id)).toMatchObject({
      status: 404,
      body: { error: { code: "wish.not_found" } },
    });
    expect(await names(subB)).toContain(`Bens Kauf ${run}`);
    await buy(subB, id);
    const mine = (await bought(subA)).body["bought"] as { id: string }[];
    expect(mine.map((w) => w.id)).not.toContain(id);
    expect(((await bought(subB)).body["bought"] as { id: string }[]).map((w) => w.id)).toContain(
      id,
    );
  });
});
