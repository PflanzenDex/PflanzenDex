import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

// US-ACH-08: calm mode per account through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cleanup (QG-D1)
const subA = `ach08-${randomUUID()}`;
const subB = `ach08-${randomUUID()}`;
const reviewer: NonNullable<AppOptions["reviewer"]> = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
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
const settings = (sub: string | null) => call(sub, "GET", "/achievements/settings");
const setCalm = (sub: string | null, calmMode: unknown) =>
  call(sub, "PUT", "/achievements/settings/calm-mode", { calmMode });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
});
afterAll(async () => {
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-ACH-08 calm mode through the API", () => {
  it("US-ACH-08 without a token: 401 on both routes", async () => {
    expect((await settings(null)).status).toBe(401);
    expect((await setCalm(null, true)).status).toBe(401);
  });

  it("US-ACH-08 a new account has calm mode off", async () => {
    const r = await settings(subA);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ calmMode: false });
  });

  it("US-ACH-08 invalid input: 400 input.invalid and nothing is written", async () => {
    for (const bad of ["true", 1, null, undefined]) {
      const r = await setCalm(subA, bad);
      expect(r.status).toBe(400);
      expect(r.body["error"].code).toBe("input.invalid");
    }
    expect((await settings(subA)).body).toEqual({ calmMode: false });
  });

  it("US-ACH-08 switches on and off again, per account (P-04)", async () => {
    expect((await setCalm(subA, true)).body).toEqual({ calmMode: true });
    expect((await settings(subA)).body).toEqual({ calmMode: true });
    expect((await settings(subB)).body).toEqual({ calmMode: false });
    expect((await setCalm(subA, false)).body).toEqual({ calmMode: false });
    expect((await settings(subA)).body).toEqual({ calmMode: false });
  });
});

describe("US-ACH-02 overview through the API", () => {
  const overview = (sub: string | null, zone = "Europe/Berlin") =>
    call(sub, "GET", `/achievements?timeZone=${encodeURIComponent(zone)}`);

  it("US-ACH-02 without a token: 401; without a valid time zone: 400", async () => {
    expect((await overview(null)).status).toBe(401);
    const bad = await overview(subA, "Mars/Base");
    expect(bad.status).toBe(400);
    expect(bad.body["error"].code).toBe("input.invalid");
  });

  it("US-ACH-02 a new account sees every achievement open and the first step named", async () => {
    const r = await overview(subA);
    expect(r.status).toBe(200);
    expect(r.body["calmMode"]).toBe(false);
    expect(r.body["earnedCount"]).toBe(0);
    expect(r.body["firstStep"]).toEqual({
      key: "first-measurement-photo.next",
      specimenId: null,
      specimenName: null,
    });
    expect(r.body["groups"].map((g: { group: string }) => g.group)).toEqual([
      "care",
      "growth",
      "swapping",
      "collecting",
    ]);
  });

  it("US-ACH-08 in calm mode the overview is hidden, for that account only", async () => {
    await setCalm(subB, true);
    expect((await overview(subB)).body).toEqual({ calmMode: true });
    expect((await overview(subA)).body["calmMode"]).toBe(false);
    await setCalm(subB, false);
    expect((await overview(subB)).body["calmMode"]).toBe(false);
  });
});

