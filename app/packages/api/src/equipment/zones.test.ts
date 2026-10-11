import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-02 through the API (real PostgreSQL): lamps in light zones, warnings, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ2-${randomUUID()}`;
const subB = `equ2-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string,
  method: string,
  path: string,
  body?: unknown,
  key: string | null = randomUUID(),
): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer valid:${sub}`,
  };
  if (key && method !== "GET") headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const defaults = async (sub: string) => {
  const r = await call(sub, "POST", "/light-zones/defaults", {});
  return Object.fromEntries(
    (r.body["zones"] as { id: string; name: string }[]).map((z) => [z.name, z.id]),
  ) as Record<string, string>;
};
const lamp = (sub: string, name: string, lightZoneId: string) =>
  call(sub, "POST", "/equipment", { type: "Lamp", name, lightZoneId });
const view = async (sub: string) => (await call(sub, "GET", "/equipment/zones")).body;
type ZoneRow = {
  name: string;
  specimens: number | null;
  lamps: { name: string; status: string }[];
  note: { kind: string } | null;
};
const zoneNamed = async (sub: string, name: string) =>
  ((await view(sub))["zones"] as ZoneRow[]).find((z) => z.name === name) as ZoneRow;

let zoneA: Record<string, string> = {};
let zoneB: Record<string, string> = {};
// The stock per zone 2 to 4 (US-LIC-02) is answered by a stub: the specimens of the collection are not the subject here.
const counts: Record<string, number> = {};
const zoneStock = {
  stock: async () =>
    Object.entries(counts).map(([zoneId, count]) => ({ zoneId, name: zoneId, count })),
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, zoneStock });
  zoneA = await defaults(subA);
  zoneB = await defaults(subB);
  counts[zoneA["Lampe 2"] as string] = 3;
  counts[zoneA["Lampe 3"] as string] = 0;
});
afterAll(async () => {
  const owned = "account_id in (select id from account where subject = any($1))";
  await admin.query(`delete from equipment where ${owned}`, [[subA, subB]]);
  await admin.query(`delete from light_zone where ${owned}`, [[subA, subB]]);
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-02 lamps in light zones through the API", () => {
  it("US-EQU-02 warns for a zone with specimens but no active lamp (P-10)", async () => {
    const z = await zoneNamed(subA, "Lampe 2");
    expect(z).toMatchObject({ specimens: 3, lamps: [], note: { kind: "no_active_lamp" } });
    expect((await zoneNamed(subA, "Lampe 1")).specimens).toBeNull();
  });

  it("US-EQU-02 assigns a lamp to a zone, shows it there and removes the warning", async () => {
    const made = await lamp(subA, "Lampe Regal", zoneA["Lampe 2"] as string);
    expect(made.status).toBe(201);
    const z = await zoneNamed(subA, "Lampe 2");
    expect(z.lamps).toEqual([{ id: expect.any(String), name: "Lampe Regal", status: "active" }]);
    expect(z.note).toBeNull();
  });

  it("US-EQU-02 a defective lamp brings the warning back; an active lamp over an empty zone is only a hint", async () => {
    const id = (await view(subA))["zones"].find((z: ZoneRow) => z.name === "Lampe 2").lamps[0].id;
    const r = await call(subA, "POST", `/equipment/${id}/status`, { status: "defective" });
    expect(r.status).toBe(200);
    expect(r.body["status"]).toBe("defective");
    expect((await zoneNamed(subA, "Lampe 2")).note).toMatchObject({ kind: "no_active_lamp" });
    await lamp(subA, "Lampe leer", zoneA["Lampe 3"] as string);
    expect((await zoneNamed(subA, "Lampe 3")).note).toMatchObject({ kind: "unused_capacity" });
  });

  it("US-EQU-02 refuses a lamp without a zone and a zone of another account", async () => {
    const none = await call(subA, "POST", "/equipment", { type: "Lamp", name: "Ohne" });
    expect(none.status).toBe(400);
    const foreign = await lamp(subA, "Fremd", zoneB["Lampe 2"] as string);
    expect(foreign.status).toBe(404);
    expect(foreign.body["error"].code).toBe("light_zone.not_found");
  });

  it("US-EQU-02 moves a lamp; another account cannot touch it (P-04)", async () => {
    const made = await lamp(subA, "Wanderlampe", zoneA["Lampe 2"] as string);
    const id = made.body["equipment"].id as string;
    const moved = await call(subA, "POST", `/equipment/${id}/zone`, {
      lightZoneId: zoneA["Lampe 3"],
    });
    expect(moved.status).toBe(200);
    expect(moved.body["lightZoneId"]).toBe(zoneA["Lampe 3"]);
    const stolen = await call(subB, "POST", `/equipment/${id}/zone`, {
      lightZoneId: zoneB["Lampe 3"],
    });
    expect(stolen.status).toBe(404);
    expect(stolen.body["error"].code).toBe("equipment.not_found");
    const state = await call(subB, "POST", `/equipment/${id}/status`, { status: "retired" });
    expect(state.status).toBe(404);
  });

  it("US-EQU-02 only a lamp has a zone and only a device a state", async () => {
    const pot = await call(subA, "POST", "/equipment", { type: "Pot", name: "Topf-Z" });
    const soil = await call(subA, "POST", "/equipment", { type: "Substrate", name: "Erde-Z" });
    const potId = pot.body["equipment"].id as string;
    const soilId = soil.body["equipment"].id as string;
    const zone = await call(subA, "POST", `/equipment/${potId}/zone`, {
      lightZoneId: zoneA["Lampe 2"],
    });
    expect(zone.status).toBe(409);
    expect(zone.body["error"].code).toBe("equipment.not_a_lamp");
    const state = await call(subA, "POST", `/equipment/${soilId}/status`, { status: "retired" });
    expect(state.status).toBe(409);
    expect(state.body["error"].code).toBe("equipment.no_status");
  });

  it("P-10 a zone with a lamp cannot be deleted and names the lamp", async () => {
    const r = await call(subA, "DELETE", `/light-zones/${zoneA["Lampe 2"]}`);
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("light_zone.in_use");
    expect(JSON.stringify(r.body)).toContain("equipment");
  });
});
