import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-05 through the API (real PostgreSQL): operation and maintenance, checks due, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ5-${randomUUID()}`;
const subB = `equ5-${randomUUID()}`;
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
    authorization: `Bearer valid:${sub}`,
  };
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const create = async (sub: string, type: string, name: string) =>
  (await call(sub, "POST", "/equipment", { type, name })).body["equipment"] as {
    id: string;
    supply: string | null;
  };

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  const owned = "account_id in (select id from account where subject = any($1))";
  await admin.query(`delete from equipment where ${owned}`, [[subA, subB]]);
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-05 consumables and supply through the API", () => {
  it("US-EQU-05 a new consumable is available; a tap sets it to low and empty", async () => {
    const soil = await create(subA, "Substrate", "Erde-Vorrat");
    expect(soil.supply).toBe("available");
    const low = await call(subA, "POST", `/equipment/${soil.id}/supply`, { supply: "low" });
    expect(low.status).toBe(200);
    expect(low.body).toMatchObject({ supply: "low" });
    const empty = await call(subA, "POST", `/equipment/${soil.id}/supply`, { supply: "empty" });
    expect(empty.body).toMatchObject({ supply: "empty" });
    const listed = await call(subA, "GET", "/equipment");
    expect(
      (listed.body["equipment"] as { id: string; supply: string }[]).find((e) => e.id === soil.id),
    ).toMatchObject({ supply: "empty" });
  });

  it("US-EQU-05 a device has no supply; an unknown level is refused", async () => {
    const pump = await create(subA, "Pump", "Pumpe-Vorrat");
    expect(pump.supply).toBeNull();
    const r = await call(subA, "POST", `/equipment/${pump.id}/supply`, { supply: "low" });
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("equipment.not_a_consumable");
    const soil = await create(subA, "Substrate", "Erde-Stufe");
    const bad = await call(subA, "POST", `/equipment/${soil.id}/supply`, { supply: "plenty" });
    expect(bad.status).toBe(400);
  });

  it("US-EQU-05 a plant agent is linked to the text of a treatment and listed with its supply", async () => {
    const agent = await create(subA, "Plant agent", "Neem-Mittel");
    const linked = await call(subA, "POST", `/equipment/${agent.id}/agent-link`, {
      agentLink: "Neemöl",
    });
    expect(linked.body).toMatchObject({ agentLink: "Neemöl" });
    await call(subA, "POST", `/equipment/${agent.id}/supply`, { supply: "low" });
    const list = (await call(subA, "GET", "/equipment/agents")).body["agents"] as {
      id: string;
      supply: string;
      agentLink: string | null;
    }[];
    expect(list.find((a) => a.id === agent.id)).toMatchObject({
      supply: "low",
      agentLink: "Neemöl",
    });
    const soil = await create(subA, "Substrate", "Erde-Link");
    const refused = await call(subA, "POST", `/equipment/${soil.id}/agent-link`, {
      agentLink: "x",
    });
    expect(refused.status).toBe(409);
    expect(refused.body["error"].code).toBe("equipment.not_a_plant_agent");
  });

  it("P-04 another account neither sees nor changes supply and link of a consumable", async () => {
    const agent = await create(subA, "Plant agent", "Fremd-Mittel");
    const list = (await call(subB, "GET", "/equipment/agents")).body["agents"] as { id: string }[];
    expect(list.map((a) => a.id)).not.toContain(agent.id);
    const supply = await call(subB, "POST", `/equipment/${agent.id}/supply`, { supply: "low" });
    expect(supply.status).toBe(404);
    const link = await call(subB, "POST", `/equipment/${agent.id}/agent-link`, { agentLink: "x" });
    expect(link.status).toBe(404);
  });
});
