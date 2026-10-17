import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-08 through the API (real PostgreSQL): equipment wishes, "Bought" prefill, separate count, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ8-${randomUUID()}`;
const subB = `equ8-${randomUUID()}`;
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

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-08 equipment wishes through the API", () => {
  it("US-EQU-08 records a wish and 'Bought' answers with the prefill for the equipment form", async () => {
    const made = await call(subA, "POST", "/equipment/wishes", {
      equipmentType: "Lamp",
      name: "Growlight X",
      productId: "GL-1",
      priceEur: 49.9,
    });
    expect(made.status).toBe(201);
    const id = made.body["wish"].id as string;
    const bought = await call(subA, "POST", `/equipment/wishes/${id}/buy`);
    expect(bought.status).toBe(200);
    expect(bought.body).toMatchObject({
      changed: true,
      prefill: { type: "Lamp", name: "Growlight X", productId: "GL-1", priceEur: 49.9 },
    });
    const again = await call(subA, "POST", `/equipment/wishes/${id}/buy`);
    expect(again.body).toMatchObject({ changed: false });
    const list = await call(subA, "GET", "/equipment/wishes");
    expect(list.body["open"]).toEqual([]);
    expect(list.body["bought"]).toHaveLength(1);
  });

  it("US-EQU-08 plant and equipment wishes are counted separately: the plant candidates and the buffer stay unchanged", async () => {
    await call(subA, "POST", "/wishes", { name: "Aloe vera" });
    const before = (await call(subA, "GET", "/wishes/candidates")).body;
    await call(subA, "POST", "/equipment/wishes", { equipmentType: "Timer", name: "Timer 1" });
    await call(subA, "POST", "/equipment/wishes", { equipmentType: "Pot", name: "Topf 1" });
    const after = (await call(subA, "GET", "/wishes/candidates")).body;
    expect(after).toEqual(before);
    expect(after["candidates"]).toHaveLength(1);
    const equipmentOpen = (await call(subA, "GET", "/equipment/wishes")).body["open"] as unknown[];
    expect(equipmentOpen).toHaveLength(2);
  });

  it("US-EQU-08 refuses a missing type and a taken name; P-04: another account sees and buys nothing", async () => {
    const bad = await call(subA, "POST", "/equipment/wishes", { name: "Ohne Art" });
    expect(bad.status).toBe(400);
    const dupe = await call(subA, "POST", "/equipment/wishes", {
      equipmentType: "Pot",
      name: "topf 1",
    });
    expect(dupe.status).toBe(409);
    expect(dupe.body["error"].code).toBe("wish.name_taken");
    const mine = (await call(subA, "GET", "/equipment/wishes")).body["open"][0].id as string;
    expect((await call(subB, "GET", "/equipment/wishes")).body["open"]).toEqual([]);
    const foreign = await call(subB, "POST", `/equipment/wishes/${mine}/buy`);
    expect(foreign.status).toBe(404);
    expect(foreign.body["error"].code).toBe("wish.not_found");
  });
});
