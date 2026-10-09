import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-WUN-02: the buffer is an account setting; the warning and the Today list use it at once (real PostgreSQL).
let pool: Pool;
let admin: Pool;
const subA = `wun2-${randomUUID()}`;
const subB = `wun2-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Res = { status: number; body: Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(sub: string, method: string, path: string, body?: unknown): Promise<Res> {
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
const profile = (sub: string, replenishBuffer?: unknown) =>
  call(sub, "PUT", "/account/profile", {
    displayName: "Anna",
    timeZone: "Europe/Berlin",
    everythingPrivate: false,
    noRecommendations: false,
    notifications: {},
    ...(replenishBuffer === undefined ? {} : { replenishBuffer }),
  });
const replenishment = async (sub: string) =>
  (await call(sub, "GET", "/wishes/candidates")).body["replenishment"] as {
    buffer: number;
    zones: { name: string; open: number }[];
  };
const buffer = async (sub: string) =>
  (await call(sub, "GET", "/account/profile")).body["replenishBuffer"];

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  await call(subA, "POST", "/light-zones/defaults", {});
  await call(subB, "POST", "/light-zones/defaults", {});
});
afterAll(async () => {
  const subjects = [[subA, subB]];
  await admin.query(
    "delete from wish where account_id in (select id from account where subject = any($1))",
    subjects,
  );
  await admin.query(
    "delete from light_zone where account_id in (select id from account where subject = any($1))",
    subjects,
  );
  await admin.query("delete from account where subject = any($1)", subjects);
  await pool.end();
  await admin.end();
});

describe("US-WUN-02 the buffer as an account setting", () => {
  it("is 2 until it is changed, and the warning names that buffer", async () => {
    expect(await buffer(subA)).toBe(2);
    const r = await replenishment(subA);
    expect(r.buffer).toBe(2);
    expect(r.zones.map((z) => z.name)).toEqual(["Lampe 2", "Lampe 3", "Lampe 4"]);
  });

  it("a saved value is used by the warning at once; 0 switches the warning off", async () => {
    expect((await profile(subA, 0)).status).toBe(200);
    expect(await replenishment(subA)).toMatchObject({ buffer: 0, zones: [] });
    expect((await profile(subA, 4)).status).toBe(200);
    expect(await replenishment(subA)).toMatchObject({ buffer: 4 });
  });

  it("the Today list follows the same buffer", async () => {
    await profile(subA, 3);
    const warned = await call(subA, "GET", "/today?timeZone=Europe/Berlin");
    expect(
      warned.body["items"].filter((i: { kind: string }) => i.kind === "buffer_low"),
    ).toHaveLength(3);
    await profile(subA, 0);
    const quiet = await call(subA, "GET", "/today?timeZone=Europe/Berlin");
    expect(
      quiet.body["items"].filter((i: { kind: string }) => i.kind === "buffer_low"),
    ).toHaveLength(0);
  });

  it("an invalid value is refused with the field named and nothing changes; an older client keeps the value", async () => {
    await profile(subA, 5);
    const bad = await profile(subA, 11);
    expect([bad.status, bad.body["error"].details]).toEqual([
      400,
      [{ field: "replenishBuffer", code: "input.invalid" }],
    ]);
    expect(await buffer(subA)).toBe(5);
    await profile(subA);
    expect(await buffer(subA)).toBe(5);
  });

  it("tenant: another account keeps its own buffer (P-04)", async () => {
    await profile(subA, 7);
    expect(await buffer(subB)).toBe(2);
    expect((await replenishment(subB)).buffer).toBe(2);
  });
});
