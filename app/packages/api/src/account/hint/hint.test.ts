import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { ALL_FEATURES } from "@pflanzendex/core";
import { createApp, type AppOptions } from "../../app";

// US-ONB-07: calm hints and the end of the guide per account through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
const subA = `onb07-${randomUUID()}`;
const subB = `onb07-${randomUUID()}`;
const reviewer: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let now = new Date("2026-10-18T10:00:00Z");
let style: "few" | "many" = "few";
let app: ReturnType<typeof createApp>;

async function call(sub: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const TZ = "timeZone=Europe%2FBerlin";
const ASK = `/onboarding/hints?${TZ}&applicable=first_plant_saved,plant_without_place`;
const put = (sub: string, occasion: string, state: string) =>
  call(sub, "PUT", `/onboarding/hints/${occasion}`, { state, timeZone: "Europe/Berlin" });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({
    reviewer,
    pool,
    clock: () => now,
    keeperStyle: async () => style,
    features: ALL_FEATURES,
  });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-ONB-07 calm hints through the API", () => {
  it("US-ONB-07 without a token: 401; a missing time zone or state: 400", async () => {
    expect((await call(null, "GET", ASK)).status).toBe(401);
    expect((await call(subA, "GET", "/onboarding/hints")).status).toBe(400);
    const bad = await put(subA, "first_plant_saved", "later");
    expect(bad.status).toBe(400);
    expect(bad.body["error"].code).toBe("input.invalid");
  });

  it("US-ONB-07 one hint at a time; dismissing it lets the next one show and never returns", async () => {
    expect((await call(subA, "GET", ASK)).body).toEqual({
      hint: "first_plant_saved",
      guideEnded: false,
    });
    expect((await put(subA, "first_plant_saved", "shown")).status).toBe(200);
    expect((await call(subA, "GET", ASK)).body["hint"]).toBe("first_plant_saved");
    expect((await put(subA, "first_plant_saved", "dismissed")).status).toBe(200);
    expect((await call(subA, "GET", ASK)).body["hint"]).toBe("plant_without_place");
    const only = `/onboarding/hints?${TZ}&applicable=first_plant_saved`;
    expect((await call(subA, "GET", only)).body["hint"]).toBeNull();
  });

  it("US-ONB-07 a hint shown 8 days ago leaves and does not come back", async () => {
    await put(subA, "plant_without_place", "shown");
    now = new Date("2026-10-26T10:00:00Z");
    expect((await call(subA, "GET", ASK)).body["hint"]).toBeNull();
    now = new Date("2026-10-18T10:00:00Z");
  });

  it("US-ONB-07 style many shows no hint", async () => {
    style = "many";
    expect((await call(subB, "GET", ASK)).body["hint"]).toBeNull();
    style = "few";
    expect((await call(subB, "GET", ASK)).body["hint"]).toBe("first_plant_saved");
  });

  it("US-ONB-07 calm mode shows no hint, the information stays elsewhere", async () => {
    const id = (await admin.query("select id from account where subject = $1", [subB])).rows[0].id;
    await admin.query(
      "insert into achievement_setting (account_id, calm_mode) values ($1, true) on conflict (account_id) do update set calm_mode = true",
      [id],
    );
    expect((await call(subB, "GET", ASK)).body["hint"]).toBeNull();
    await admin.query("update achievement_setting set calm_mode = false where account_id = $1", [
      id,
    ]);
  });

  it("DM-ONB-03 the end of the guide is stored per account, not per device (P-04)", async () => {
    expect((await call(subA, "GET", ASK)).body["guideEnded"]).toBe(false);
    expect((await put(subA, "first_plant_guide", "dismissed")).status).toBe(200);
    expect((await call(subA, "GET", ASK)).body["guideEnded"]).toBe(true);
    expect((await call(subB, "GET", ASK)).body["guideEnded"]).toBe(false);
  });

  it("US-ONB-07 an unknown occasion: 404 onboarding.unknown_occasion", async () => {
    const r = await put(subA, "tour_step_3", "shown");
    expect(r.status).toBe(404);
    expect(r.body["error"].code).toBe("onboarding.unknown_occasion");
  });
});
