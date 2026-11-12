import { randomUUID } from "node:crypto";
import { NO_FEATURES, SPECIMEN_WRITES } from "@pflanzendex/core";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, type AppOptions } from "../../app";

// US-KI-14: keeping the specimens through the MCP write tools (real PostgreSQL, `make db-up`).
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let pool: Pool;
let admin: Pool;
let app: ReturnType<typeof createApp>;
const tag = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `ki14-${randomUUID()}`;
const subB = `ki14-${randomUUID()}`;
const subD = `ki14-${randomUUID()}`;
const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const NOW = new Date("2026-11-02T10:00:00Z");
const TZ = "Europe/Berlin";
const WRITE = "pflanzen:write";
const DRAFT = "pflanzen:draft";
const web = (sub: string) => `valid:${sub}`;
const ai = (sub: string, scope = WRITE) => `ai|${sub}|${CLIENT}|${scope}`;
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

async function call(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  key = randomUUID(),
) {
  const res = await app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
}
let rpcId = 1;
async function tool(sub: string, name: string, args: Json, scope = WRITE) {
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
      params: { name, arguments: { idempotencyKey: randomUUID(), ...args } },
    }),
  });
  const result = ((await res.json()) as Json)["result"] as Json;
  return { error: result["isError"] as boolean, body: result["structuredContent"] as Json };
}
const specimen = async (sub: string, id: string) =>
  (await call(web(sub), "GET", `/specimens/${id}`)).body;
const count = async (sub: string) =>
  (await call(web(sub), "GET", "/specimens/count")).body["count"];

