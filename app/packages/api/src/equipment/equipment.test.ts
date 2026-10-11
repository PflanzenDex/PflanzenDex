import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-01 through the API (real PostgreSQL): record equipment, tenant isolation (P-04).
let pool: Pool;
let admin: Pool;
const subA = `equ1-${randomUUID()}`;
const subB = `equ1-${randomUUID()}`;
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

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await admin.query(
    "delete from equipment where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await admin.end();
  await pool.end();
});

describe("US-EQU-01 record equipment through the API", () => {
  it("US-EQU-01 needs sign-in", async () => {
    expect((await call(null, "GET", "/equipment")).status).toBe(401);
    expect((await call(null, "POST", "/equipment", { type: "Lamp", name: "X" })).status).toBe(401);
  });

  it("US-EQU-01 records a device with type and name only and lists it", async () => {
    const r = await call(subA, "POST", "/equipment", { type: "Lamp", name: "Lampe 3" });
    expect(r.status).toBe(201);
    expect(r.body["equipment"]).toMatchObject({
      type: "Lamp",
      name: "Lampe 3",
      status: "active",
      priceEur: null,
      boughtAt: null,
    });
    const list = await call(subA, "GET", "/equipment");
    expect(list.body["equipment"]).toHaveLength(1);
  });

  it("US-EQU-01 refuses an invalid input with a code and writes nothing", async () => {
    const r = await call(subA, "POST", "/equipment", { type: "Lamp" });
    expect(r.status).toBe(400);
    expect(r.body["error"].code).toBe("input.invalid");
    const url = await call(subA, "POST", "/equipment", {
      type: "Lamp",
      name: "Mit Link",
      productId: "https://shop.example/x",
    });
    expect(url.status).toBe(400);
    expect((await call(subA, "GET", "/equipment")).body["equipment"]).toHaveLength(1);
  });

  it("US-EQU-01 refuses a duplicate name with equipment.name_taken", async () => {
    const r = await call(subA, "POST", "/equipment", { type: "Timer", name: "LAMPE 3" });
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("equipment.name_taken");
  });

  it("P-04 another account sees nothing and may use the same name", async () => {
    expect((await call(subB, "GET", "/equipment")).body["equipment"]).toEqual([]);
    const r = await call(subB, "POST", "/equipment", { type: "Lamp", name: "Lampe 3" });
    expect(r.status).toBe(201);
    expect((await call(subA, "GET", "/equipment")).body["equipment"]).toHaveLength(1);
  });

  it("US-QS-03 the same Idempotency-Key records once", async () => {
    const key = randomUUID();
    const input = { type: "Pot", name: "Topf 12 cm" };
    const first = await call(subA, "POST", "/equipment", input, key);
    const again = await call(subA, "POST", "/equipment", input, key);
    expect(first.status).toBe(201);
    expect(again.status).toBe(201);
    expect(
      (await call(subA, "GET", "/equipment")).body["equipment"].filter(
        (e: { name: string }) => e.name === "Topf 12 cm",
      ),
    ).toHaveLength(1);
  });
});