describe("US-ACH-03 news and seen state through the API", () => {
  const subC = `ach03-${randomUUID()}`;
  const subD = `ach03-${randomUUID()}`;
  const news = (sub: string | null, zone = "Europe/Berlin") =>
    call(sub, "GET", `/achievements/news?timeZone=${encodeURIComponent(zone)}`);
  const markSeen = (sub: string | null, achievements: unknown, timeZone = "Europe/Berlin") =>
    call(sub, "POST", "/achievements/seen", { achievements, timeZone });
  afterAll(async () => {
    await admin.query("delete from account where subject = any($1)", [[subC, subD]]);
  });

  it("US-ACH-03 without a token: 401; without a valid time zone: 400", async () => {
    expect((await news(null)).status).toBe(401);
    expect((await markSeen(null, [])).status).toBe(401);
    const bad = await news(subC, "Mars/Base");
    expect(bad.status).toBe(400);
    expect(bad.body["error"].code).toBe("input.invalid");
  });

  it("US-ACH-03 a new account has nothing new; the first write creates the state, afterwards none is due", async () => {
    expect((await news(subC)).body).toEqual({
      calmMode: false,
      fresh: [],
      acknowledge: [],
      needsWrite: true,
    });
    expect((await markSeen(subC, [])).status).toBe(200);
    expect((await news(subC)).body["needsWrite"]).toBe(false);
  });

  it("US-ACH-03 refuses an achievement that is not earned: 409 achievements.not_earned", async () => {
    const r = await markSeen(subC, ["first-handover"]);
    expect(r.status).toBe(409);
    expect(r.body["error"].code).toBe("achievements.not_earned");
    expect((await markSeen(subC, "x")).status).toBe(400);
  });

  it("US-ACH-03 the seen state belongs to the account (P-04)", async () => {
    await markSeen(subC, []);
    expect((await news(subD)).body["needsWrite"]).toBe(true);
  });

  it("US-ACH-08 calm mode hides the news, for that account only", async () => {
    await setCalm(subD, true);
    expect((await news(subD)).body).toEqual({ calmMode: true });
    expect((await news(subC)).body["calmMode"]).toBe(false);
    await setCalm(subD, false);
    expect((await news(subD)).body["calmMode"]).toBe(false);
  });
});

describe("US-ACH-05 growth moments through the API", () => {
  const subE = `ach05-${randomUUID()}`;
  const growth = (sub: string | null, id: string = randomUUID()) =>
    call(sub, "GET", `/achievements/growth/${id}`);
  afterAll(async () => {
    await admin.query("delete from account where subject = $1", [subE]);
  });

  it("US-ACH-05 without a token: 401; an unknown or foreign specimen: 404 specimen.not_found", async () => {
    expect((await growth(null)).status).toBe(401);
    const r = await growth(subE);
    expect(r.status).toBe(404);
    expect(r.body["error"].code).toBe("specimen.not_found");
    expect((await growth(subE, "nope")).status).toBe(404);
  });

  it("US-ACH-08 calm mode hides the growth moments, for that account only", async () => {
    await setCalm(subE, true);
    expect((await growth(subE)).body).toEqual({ calmMode: true });
    await setCalm(subE, false);
    expect((await growth(subE)).status).toBe(404);
  });
});

describe("US-ACH-06 anniversaries through the API", () => {
  const subF = `ach06-${randomUUID()}`;
  const list = (sub: string | null, zone = "Europe/Berlin") =>
    call(sub, "GET", `/achievements/anniversaries?timeZone=${encodeURIComponent(zone)}`);
  afterAll(async () => {
    await admin.query("delete from account where subject = $1", [subF]);
  });

  it("US-ACH-06 without a token: 401; without a valid time zone: 400", async () => {
    expect((await list(null)).status).toBe(401);
    const bad = await list(subF, "Mars/Base");
    expect(bad.status).toBe(400);
    expect(bad.body["error"].code).toBe("input.invalid");
  });

  it("US-ACH-06 a new account has no anniversary", async () => {
    expect((await list(subF)).body).toEqual({ calmMode: false, items: [] });
  });

  it("US-ACH-08 calm mode hides the anniversaries, for that account only", async () => {
    await setCalm(subF, true);
    expect((await list(subF)).body).toEqual({ calmMode: true });
    await setCalm(subF, false);
    expect((await list(subF)).body["calmMode"]).toBe(false);
  });
});

