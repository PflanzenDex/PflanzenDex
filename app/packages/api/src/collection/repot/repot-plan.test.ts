import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp } from "../../app";

// US-BES-19, DM-EQU-06, P-04, P-08, P-12: the repot plan, the pot placement and the repot with a pot through the API.
let pool: Pool;
let admin: Pool;
const subA = `bes19p-${randomUUID()}`;
const subB = `bes19p-${randomUUID()}`;
const NOW = new Date("2026-11-07T10:00:00Z");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Response = { status: number; body: Record<string, any> };
let app: ReturnType<typeof createApp>;

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
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

const reviewer = async (token: string) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub: sub as string, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};

// Names take letters only (the species name rule): digits of the random run become letters.
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
let counter = 0;
const letter = () => String.fromCharCode(97 + counter);

async function plant(
  sub: string,
  status: "plant" | "cutting" = "plant",
  caughtAt = "2026-09-01",
): Promise<string> {
  counter += 1;
  const species = await call(sub, "POST", "/species", {
    latinName: `Plan${run}${letter()} vera`,
    germanName: `Plan${run}${letter()}`,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette streckt sich.",
    successCriteria: "Dichte, flache Rosette.",
  });
  const created = await call(sub, "POST", "/specimens", {
    speciesId: species.body["id"],
    timeZone: "Europe/Berlin",
    status,
    marker: "plan",
    catchDate: caughtAt,
  });
  return created.body["id"] as string;
}

async function pot(sub: string, name: string, diameterCm: number | null): Promise<string> {
  const r = await call(sub, "POST", "/equipment", {
    type: "Pot",
    name,
    diameterCm,
    material: "Ton",
  });
  return r.body["equipment"]["id"] as string;
}

const place = (sub: string | null, id: string, potId: string | null) =>
  call(sub, "POST", `/specimens/${id}/pot`, { potId, timeZone: "Europe/Berlin" });
const repotWithPot = (sub: string, id: string, potId: string | null, date?: string) =>
  call(sub, "POST", `/specimens/${id}/repot`, {
    timeZone: "Europe/Berlin",
    potId,
    ...(date ? { date } : {}),
  });
const plan = (sub: string, id: string) =>
  call(sub, "GET", `/specimens/${id}/repot-plan?timeZone=Europe/Berlin`);

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
});
afterAll(async () => {
  await admin.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await admin.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [[subA, subB]],
  );
  await admin.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
  await admin.end();
});

describe("US-BES-19 the pot placement through the API (DM-EQU-06)", () => {
  it("US-BES-19: without sign-in it is refused (401); a plant goes into its own pot (200), a taken pot is 409, a foreign pot is 404", async () => {
    const p = await pot(subA, "Topf A", 12);
    const first = await plant(subA);
    const second = await plant(subA);
    expect((await place(null, first, p)).status).toBe(401);
    expect(await place(subA, first, p)).toMatchObject({
      status: 200,
      body: { potId: p, placedOn: "2026-11-07", changed: true },
    });
    expect(await place(subA, second, p)).toMatchObject({
      status: 409,
      body: { error: { code: "equipment.pot_taken" } },
    });
    const foreign = await pot(subB, "Fremd", 12);
    expect(await place(subA, second, foreign)).toMatchObject({
      status: 404,
      body: { error: { code: "equipment.pot_not_found" } },
    });
  });

  it("US-BES-19: a cutting cannot be placed (409 equipment.not_a_plant); taking a plant out is allowed", async () => {
    const p = await pot(subA, "Topf B", 14);
    const cutting = await plant(subA, "cutting");
    expect(await place(subA, cutting, p)).toMatchObject({
      status: 409,
      body: { error: { code: "equipment.not_a_plant" } },
    });
    const placed = await plant(subA);
    await place(subA, placed, p);
    expect(await place(subA, placed, null)).toMatchObject({
      status: 200,
      body: { potId: null, changed: true },
    });
  });
});

