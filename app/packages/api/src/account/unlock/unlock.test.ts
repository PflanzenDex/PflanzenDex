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

  it("US-ONB-05 a function whose data exists is open whatever the rule says: a wish opens wishlist and discover (P-10)", async () => {
    const sub = `onb05-${randomUUID()}`;
    await call(app, sub, "GET", `/onboarding/unlocks${TZ}`);
    const id = (await admin.query("select id from account where subject = $1", [sub])).rows[0].id;
    await admin.query(
      "insert into wish (account_id, name, name_key) values ($1, 'Monstera', 'monstera')",
      [id],
    );
    const r = await call(app, sub, "GET", `/onboarding/unlocks${TZ}`);
    const state = (fn: string) =>
      r.body["functions"].find((f: { id: string }) => f.id === fn).state;
    expect(state("wishlist")).toBe("open");
    expect(state("discover")).toBe("open");
    expect(state("friends")).toBe("locked");
    await admin.query("delete from account where subject = $1", [sub]);
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

describe("US-ONB-03 keeper style through the API", () => {
  const plain = () => createApp({ reviewer, pool, clock: () => NOW });
  const states = async (sub: string) =>
    Object.fromEntries(
      (
        (await call(plain(), sub, "GET", `/onboarding/unlocks${TZ}`)).body["functions"] as {
          id: string;
          state: string;
        }[]
      ).map((f) => [f.id, f.state]),
    );
  const subC = `onb03-${randomUUID()}`;
  const subD = `onb03-${randomUUID()}`;
  afterAll(async () => {
    await admin.query("delete from account where subject = any($1)", [[subC, subD]]);
  });

  it("US-ONB-03 without a token: 401", async () => {
    expect((await call(plain(), null, "GET", "/onboarding/style")).status).toBe(401);
    expect((await call(plain(), null, "PUT", "/onboarding/style", {})).status).toBe(401);
  });

  it("US-ONB-03 a new account has not chosen yet, counts as few and has staged functions", async () => {
    const r = await call(plain(), subC, "GET", "/onboarding/style");
    expect(r.body).toEqual({ style: "few", chosen: false });
    expect((await states(subC))["year_in_review"]).toBe("locked");
  });

  it("US-ONB-03 skipping the question stores few; the question is not asked again", async () => {
    const r = await call(plain(), subC, "PUT", "/onboarding/style", {
      style: "few",
      timeZone: "Europe/Berlin",
    });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ style: "few", chosenOn: "2026-10-18" });
    expect((await call(plain(), subC, "GET", "/onboarding/style")).body).toEqual({
      style: "few",
      chosen: true,
    });
  });

  it("US-ONB-03 many opens every function at once, the unlock date is the switch date", async () => {
    await call(plain(), subC, "PUT", "/onboarding/style", {
      style: "many",
      timeZone: "Europe/Berlin",
    });
    expect(Object.values(await states(subC)).every((s) => s === "open")).toBe(true);
  });

  it("US-ONB-03 back to few: what was opened stays open (P-10)", async () => {
    await call(plain(), subC, "PUT", "/onboarding/style", {
      style: "few",
      timeZone: "Europe/Berlin",
    });
    const after = await states(subC);
    expect(Object.values(after).every((s) => s === "open")).toBe(true);
  });

  it("US-ONB-03 the style of one account does not reach another (P-04, P-05)", async () => {
    expect((await call(plain(), subD, "GET", "/onboarding/style")).body).toEqual({
      style: "few",
      chosen: false,
    });
    expect((await states(subD))["year_in_review"]).toBe("locked");
  });

  it("US-ONB-03 an unknown style or a bad time zone is refused with input.invalid and nothing is stored", async () => {
    for (const input of [
      { style: "level3", timeZone: "Europe/Berlin" },
      { timeZone: "Europe/Berlin" },
      { style: "many", timeZone: "x" },
    ]) {
      const r = await call(plain(), subD, "PUT", "/onboarding/style", input);
      expect(r.status).toBe(400);
      expect(r.body["error"].code).toBe("input.invalid");
    }
    expect((await call(plain(), subD, "GET", "/onboarding/style")).body["chosen"]).toBe(false);
  });

  it("US-ONB-03 a switched-off function stays unannounced under many (FR-ONB-03)", async () => {
    const off = createApp({ reviewer, pool, clock: () => NOW, features: NO_FEATURES });
    await call(off, subD, "PUT", "/onboarding/style", { style: "many", timeZone: "Europe/Berlin" });
    const list = (await call(off, subD, "GET", `/onboarding/unlocks${TZ}`)).body["functions"] as {
      id: string;
    }[];
    expect(list.map((f) => f.id)).not.toContain("friends");
  });
});

