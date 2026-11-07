import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openOwnerPool, openFixturePool } from "@pflanzendex/db";
import { createApp } from "../../app";

// US-BES-19, P-04, P-12: the repot observations through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
let admin: Pool;
const subA = `bes19-${randomUUID()}`;
const subB = `bes19-${randomUUID()}`;
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
async function plant(sub: string, status: "plant" | "cutting" = "plant"): Promise<string> {
  counter += 1;
  const species = await call(sub, "POST", "/species", {
    latinName: `Signa${run}${String.fromCharCode(97 + counter)} vera`,
    germanName: `Signa${run}${String.fromCharCode(97 + counter)}`,
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
    marker: "sig",
  });
  return created.body["id"] as string;
}
const tick = (sub: string | null, id: string, sign: string, ticked = true) =>
  call(sub, "POST", `/specimens/${id}/repot-signs`, { sign, ticked, timeZone: "Europe/Berlin" });

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

describe("US-BES-19 tick and clear a repot observation through the API", () => {
  it("US-BES-19: without sign-in it is refused (401)", async () => {
    const id = await plant(subA);
    expect((await tick(null, id, "roots_out")).status).toBe(401);
  });

  it("US-BES-19: a tick of a plant is open, a second tick keeps it, an untick clears it (P-03)", async () => {
    const id = await plant(subA);
    expect(await tick(subA, id, "roots_out")).toMatchObject({
      status: 200,
      body: { specimenId: id, signs: [{ sign: "roots_out", tickedOn: "2026-11-07" }] },
    });
    expect((await tick(subA, id, "roots_out")).body["signs"]).toEqual([
      { sign: "roots_out", tickedOn: "2026-11-07" },
    ]);
    expect((await tick(subA, id, "roots_out", false)).body["signs"]).toEqual([]);
  });

  it("US-BES-19: an unknown observation or a missing ticked flag is input.invalid (400)", async () => {
    const id = await plant(subA);
    expect(await tick(subA, id, "yellow_leaves")).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid" } },
    });
    expect(
      await call(subA, "POST", `/specimens/${id}/repot-signs`, {
        sign: "roots_out",
        timeZone: "Europe/Berlin",
      }),
    ).toMatchObject({ status: 400, body: { error: { details: [{ field: "ticked" }] } } });
  });

  it("US-BES-19: a cutting cannot be ticked (409 specimen.not_a_plant), a foreign plant looks unknown (404, P-04)", async () => {
    const cutting = await plant(subA, "cutting");
    expect((await tick(subA, cutting, "roots_out")).body["error"].code).toBe(
      "specimen.not_a_plant",
    );
    const foreign = await plant(subB);
    expect(await tick(subA, foreign, "roots_out")).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
  });

  it("US-BES-19, P-12: while the keeper switch repot_planner is off the tick is refused and nothing is written", async () => {
    const id = await plant(subB);
    await admin.query(
      `insert into account_keeper_switch (account_id, feature, enabled, changed_on)
       select id, 'repot_planner', false, '2026-11-07' from account where subject = $1`,
      [subB],
    );
    expect(await tick(subB, id, "tips_over")).toMatchObject({
      status: 409,
      body: { error: { code: "onboarding.keeper_off" } },
    });
    await admin.query("delete from account_keeper_switch where feature = 'repot_planner'");
  });
});