describe("US-BES-19 the repot with a pot through the API (one unit of work)", () => {
  it("US-BES-19: a cutting is potted out into its pot on the same day; the plan shows that pot as the current one", async () => {
    const p = await pot(subA, "Topf C", 10);
    const cutting = await plant(subA, "cutting");
    const r = await repotWithPot(subA, cutting, p, "2026-11-05");
    expect(r).toMatchObject({
      status: 200,
      body: { id: cutting, status: "plant", repottedAt: "2026-11-05", pot: { potId: p } },
    });
    const planned = await plan(subA, cutting);
    expect(planned.body["currentPot"]).toMatchObject({ id: p, name: "Topf C", diameterCm: 10 });
    expect(planned.body["lastRepot"]).toBe("2026-11-05");
  });

  it("US-BES-19: a taken pot refuses the repot: 409, the cutting stays a cutting, nothing is recorded", async () => {
    const p = await pot(subA, "Topf D", 10);
    await place(subA, await plant(subA), p);
    const cutting = await plant(subA, "cutting");
    expect(await repotWithPot(subA, cutting, p)).toMatchObject({
      status: 409,
      body: { error: { code: "equipment.pot_taken" } },
    });
    expect((await call(subA, "GET", `/specimens/${cutting}`)).body["status"]).toBe("cutting");
  });

  it("US-BES-19: a plant without a time zone cannot name a pot (400 on timeZone)", async () => {
    const p = await pot(subA, "Topf E", 10);
    const planted = await plant(subA);
    expect(await call(subA, "POST", `/specimens/${planted}/repot`, { potId: p })).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid", details: [{ field: "timeZone" }] } },
    });
  });
});

describe("US-BES-19 the repot plan through the API (FR-BES-27, P-08)", () => {
  it("US-BES-19: the plan needs a time zone (400) and a plant of the account (404 for a foreign one, P-04)", async () => {
    const mine = await plant(subA);
    expect((await call(subA, "GET", `/specimens/${mine}/repot-plan`)).status).toBe(400);
    const foreign = await plant(subB);
    expect(await plan(subA, foreign)).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
  });

  it("US-BES-19: a repot from 24 months ago gives the time hint with the general starting value; the phase is unknown without a dormancy period, so the advice says so", async () => {
    const id = await plant(subB, "plant", "2024-01-01");
    await call(subB, "POST", `/specimens/${id}/repot`, {
      timeZone: "Europe/Berlin",
      date: "2024-10-01",
    });
    const planned = await plan(subB, id);
    expect(planned.body["hints"]).toEqual([
      { reason: "interval", monthsAgo: 25, source: "general_starting_value" },
    ]);
    expect(planned.body["seasonAdvice"]).toBe("phase_unknown");
  });

  it("US-BES-19: an open observation is a hint with its reason, and the free pots are listed with the current pot first in order", async () => {
    const owner = `bes19p-${randomUUID()}`;
    await call(owner, "GET", "/specimens");
    const id = await plant(owner);
    await call(owner, "POST", `/specimens/${id}/repot-signs`, {
      sign: "tips_over",
      ticked: true,
      timeZone: "Europe/Berlin",
    });
    const current = await pot(owner, "Aktuell", 12);
    await place(owner, id, current);
    await pot(owner, "Groß", 16);
    await pot(owner, "Klein", 8);
    const planned = await plan(owner, id);
    expect(planned.body["hints"]).toEqual([
      { reason: "tips_over", tickedOn: "2026-11-07", source: "keeper_observation" },
    ]);
    expect(planned.body["freePots"].map((p: { name: string }) => p.name)).toEqual([
      "Groß",
      "Klein",
    ]);
    await admin.query("delete from account where subject = $1", [owner]);
  });

  it("US-BES-19, P-12: while the keeper switch repot_planner is off the plan hides the hints, the observations and the pots", async () => {
    const owner = `bes19p-${randomUUID()}`;
    await call(owner, "GET", "/specimens");
    const id = await plant(owner);
    await call(owner, "POST", `/specimens/${id}/repot-signs`, {
      sign: "roots_out",
      ticked: true,
      timeZone: "Europe/Berlin",
    });
    await pot(owner, "Verborgen", 12);
    await admin.query(
      `insert into account_keeper_switch (account_id, feature, enabled, changed_on)
       select id, 'repot_planner', false, '2026-11-07' from account where subject = $1`,
      [owner],
    );
    const hidden = await plan(owner, id);
    expect(hidden.body).toMatchObject({ hidden: true, hints: [], freePots: [] });
    await admin.query("delete from account where subject = $1", [owner]);
  });

  it("US-BES-19, P-12: while the keeper switch equipment is off no pot is listed, and a pot cannot be named", async () => {
    const owner = `bes19p-${randomUUID()}`;
    await call(owner, "GET", "/specimens");
    const id = await plant(owner);
    const p = await pot(owner, "Unsichtbar", 12);
    await admin.query(
      `insert into account_keeper_switch (account_id, feature, enabled, changed_on)
       select id, 'equipment', false, '2026-11-07' from account where subject = $1`,
      [owner],
    );
    expect((await plan(owner, id)).body).toMatchObject({ equipmentOff: true, freePots: [] });
    expect(await place(owner, id, p)).toMatchObject({
      status: 409,
      body: { error: { code: "onboarding.keeper_off" } },
    });
    await admin.query("delete from account where subject = $1", [owner]);
  });
});