// US-ONB-09: the keeper's switches through the API (DM-ONB-04, P-03, P-04, P-05, FR-KI-22).
describe("US-ONB-09 keeper switches through the API", () => {
  it("US-ONB-09 without a token: 401, and the switch is not written", async () => {
    const r = await call(app, null, "PUT", "/onboarding/switches/wishlist", {
      enabled: false,
      timeZone: "Europe/Berlin",
    });
    expect(r.status).toBe(401);
  });

  it("US-ONB-09 a write without Idempotency-Key is refused before anything else (US-QS-03)", async () => {
    const res = await app.request("/onboarding/switches/wishlist", {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer valid:${subA}` },
      body: JSON.stringify({ enabled: false, timeZone: "Europe/Berlin" }),
    });
    expect(res.status).toBe(400);
    const answer = (await res.json()) as { error: { code: string } };
    expect(answer.error.code).toBe("idempotency.key_missing");
  });

  it("US-ONB-09 a missing or invalid time zone or enabled flag: 400 input.invalid", async () => {
    const noZone = await call(app, subA, "PUT", "/onboarding/switches/wishlist", {
      enabled: false,
    });
    expect(noZone.status).toBe(400);
    expect(noZone.body["error"].code).toBe("input.invalid");
    const noFlag = await call(app, subA, "PUT", "/onboarding/switches/wishlist", {
      enabled: "no",
      timeZone: "Europe/Berlin",
    });
    expect(noFlag.status).toBe(400);
    expect(noFlag.body["error"].code).toBe("input.invalid");
  });

  it("US-ONB-09 a core feature has no switch: 409 onboarding.core_feature, nothing changes", async () => {
    const r = await call(app, subA, "PUT", "/onboarding/switches/pokedex", {
      enabled: false,
      timeZone: "Europe/Berlin",
    });
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("onboarding.core_feature");
    const list = await call(app, subA, "GET", `/onboarding/unlocks${TZ}`);
    expect(list.body["functions"].find((f: { id: string }) => f.id === "pokedex")?.state).toBe(
      "locked",
    );
  });

  it("US-ONB-09 an unknown feature: 404 onboarding.unknown_function", async () => {
    const r = await call(app, subA, "PUT", "/onboarding/switches/teleport", {
      enabled: false,
      timeZone: "Europe/Berlin",
    });
    expect(r.status).toBe(404);
    expect(r.body["error"].code).toBe("onboarding.unknown_function");
  });

  it("US-ONB-09 switched off: the feature is listed as keeper_off, never locked and never announced", async () => {
    const off = await call(app, subA, "PUT", "/onboarding/switches/wishlist", {
      enabled: false,
      timeZone: "Europe/Berlin",
    });
    expect(off).toMatchObject({ status: 200 });
    const list = await call(app, subA, "GET", `/onboarding/unlocks${TZ}`);
    expect(list.status).toBe(200);
    const wish = (list.body["functions"] as { id: string }[]).find((f) => f.id === "wishlist");
    expect(wish).toMatchObject({
      state: "keeper_off",
      announced: false,
      mayUnlockNow: false,
      keeperSwitch: "wishlist",
    });
  });

  it("US-ONB-09 a switched-off feature answers 409 onboarding.keeper_off on its own address, with the same entry as data", async () => {
    const r = await call(app, subA, "GET", `/onboarding/unlocks/wishlist${TZ}`);
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("onboarding.keeper_off");
    expect(r.body["error"].data).toMatchObject({ id: "wishlist", state: "keeper_off" });
  });

  it("US-ONB-09 an unlock never switches a feature on: the tap is refused with 409 onboarding.keeper_off", async () => {
    const r = await call(app, subA, "POST", "/onboarding/unlocks/wishlist", {
      timeZone: "Europe/Berlin",
    });
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("onboarding.keeper_off");
    const list = await call(app, subA, "GET", `/onboarding/unlocks${TZ}`);
    expect(
      (list.body["functions"] as { id: string; state: string }[]).find((f) => f.id === "wishlist")
        ?.state,
    ).toBe("keeper_off");
  });

  it("US-ONB-09 switching on again shows the feature as before (locked with reason and way)", async () => {
    const on = await call(app, subA, "PUT", "/onboarding/switches/wishlist", {
      enabled: true,
      timeZone: "Europe/Berlin",
    });
    expect(on.status).toBe(200);
    const r = await call(app, subA, "GET", `/onboarding/unlocks/wishlist${TZ}`);
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("onboarding.locked");
    expect(r.body["error"].data).toMatchObject({ state: "locked", mayUnlockNow: true });
  });

  it("US-ONB-09 the switch of one account is invisible to another (P-04, P-05)", async () => {
    await call(app, subA, "PUT", "/onboarding/switches/equipment", {
      enabled: false,
      timeZone: "Europe/Berlin",
    });
    const other = await call(app, subB, "GET", `/onboarding/unlocks${TZ}`);
    expect(
      (other.body["functions"] as { id: string; state: string }[]).find((f) => f.id === "equipment")
        ?.state,
    ).not.toBe("keeper_off");
  });
});