/** One account: an own species proposal, two zones, two locations and one marked specimen "blau". */
async function collection(sub: string, who: string) {
  const species = await call(web(sub), "POST", "/species", {
    latinName: `Kiwrite${tag}${who} vera`,
    germanName: `Schreibprobe ${tag} ${who}`,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  const zone = (name: string) =>
    call(web(sub), "POST", "/light-zones", { name, luxCeiling: 30000 });
  const bright = (await zone(`Hell ${who}`)).body;
  const shade = (await zone(`Schatten ${who}`)).body;
  const place = (name: string, z: Json) =>
    call(web(sub), "POST", "/locations", { name, kind: "indoor", lightZoneId: z["id"] });
  const shelf = (await place(`Regal ${who}`, bright)).body;
  const sill = (await place(`Fenster ${who}`, shade)).body;
  const blue = (
    await call(web(sub), "POST", "/specimens", {
      speciesId: species.body["id"],
      locationId: shelf["id"],
      marker: "blau",
      timeZone: TZ,
    })
  ).body;
  return { species: species.body, bright, shade, shelf, sill, blue };
}
let A: Awaited<ReturnType<typeof collection>>;
let B: Awaited<ReturnType<typeof collection>>;

/** The keeper allows the right in the app; the token's scope then decides the effective right (US-KI-07). */
async function allow(sub: string, rights: "drafts" | "write") {
  await tool(sub, "get_session", {}, WRITE);
  const [connection] = (await call(web(sub), "GET", "/ai/connections")).body["connections"];
  await call(web(sub), "PUT", `/ai/connections/${connection.id}/rights`, { rights });
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp(options());
  for (const sub of [subA, subB, subD]) await call(web(sub), "GET", "/account");
  A = await collection(subA, "anna");
  B = await collection(subB, "bernd");
  await allow(subA, "write");
  await allow(subB, "write");
  await allow(subD, "drafts");
});
afterAll(async () => {
  const subs = [[subA, subB, subD]];
  const mine = "(select id from account where subject = any($1))";
  await admin.query(`delete from specimen where account_id in ${mine}`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in ${mine})`,
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await admin.end();
});

const speciesName = (who: string) => `Kiwrite${tag}${who} vera`;
const nameOf = (who: string, marker: string) => `Schreibprobe ${tag} ${who} – ${marker}`;

describe("US-KI-14 keep the specimens through the AI client", () => {
  it("US-KI-14 create_specimen by names runs at once and shows the new specimen; private notes never reach it (FR-KI-22)", async () => {
    const before = await count(subA);
    const r = await tool(subA, "create_specimen", {
      species: speciesName("anna"),
      location: `Regal anna`,
      marker: "rot",
      timeZone: TZ,
    });
    expect(r.error).toBe(false);
    expect(r.body).toMatchObject({ mode: "written", operation: "specimen.create", before: null });
    expect(r.body["after"]).toMatchObject({ marker: "rot", location: { name: "Regal anna" } });
    expect(await count(subA)).toBe(before + 1);
    // A direct call with notes: the field is dropped before the operation sees it.
    const direct = await call(ai(subA), "POST", "/mcp/specimens", {
      species: A.species["id"],
      marker: "gruen",
      timeZone: TZ,
      notes: "geheim",
    });
    expect(direct.status).toBe(201);
    expect((await specimen(subA, direct.body["result"]["id"]))["notes"]).toBeNull();
  });

  it("US-KI-14 marker, catch date, location, light zone, repot and restore by name, each with before and after", async () => {
    const blue = nameOf("anna", "blau");
    const marked = await tool(subA, "set_specimen_marker", { specimen: blue, marker: "lila" });
    expect(marked.body).toMatchObject({ before: { marker: "blau" }, after: { marker: "lila" } });
    const lila = nameOf("anna", "lila");
    const date = await tool(subA, "correct_catch_date", {
      specimen: lila,
      catchDate: "2026-10-01",
      timeZone: TZ,
    });
    expect(date.body["after"]).toMatchObject({ caughtAt: "2026-10-01" });
    const moved = await tool(subA, "set_specimen_location", {
      specimen: lila,
      location: "Fenster anna",
    });
    expect(moved.body).toMatchObject({
      before: { location: { name: "Regal anna" } },
      after: { location: { name: "Fenster anna" } },
    });
    const zoned = await tool(subA, "set_specimen_light_zone", {
      specimen: lila,
      lightZone: "Hell anna",
    });
    expect(zoned.body["after"]["lightZone"]).toMatchObject({ name: "Hell anna" });
    const cleared = await tool(subA, "set_specimen_light_zone", {
      specimen: lila,
      lightZone: null,
    });
    expect(cleared.body["after"]["lightZone"]).toMatchObject({ name: "Schatten anna" });
    const repot = await tool(subA, "repot_specimen", {
      specimen: lila,
      date: "2026-11-01",
      timeZone: TZ,
    });
    expect(repot.error).toBe(false);
    expect(repot.body["operation"]).toBe("specimen.repot_with_pot");
    await call(web(subA), "POST", `/specimens/${A.blue["id"]}/archive`, {
      timeZone: TZ,
      reason: "Test",
    });
    const back = await tool(subA, "restore_specimen", { specimen: lila });
    expect(back.body).toMatchObject({
      before: { status: "archived" },
      after: { archivedAt: null },
    });
  });

  it("US-KI-14 errors are the form's codes: a future catch date, an ambiguous name, an unknown location", async () => {
    const future = await tool(subA, "correct_catch_date", {
      specimen: A.blue["id"],
      catchDate: "2099-01-01",
      timeZone: TZ,
    });
    expect(future.body["error"]["code"]).toBe("specimen.caught_in_future");
    const app = await call(web(subA), "POST", `/specimens/${A.blue["id"]}/catch-date`, {
      catchDate: "2099-01-01",
      timeZone: TZ,
    });
    expect(app.body["error"]["code"]).toBe("specimen.caught_in_future");
    const ambiguous = await tool(subA, "set_specimen_marker", {
      specimen: `Schreibprobe ${tag} anna`,
      marker: "x",
    });
    expect(ambiguous.body["error"]["code"]).toBe("ai.reference_ambiguous");
    const none = await tool(subA, "set_specimen_location", {
      specimen: A.blue["id"],
      location: "Keller",
    });
    expect(none.body["error"]).toMatchObject({
      code: "location.not_found",
      data: { nearest: expect.any(Array) },
    });
  });

  it("US-KI-14 with 'create drafts' only a draft arises with a step-up request; adopting it runs the operation", async () => {
    const d = await collection(subD, "dora");
    const before = await count(subD);
    const r = await tool(
      subD,
      "set_specimen_marker",
      { specimen: d.blue["id"], marker: "gelb" },
      DRAFT,
    );
    expect(r.error).toBe(false);
    expect(r.body).toMatchObject({ mode: "draft", stepUp: { right: "write", scope: WRITE } });
    expect((await specimen(subD, d.blue["id"]))["marker"]).toBe("blau");
    const created = await tool(
      subD,
      "create_specimen",
      { species: speciesName("dora"), marker: "neu", timeZone: TZ },
      DRAFT,
    );
    expect(created.body["mode"]).toBe("draft");
    expect(await count(subD)).toBe(before);
    const adopt = await call(web(subD), "POST", `/ai/drafts/${r.body["draft"]["id"]}/adopt`, {});
    expect(adopt.status).toBe(200);
    expect((await specimen(subD, d.blue["id"]))["marker"]).toBe("gelb");
  });

  it("US-KI-14 with 'read' only nothing is written: 403 with the scope to request (KI-R8)", async () => {
    const r = await call(ai(subA, "pflanzen:read"), "POST", "/mcp/specimens", {
      species: A.species["id"],
      timeZone: TZ,
    });
    expect(r.status).toBe(403);
  });

  it("FR-KI-19 every write is logged with the operation and ids, refusals with their code, never content", async () => {
    const log = (await call(web(subA), "GET", "/ai/log")).body["log"] as Json[];
    const effects = log
      .filter((e) => e["operation"] === "set_specimen_marker")
      .map((e) => e["effect"]);
    expect(effects).toContain(`written: specimen.mark ${A.blue["id"]}`);
    expect(effects).toContain("refused: ai.reference_ambiguous");
    expect(JSON.stringify(log)).not.toContain("lila");
  });

  it("US-DEV-06 while 'ai' is off the write routes answer 404", async () => {
    const before = app;
    app = createApp(options(NO_FEATURES));
    try {
      expect(
        (await call(ai(subA), "POST", "/mcp/specimens", { species: A.species["id"], timeZone: TZ }))
          .status,
      ).toBe(404);
    } finally {
      app = before;
    }
  });
});

describe("FR-KI-14 the tool and the app route run the same operation", () => {
  // The idempotency key is kept per operation: a tool call with the key of an app call is that call's repeat.
  it("FR-KI-14 create_specimen repeats the app's specimen.create (same key, one specimen)", async () => {
    const key = randomUUID();
    const input = {
      speciesId: A.species["id"],
      locationId: A.shelf["id"],
      marker: "same",
      timeZone: TZ,
    };
    const appCall = await call(web(subA), "POST", "/specimens", input, key);
    const n = await count(subA);
    const r = await tool(subA, "create_specimen", {
      species: A.species["id"],
      location: A.shelf["id"],
      marker: "same",
      timeZone: TZ,
      idempotencyKey: key,
    });
    expect(r.body["result"]["id"]).toBe(appCall.body["id"]);
    expect(await count(subA)).toBe(n);
  });

  it("FR-KI-14 marker, catch date, location, light zone, repot and restore: the tool with the app's key changes nothing", async () => {
    const s = A.blue["id"];
    const path = (p: string) => `/specimens/${s}/${p}`;
    const cases: [string, string, Json, Json, Json][] = [
      ["set_specimen_marker", "marker", { marker: "eins" }, { marker: "zwei" }, { marker: "eins" }],
      [
        "correct_catch_date",
        "catch-date",
        { catchDate: "2026-09-01", timeZone: TZ },
        { catchDate: "2026-09-02", timeZone: TZ },
        { catchDate: "2026-09-01", timeZone: TZ },
      ],
      [
        "set_specimen_location",
        "location",
        { locationId: A.sill["id"] },
        { locationId: A.shelf["id"] },
        { location: A.sill["id"] },
      ],
      [
        "set_specimen_light_zone",
        "light-zone",
        { lightZoneId: A.bright["id"] },
        { lightZoneId: null },
        { lightZone: A.bright["id"] },
      ],
      [
        "repot_specimen",
        "repot",
        { date: "2026-10-20", timeZone: TZ, potId: null },
        { date: "2026-10-21", timeZone: TZ, potId: null },
        { date: "2026-10-20", timeZone: TZ, potId: null },
      ],
    ];
    for (const [name, p, first, second, args] of cases) {
      const key = randomUUID();
      expect((await call(web(subA), "POST", path(p), first, key)).status).toBeLessThan(300);
      expect((await call(web(subA), "POST", path(p), second)).status).toBeLessThan(300);
      const after = await specimen(subA, s);
      const r = await tool(subA, name, { specimen: s, ...args, idempotencyKey: key });
      expect(r.error, name).toBe(false);
      expect(await specimen(subA, s), name).toEqual(after);
    }
    const key = randomUUID();
    await call(web(subA), "POST", path("archive"), { timeZone: TZ, reason: "Test" });
    await call(web(subA), "POST", path("restore"), {}, key);
    await call(web(subA), "POST", path("archive"), { timeZone: TZ, reason: "Test" });
    const r = await tool(subA, "restore_specimen", { specimen: s, idempotencyKey: key });
    expect(r.error).toBe(false);
    expect((await specimen(subA, s))["status"]).toBe("archived");
    await call(web(subA), "POST", path("restore"), {});
  });
});

describe("FR-KI-23 tenant isolation of every write tool", () => {
  const specimenArgs: Record<string, Json> = {
    set_specimen_marker: { marker: "fremd" },
    correct_catch_date: { catchDate: "2026-01-01", timeZone: TZ },
    set_specimen_location: { location: "Regal anna" },
    set_specimen_light_zone: { lightZone: null },
    repot_specimen: { timeZone: TZ },
    restore_specimen: {},
  };

  it("FR-KI-23 a connection of A cannot write on B's specimen by id or by name (specimen.not_found)", async () => {
    const before = await specimen(subB, B.blue["id"]);
    for (const [name, args] of Object.entries(specimenArgs))
      for (const ref of [B.blue["id"], nameOf("bernd", "blau")]) {
        const r = await tool(subA, name, { specimen: ref, ...args });
        expect([name, r.body["error"]["code"]]).toEqual([name, "specimen.not_found"]);
      }
    expect(await specimen(subB, B.blue["id"])).toEqual(before);
    expect(Object.keys(specimenArgs).length + 1).toBe(SPECIMEN_WRITES.length);
  });

  it("FR-KI-23 A cannot use B's species, location or light zone by id or by name (not_found, never access.denied)", async () => {
    const n = await count(subB);
    const refs: [string, Json, string][] = [
      ["create_specimen", { species: B.species["id"], timeZone: TZ }, "species.not_found"],
      ["create_specimen", { species: speciesName("bernd"), timeZone: TZ }, "species.not_found"],
      [
        "create_specimen",
        { species: A.species["id"], location: B.shelf["id"], timeZone: TZ, marker: "x1" },
        "location.not_found",
      ],
      [
        "create_specimen",
        { species: A.species["id"], lightZone: "Hell bernd", timeZone: TZ, marker: "x2" },
        "light_zone.not_found",
      ],
      [
        "set_specimen_location",
        { specimen: A.blue["id"], location: "Regal bernd" },
        "location.not_found",
      ],
      [
        "set_specimen_location",
        { specimen: A.blue["id"], location: B.sill["id"] },
        "location.not_found",
      ],
      [
        "set_specimen_light_zone",
        { specimen: A.blue["id"], lightZone: B.bright["id"] },
        "light_zone.not_found",
      ],
    ];
    for (const [name, args, code] of refs) {
      const r = await tool(subA, name, args);
      expect([name, r.body["error"]["code"]]).toEqual([name, code]);
    }
    expect(await count(subB)).toBe(n);
  });
});