describe("US-ACH-04 care rhythm through the API", () => {
  const subG = `ach04-${randomUUID()}`;
  const rhythm = (sub: string | null, zone = "Europe/Berlin") =>
    call(sub, "GET", `/achievements/rhythm?timeZone=${encodeURIComponent(zone)}`);
  afterAll(async () => {
    await admin.query("delete from account where subject = $1", [subG]);
  });

  it("US-ACH-04 without a token: 401; without a valid time zone: 400", async () => {
    expect((await rhythm(null)).status).toBe(401);
    const bad = await rhythm(subG, "Mars/Base");
    expect(bad.status).toBe(400);
    expect(bad.body["error"].code).toBe("input.invalid");
  });

  it("US-ACH-04 a new account has no rhythm yet: twelve neutral weeks, nothing invented (P-08)", async () => {
    const r = await rhythm(subG);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      calmMode: false,
      currentRun: 0,
      longestRun: 0,
      openTasks: 0,
      hasTasks: false,
    });
    expect(r.body["weeks"]).toHaveLength(12);
  });

  it("US-ACH-04 an explicit pause is added, listed in the rhythm and removed; only own pauses count (P-04)", async () => {
    const other = `ach04b-${randomUUID()}`;
    const added = await call(subG, "POST", "/achievements/rhythm/pauses", {
      from: "2026-07-01",
      until: "2026-07-14",
    });
    expect(added.status).toBe(201);
    expect((await rhythm(subG)).body["pauses"]).toEqual([added.body]);
    expect((await rhythm(other)).body["pauses"]).toEqual([]);
    const foreign = await call(other, "DELETE", `/achievements/rhythm/pauses/${added.body["id"]}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body["error"].code).toBe("achievements.pause_not_found");
    const removed = await call(subG, "DELETE", `/achievements/rhythm/pauses/${added.body["id"]}`);
    expect(removed.status).toBe(200);
    expect((await rhythm(subG)).body["pauses"]).toEqual([]);
    await admin.query("delete from account where subject = $1", [other]);
  });

  it("US-ACH-04 a pause longer than 4 weeks: 422 achievements.pause_too_long; bad dates: 400; no token: 401", async () => {
    const long = await call(subG, "POST", "/achievements/rhythm/pauses", {
      from: "2026-07-01",
      until: "2026-08-01",
    });
    expect(long.status).toBe(422);
    expect(long.body["error"].code).toBe("achievements.pause_too_long");
    const bad = await call(subG, "POST", "/achievements/rhythm/pauses", { from: "x", until: "y" });
    expect(bad.status).toBe(400);
    expect((await call(null, "POST", "/achievements/rhythm/pauses", {})).status).toBe(401);
  });

  it("US-ACH-08 calm mode hides the care rhythm, for that account only", async () => {
    await setCalm(subG, true);
    expect((await rhythm(subG)).body).toEqual({ calmMode: true });
    await setCalm(subG, false);
    expect((await rhythm(subG)).body["calmMode"]).toBe(false);
  });
});

describe("US-ACH-07 year in review through the API", () => {
  const subF = `ach07-${randomUUID()}`;
  const year = (sub: string | null, query = "timeZone=Europe/Berlin") =>
    call(sub, "GET", `/achievements/year?${query}`);
  afterAll(async () => {
    await admin.query("delete from account where subject = $1", [subF]);
  });

  it("US-ACH-07 without a token: 401; a bad time zone or year: 400 input.invalid", async () => {
    expect((await year(null)).status).toBe(401);
    expect((await year(subF, "timeZone=Mars/Base")).status).toBe(400);
    const future = await year(subF, "timeZone=Europe/Berlin&year=9999");
    expect(future.status).toBe(400);
    expect(future.body["error"].code).toBe("input.invalid");
  });

  it("US-ACH-07 a new account gets an empty year with counts of zero, no rank and no rating", async () => {
    const r = await year(subF);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ calmMode: false, hasData: false, growth: null, photos: null });
    expect(Object.values(r.body["counts"]).every((n) => n === 0)).toBe(true);
  });

  it("US-ACH-08 calm mode hides the year in review", async () => {
    await setCalm(subF, true);
    expect((await year(subF)).body).toEqual({ calmMode: true });
    await setCalm(subF, false);
    expect((await year(subF)).body["calmMode"]).toBe(false);
  });
});
