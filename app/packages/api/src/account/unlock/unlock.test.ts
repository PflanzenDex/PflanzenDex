import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { ALL_FEATURES, NO_FEATURES } from "@pflanzendex/core";
import { createApp, type AppOptions } from "../../app";

// US-ONB-05: lock states, reason and way and the unlock by tap through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
const subA = `onb05-${randomUUID()}`;
const subB = `onb05-${randomUUID()}`;
const reviewer: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
const NOW = new Date("2026-10-18T10:00:00Z");
let app: ReturnType<typeof createApp>;
let appOff: ReturnType<typeof createApp>;

async function call(
  target: ReturnType<typeof createApp>,
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await target.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const TZ = "?timeZone=Europe%2FBerlin";

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  const common = { reviewer, pool, clock: () => NOW, keeperStyle: async () => "few" as const };
  app = createApp({ ...common, features: ALL_FEATURES });
  appOff = createApp({ ...common, features: NO_FEATURES });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-ONB-05 lock states through the API", () => {
  it("US-ONB-05 without a token: 401", async () => {
    expect((await call(app, null, "GET", `/onboarding/unlocks${TZ}`)).status).toBe(401);
    expect((await call(app, null, "POST", "/onboarding/unlocks/wishlist", {})).status).toBe(401);
  });

  it("US-ONB-05 a missing or invalid time zone: 400 input.invalid", async () => {
    expect((await call(app, subA, "GET", "/onboarding/unlocks")).status).toBe(400);
    const r = await call(app, subA, "POST", "/onboarding/unlocks/wishlist", { timeZone: "x" });
    expect(r.status).toBe(400);
    expect(r.body["error"].code).toBe("input.invalid");
  });

  it("US-ONB-05 a keeper without plants sees the locked functions with reason and way as data", async () => {
    const r = await call(app, subA, "GET", `/onboarding/unlocks${TZ}`);
    expect(r.status).toBe(200);
    const list = r.body["functions"] as { id: string; state: string; reasons: unknown[] }[];
    expect(list.find((f) => f.id === "today")?.state).toBe("open");
    const year = list.find((f) => f.id === "year_in_review");
    expect(year).toMatchObject({ state: "locked", mayUnlockNow: true, destination: "account" });
    expect(year?.reasons.length).toBeGreaterThan(0);
  });

  it("US-ONB-05 a direct call to a locked function answers onboarding.locked with the same data (FR-ONB-02)", async () => {
    const r = await call(app, subA, "GET", `/onboarding/unlocks/year_in_review${TZ}`);
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("onboarding.locked");
    expect(r.body["error"].data).toMatchObject({ id: "year_in_review", state: "locked" });
    expect((await call(app, subA, "GET", `/onboarding/unlocks/today${TZ}`)).status).toBe(200);
  });

  it("US-ONB-05 an unknown function: 404 onboarding.unknown_function", async () => {
    const r = await call(app, subA, "GET", `/onboarding/unlocks/nonsense${TZ}`);
    expect(r.status).toBe(404);
    expect(r.body["error"].code).toBe("onboarding.unknown_function");
  });

  it("US-ONB-05 the tap opens the function for good, only for this account (P-04)", async () => {
    const tap = await call(app, subA, "POST", "/onboarding/unlocks/year_in_review", {
      timeZone: "Europe/Berlin",
    });
    expect(tap.status).toBe(200);
    expect(tap.body).toEqual({ id: "year_in_review", unlockedOn: "2026-10-18" });
    expect((await call(app, subA, "GET", `/onboarding/unlocks/year_in_review${TZ}`)).status).toBe(
      200,
    );
    expect((await call(app, subB, "GET", `/onboarding/unlocks/year_in_review${TZ}`)).status).toBe(
      409,
    );
  });

  it("US-ONB-05 a unknown function cannot be unlocked: 404 and nothing is written", async () => {
    const r = await call(app, subA, "POST", "/onboarding/unlocks/nonsense", {
      timeZone: "Europe/Berlin",
    });
    expect(r.status).toBe(404);
    expect(r.body["error"].code).toBe("onboarding.unknown_function");
  });

  it("US-ONB-05 a function the operator switched off is neither listed nor announced nor unlockable (FR-ONB-03)", async () => {
    const list = (await call(appOff, subA, "GET", `/onboarding/unlocks${TZ}`)).body[
      "functions"
    ] as { id: string }[];
    expect(list.map((f) => f.id)).not.toContain("friends");
    expect((await call(appOff, subA, "GET", `/onboarding/unlocks/friends${TZ}`)).status).toBe(404);
    const tap = await call(appOff, subA, "POST", "/onboarding/unlocks/friends", {
      timeZone: "Europe/Berlin",
    });
    expect(tap.status).toBe(404);
  });
});

describe("US-ONB-05 default style until US-ONB-03", () => {
  it("US-ONB-05 without a stored style nothing is locked (FR-ONB-06)", async () => {
    const plain = createApp({ reviewer, pool, clock: () => NOW });
    const list = (await call(plain, subA, "GET", `/onboarding/unlocks${TZ}`)).body["functions"] as {
      state: string;
    }[];
    expect(list.every((f) => f.state === "open")).toBe(true);
  });
});
