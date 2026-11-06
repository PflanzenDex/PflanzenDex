import { randomUUID } from "node:crypto";
import { NO_FEATURES } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../../app";

// US-KI-11: the catalog and the collection through the MCP tools (real PostgreSQL, `make db-up`).
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let pool: Pool;
let admin: Pool;
let app: ReturnType<typeof createApp>;
const tag = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `ki11-${randomUUID()}`;
const subB = `ki11-${randomUUID()}`;
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const NOW = new Date("2026-11-02T10:00:00Z");
const TZ = "Europe/Berlin";
const web = (sub: string) => `valid:${sub}`;
const ai = (sub: string, scope = "pflanzen:read") => `ai|${sub}|${CLIENT}|${scope}`;
const options = (features?: AppOptions["features"]): AppOptions => ({
  reviewer: async (t) =>
    t.startsWith("valid:")
      ? { sub: t.slice(6), email: "x@example.test", name: "T", email_verified: true }
      : null,
  pool,
  clock: () => NOW,
  ...(features ? { features } : {}),
  ai: {
    verifier: async (t) => {
      const [kind, sub, client, scope] = t.split("|");
      return kind === "ai"
        ? { sub, email: `${sub}@example.test`, name: "T", email_verified: true, azp: client, scope }
        : null;
    },
    resource: "https://pflanzendex.example/mcp",
    issuer: "https://login.example/realms/p",
  },
});

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}
let rpcId = 1;
async function tool(sub: string, name: string, args: Json = {}, scope?: string) {
  const res = await app.request("/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${ai(sub, scope)}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: rpcId++,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const result = ((await res.json()) as Json)["result"] as Json;
  return { error: result["isError"] as boolean, body: result["structuredContent"] as Json };
}
const ids = (items: { id: string }[]) => items.map((i) => i.id).sort();

/** One account's collection: an own species proposal, a zone, a location, two marked specimens, one measurement. */
async function collection(sub: string, who: string) {
  const species = await call(web(sub), "POST", "/species", {
    latinName: `Kiread${tag}${who} vera`,
    germanName: `Leseprobe ${tag} ${who}`,
    synonyms: [`Kisyn${tag}${who} alba`],
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  const zone = await call(web(sub), "POST", "/light-zones", {
    name: `Hell ${who}`,
    luxCeiling: 30000,
  });
  const location = await call(web(sub), "POST", "/locations", {
    name: `Regal ${who}`,
    kind: "indoor",
    lightZoneId: zone.body["id"],
  });
  const specimen = async (marker: string) =>
    (
      await call(web(sub), "POST", "/specimens", {
        speciesId: species.body["id"],
        locationId: location.body["id"],
        marker,
        timeZone: TZ,
      })
    ).body;
  const blue = await specimen("blau");
  const red = await specimen("rot");
  await call(web(sub), "POST", `/specimens/${blue["id"]}/measurements`, {
    timeZone: TZ,
    value: 10,
    date: "2026-11-01",
  });
  return { species: species.body, zone: zone.body, location: location.body, blue, red };
}
let A: Awaited<ReturnType<typeof collection>>;
let B: Awaited<ReturnType<typeof collection>>;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp(options());
  for (const sub of [subA, subB]) await call(web(sub), "GET", "/account");
  A = await collection(subA, "anna");
  B = await collection(subB, "bernd");
});
afterAll(async () => {
  const subs = [[subA, subB]];
  const mine = "(select id from account where subject = any($1))";
  await admin.query(`delete from measurement where account_id in ${mine}`, subs);
  await admin.query(`delete from specimen where account_id in ${mine}`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in ${mine})`,
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await admin.end();
});

describe("US-KI-11 the catalog through the AI client", () => {
  it("US-KI-11 search_species finds by Latin name, German name and synonym, the same species as the app's search", async () => {
    for (const q of [`Kiread${tag}anna`, `Leseprobe ${tag} anna`, `Kisyn${tag}anna`]) {
      const r = await tool(subA, "search_species", { query: q });
      expect(r.error).toBe(false);
      expect(r.body["items"]).toEqual([
        expect.objectContaining({
          id: A.species["id"],
          own: true,
          reviewStatus: "proposal",
          specimens: 2,
        }),
      ]);
      const app = (await call(web(subA), "GET", `/species?q=${encodeURIComponent(q)}`)).body;
      expect(ids(r.body["items"])).toEqual(ids(app["species"]));
    }
  });

  it("US-KI-11 get_species by name; proposing the species again names the existing one with its id", async () => {
    const r = await tool(subA, "get_species", { species: `Kisyn${tag}anna alba` });
    expect(r.body["species"]).toMatchObject({ id: A.species["id"] });
    // The keeper allows drafts (the connection started with the token's "read", US-KI-07).
    const [connection] = (await call(web(subA), "GET", "/ai/connections")).body["connections"];
    await call(web(subA), "PUT", `/ai/connections/${connection.id}/rights`, { rights: "drafts" });
    const again = await tool(
      subA,
      "propose_draft",
      {
        type: "species",
        source: "https://de.wikipedia.org/wiki/Test",
        content: { ...A.species, source: "https://de.wikipedia.org/wiki/Test" },
        idempotencyKey: randomUUID(),
      },
      "pflanzen:draft",
    );
    expect(again.error).toBe(true);
    expect(again.body["error"]).toMatchObject({
      code: "species.duplicate",
      data: { existing: { id: A.species["id"] } },
    });
  });
});

describe("US-KI-11 the collection through the AI client", () => {
  it("US-KI-11 list_specimens returns the cards of the app with ids and names of species, location and zone, paged", async () => {
    const r = await tool(subA, "list_specimens", { timeZone: TZ, limit: 1 });
    expect(r.body).toMatchObject({ total: 2, limit: 1, nextOffset: 1 });
    const all = (await tool(subA, "list_specimens", { timeZone: TZ })).body["items"];
    const cards = (await call(web(subA), "GET", `/specimens/cards?timeZone=${TZ}`)).body["cards"];
    expect(ids(all)).toEqual(ids(cards));
    expect(all.find((s: Json) => s["id"] === A.blue["id"])).toMatchObject({
      name: A.blue["name"],
      species: { id: A.species["id"] },
      location: { id: A.location["id"], name: "Regal anna" },
      lightZone: { id: A.zone["id"], name: "Hell anna" },
    });
  });

  it("US-KI-11 filters and references by name: location, specimen with marker; several hits give candidates", async () => {
    const byPlace = await tool(subA, "list_specimens", { timeZone: TZ, location: "regal anna" });
    expect(byPlace.body["total"]).toBe(2);
    const one = await tool(subA, "get_specimen", {
      timeZone: TZ,
      specimen: `Leseprobe ${tag} anna (blau)`,
    });
    expect(one.body["specimen"]).toMatchObject({ id: A.blue["id"], details: { marker: "blau" } });
    const both = await tool(subA, "get_specimen", {
      timeZone: TZ,
      specimen: `Leseprobe ${tag} anna`,
    });
    expect(both.body["error"]).toMatchObject({ code: "ai.reference_ambiguous" });
    expect(ids(both.body["error"].data.candidates)).toEqual(
      ids([A.blue, A.red] as { id: string }[]),
    );
    const none = await tool(subA, "list_specimens", { timeZone: TZ, location: "Regal anne" });
    expect(none.body["error"]).toMatchObject({
      code: "location.not_found",
      data: { nearest: ["Regal anna"] },
    });
  });

  it("US-KI-11 locations, light zones and measurements match the app's views", async () => {
    const locations = (await tool(subA, "list_locations")).body["items"];
    expect(ids(locations)).toEqual(
      ids((await call(web(subA), "GET", "/locations")).body["locations"]),
    );
    const zones = (await tool(subA, "list_light_zones")).body["items"];
    expect(ids(zones)).toEqual(ids((await call(web(subA), "GET", "/light-zones")).body["zones"]));
    expect(zones.map((z: Json) => z["number"])).toEqual(
      zones.map((_: unknown, i: number) => i + 1),
    );
    const m = await tool(subA, "list_measurements", { specimen: A.blue["name"] });
    const view = (await call(web(subA), "GET", `/specimens/${A.blue["id"]}/measurements`)).body;
    expect(m.body).toMatchObject({
      total: 1,
      growth: view["growth"],
      specimen: { id: A.blue["id"] },
    });
    expect(m.body["items"]).toEqual(view["measurements"]);
  });

  it("US-KI-11 every read is in the keeper's AI log (FR-KI-19)", async () => {
    const log = (await call(web(subA), "GET", "/ai/log")).body["log"] as Json[];
    const ops = new Set(log.map((e) => e["operation"]));
    for (const op of ["search_species", "list_specimens", "get_specimen", "list_measurements"])
      expect(ops).toContain(op);
  });

  it("US-KI-11 while 'ai' is off for the account the read tools answer 404", async () => {
    const before = app;
    app = createApp(options(NO_FEATURES));
    try {
      expect((await call(ai(subA), "GET", "/mcp/locations")).status).toBe(404);
    } finally {
      app = before;
    }
  });
});

describe("US-KI-11 tenant isolation per tool (P-04, FR-KI-23)", () => {
  it("US-KI-11 search_species and get_species: B finds none of A's proposals; A's id is not_found", async () => {
    expect(
      (await tool(subB, "search_species", { query: `Kiread${tag}anna` })).body["items"],
    ).toEqual([]);
    const byId = await tool(subB, "get_species", { species: A.species["id"] });
    expect(byId.body["error"].code).toBe("species.not_found");
    const byName = await tool(subB, "get_species", { species: `Kiread${tag}anna vera` });
    expect(byName.body["error"].code).toBe("species.not_found");
    expect(JSON.stringify(byName.body)).not.toContain("anna");
  });

  it("US-KI-11 list_specimens, get_specimen, list_measurements: none of A's rows; A's ids are not_found", async () => {
    const all = (await tool(subB, "list_specimens", { timeZone: TZ, status: "all" })).body["items"];
    expect(ids(all)).toEqual(ids([B.blue, B.red] as { id: string }[]));
    const one = await tool(subB, "get_specimen", { timeZone: TZ, specimen: A.blue["id"] });
    expect(one.body["error"].code).toBe("specimen.not_found");
    const m = await tool(subB, "list_measurements", { specimen: A.blue["id"] });
    expect(m.body["error"].code).toBe("specimen.not_found");
    const res = await call(ai(subB), "GET", `/mcp/specimens/${A.blue["id"]}`);
    expect(res.status).toBe(400); // without time zone: refused before any lookup
    const res404 = await call(ai(subB), "GET", `/mcp/specimens/${A.blue["id"]}?timeZone=${TZ}`);
    expect(res404.status).toBe(404); // never 403: no existence leak
  });

  it("US-KI-11 list_locations, list_light_zones and name resolution: none of A's names", async () => {
    const text = JSON.stringify([
      await tool(subB, "list_locations"),
      await tool(subB, "list_light_zones"),
      await tool(subB, "list_specimens", { timeZone: TZ, location: "Regal anna" }),
      await tool(subB, "list_specimens", { timeZone: TZ, lightZone: "Hell anna" }),
    ]);
    expect(text).not.toContain("anna");
    expect(text).toContain("Regal bernd");
  });
});

describe("FR-BES-24 the AI search says when its list is cut", () => {
  // Fifty proposals of anna contain "Zz<tag>" and sort before the target "Zz<tag>" in name order (letters only).
  const letters = (i: number) => String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26));
  const proposal = (latinName: string) => ({
    latinName,
    synonyms: [],
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  let targetId = "";
  beforeAll(async () => {
    for (let i = 0; i < 50; i++)
      expect(
        (await call(web(subA), "POST", "/species", proposal(`Ka${letters(i)} Zz${tag}`))).status,
      ).toBe(201);
    const target = await call(web(subA), "POST", "/species", proposal(`Zz${tag}`));
    expect(target.status).toBe(201);
    targetId = target.body["id"];
  });

  it("FR-BES-24 search_species says more when more species match than the list shows, and shows the cap", async () => {
    const r = await tool(subA, "search_species", { query: `Zz${tag}` });
    expect(r.error).toBe(false);
    expect(r.body).toMatchObject({ total: 50, nextOffset: null, more: true });
    expect(r.body["items"]).toHaveLength(50);
    expect(r.body["items"].map((i: Json) => i["id"])).not.toContain(targetId);
  });

  it("FR-BES-24 search_species says more false when the list is complete (P-08: no count is guessed)", async () => {
    const own = await tool(subA, "search_species", { query: `Kiread${tag}anna` });
    expect(own.body).toMatchObject({ total: 1, more: false });
    // Foreign proposals never count toward `more` (P-05): B sees none of A's.
    const foreign = await tool(subB, "search_species", { query: `Zz${tag}` });
    expect(foreign.body).toMatchObject({ items: [], total: 0, more: false });
  });

  it("FR-BES-24 get_species resolves an exact name beyond the cap of the search", async () => {
    const r = await tool(subA, "get_species", { species: `Zz${tag}` });
    expect(r.error).toBe(false);
    expect(r.body["species"]).toMatchObject({ id: targetId, latinName: `Zz${tag}` });
  });
});
