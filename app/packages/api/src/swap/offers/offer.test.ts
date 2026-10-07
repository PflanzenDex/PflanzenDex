import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-SOZ-08: offers through the API (real PostgreSQL).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant setup and cleanup (QG-D1)
const [subA, subB, subOp] = [0, 1, 2].map(() => `soz8-${randomUUID()}`) as [string, string, string];
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid" && sub
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

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
  return { status: res.status, body: await res.json() };
}

const tz = "timeZone=Europe%2FBerlin";
let speciesId = "";
const specimen = async (sub: string, marker: string) =>
  (await call(sub, "POST", "/specimens", { timeZone: "Europe/Berlin", speciesId, marker })).body
    .id as string;
const share = (id: string) => call(subA, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
const offer = (extra: Record<string, unknown>) =>
  call(subA, "POST", "/offers", { type: "cutting", mode: "swap", ...extra });

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  for (const sub of [subA, subB, subOp]) await call(sub, "GET", "/account");
  await admin.query(
    "insert into account_role (account, role) select id, 'operator' from account where subject = $1",
    [subOp],
  );
  speciesId = (
    await call(subA, "POST", "/species", {
      latinName: `Offerus${randomUUID()
        .replace(/[0-9-]/g, "x")
        .slice(0, 8)} novus`,
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      source: "RHS",
    })
  ).body.id;
  // An approved species is visible to everyone, so another account can keep a specimen of it (US-BES-10).
  const entries = (await call(subOp, "GET", "/review")).body.entries as {
    species: { id: string } | null;
    reviewCase: { id: string };
  }[];
  const entry = entries.find((e) => e.species?.id === speciesId);
  await call(subOp, "POST", `/review/${entry?.reviewCase.id}/decide`, { status: "reviewed" });
});
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subOp]];
  await admin.query(`delete from offer where account_id in (${accounts})`, subs);
  await admin.query(`delete from specimen where account_id in (${accounts})`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in (${accounts}))`,
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await admin.end();
});

describe("US-SOZ-08 offers through the API", () => {
  it("US-SOZ-08 without a token: 401; bad input: 400 with the field; no Idempotency-Key: 400", async () => {
    expect((await call(null, "GET", `/offers?${tz}`)).status).toBe(401);
    expect((await call(null, "POST", "/offers", {})).status).toBe(401);
    expect((await call(subA, "GET", "/offers")).status).toBe(400);
    const id = await specimen(subA, "V0");
    expect(await offer({ specimenId: id, type: "tree" })).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid" } },
    });
    const res = await app.request("/offers", {
      method: "POST",
      headers: { authorization: `Bearer valid:${subA}`, "content-type": "application/json" },
      body: JSON.stringify({ specimenId: id, type: "cutting", mode: "swap" }),
    });
    expect(res.status).toBe(400);
  });

  it("US-SOZ-08 the preview says the specimen is not shared; an offer is refused until Share = friends", async () => {
    const id = await specimen(subA, "P1");
    const p = await call(subA, "GET", `/offers/preview?specimenId=${id}&${tz}`);
    expect(p.body).toMatchObject({
      shared: false,
      offered: false,
      health: { treatmentOpen: false, lastTreated: null },
    });
    expect(p.body.notice).toMatch(/CITES/);
    expect(await offer({ specimenId: id })).toMatchObject({
      status: 409,
      body: { error: { code: "offer.not_shared" } },
    });
    await share(id);
    expect((await call(subA, "GET", `/offers/preview?specimenId=${id}&${tz}`)).body.shared).toBe(
      true,
    );
    expect(
      await offer({ specimenId: id, mode: "give_away", wish: "Ableger", note: "Gut bewurzelt." }),
    ).toMatchObject({
      status: 201,
      body: { specimenId: id, type: "cutting", mode: "give_away", status: "open", wish: "Ableger" },
    });
    expect((await call(subA, "GET", `/offers/preview?specimenId=${id}&${tz}`)).body.offered).toBe(
      true,
    );
  });

  it("US-SOZ-08 one open offer per specimen; an open treatment needs explicit confirmation", async () => {
    const id = await specimen(subA, "T1");
    await share(id);
    await call(subA, "POST", "/treatments", {
      specimenIds: [id],
      reason: "Wollläuse",
      agent: "Spiritus",
      date: "2026-10-01",
    });
    expect(await offer({ specimenId: id })).toMatchObject({
      status: 409,
      body: { error: { code: "offer.treatment_open" } },
    });
    expect((await offer({ specimenId: id, confirmTreatment: true })).status).toBe(201);
    expect(await offer({ specimenId: id, confirmTreatment: true })).toMatchObject({
      status: 409,
      body: { error: { code: "offer.already_open" } },
    });
  });

  it("US-SOZ-08 the list shows health details without agent, keeps withdrawn offers and hides others' offers (P-04, P-10)", async () => {
    const list = (await call(subA, "GET", `/offers?${tz}`)).body.offers as {
      id: string;
      specimenName: string;
      status: string;
      health: { treatmentOpen: boolean };
    }[];
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((o) => o.health.treatmentOpen)).toBe(true);
    expect(JSON.stringify(list)).not.toContain("Spiritus");
    const target = list[0]?.id as string;
    expect((await call(subB, "POST", `/offers/${target}/withdraw`, {})).status).toBe(404);
    expect((await call(subB, "GET", `/offers?${tz}`)).body.offers).toEqual([]);
    expect(await call(subA, "POST", `/offers/${target}/withdraw`, {})).toMatchObject({
      status: 200,
      body: { status: "withdrawn" },
    });
    expect((await call(subA, "POST", `/offers/${target}/withdraw`, {})).status).toBe(200);
    expect(
      (await call(subA, "GET", `/offers?${tz}`)).body.offers.find(
        (o: { id: string }) => o.id === target,
      ).status,
    ).toBe("withdrawn");
    expect((await call(subA, "POST", `/offers/${randomUUID()}/withdraw`, {})).status).toBe(404);
  });

  it("US-SOZ-08 a foreign specimen is not found, for the offer and the preview (P-04)", async () => {
    const foreign = await specimen(subB, "F1");
    expect(await offer({ specimenId: foreign })).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
    expect((await call(subA, "GET", `/offers/preview?specimenId=${foreign}&${tz}`)).status).toBe(
      404,
    );
  });
});
