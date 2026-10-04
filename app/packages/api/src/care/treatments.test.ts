import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BEH-01: plan treatments and see them on the specimen cards through the API (real PostgreSQL, `make db-up`).
let pool: Pool;
const run = randomUUID()
  .replace(/[0-9]/g, (z) => "ghijklmnop"[Number(z)] ?? "x")
  .replace(/-/g, "")
  .slice(0, 10);
const subA = `beh1-${randomUUID()}`;
const subB = `beh1-${randomUUID()}`;
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid"
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
// 2026-10-02 23:30 UTC: already October 3rd in Berlin (NFR-08).
const NOW = new Date("2026-10-02T23:30:00Z");
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
  if (key) headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method: method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// A proposed species is visible to its author only (P-05), so each account proposes its own.
const species: Record<string, string> = {};
let counter = 0;
const newSpecimen = async (sub: string, status?: "cutting"): Promise<string> => {
  const e = await call(sub, "POST", "/specimens", {
    speciesId: species[sub],
    marker: `m${++counter}`,
    ...(status ? { status } : {}),
    timeZone: "Europe/Berlin",
  });
  return e.body["id"] as string;
};
const plan = (sub: string, input: Record<string, unknown>, key?: string | null) =>
  call(sub, "POST", "/treatments", { reason: "Wollläuse", date: "2026-10-10", ...input }, key);
const cards = async (sub: string) =>
  (await call(sub, "GET", "/specimens/cards?timeZone=Europe/Berlin")).body["cards"] as {
    id: string;
    treatment: { reason: string; dueDate: { text: string } } | null;
    moreTreatments: number;
  }[];

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => NOW });
  for (const sub of [subA, subB]) {
    const s = await call(sub, "POST", "/species", {
      latinName: `Behandlung${run}${sub === subA ? "a" : "b"} test`,
      germanName: `Behandlung ${run} ${sub === subA ? "a" : "b"}`,
      difficulty: 2,
      standardLevel: 3,
      lightDemandLux: 40000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
    });
    species[sub] = s.body["id"] as string;
  }
});
afterAll(async () => {
  await pool.query(
    "delete from specimen where account_id in (select id from account where subject = any($1))",
    [[subA, subB]],
  );
  await pool.query(
    `delete from species where id in (select object_id from review_case
       where account_id in (select id from account where subject = any($1)))`,
    [[subA, subB]],
  );
  await pool.query("delete from account where subject = any($1)", [[subA, subB]]);
  await pool.end();
});

describe("US-BEH-01 sign-in and input", () => {
  it("POST /treatments without token: 401", async () => {
    expect((await call(null, "POST", "/treatments", {})).status).toBe(401);
  });

  it("without Idempotency-Key: 400 with a stable error code, nothing written", async () => {
    const e = await newSpecimen(subA);
    const r = await plan(subA, { specimenIds: [e] }, null);
    expect(r).toMatchObject({ status: 400, body: { error: { code: "idempotency.key_missing" } } });
    expect((await cards(subA)).find((c) => c.id === e)?.treatment).toBeNull();
  });

  it.each([
    ["no reason", { reason: " " }, "reason"],
    ["no date", { date: undefined }, "date"],
    ["wrong date", { date: "2026-02-30" }, "date"],
    ["no specimen", { specimenIds: [] }, "specimenIds"],
    ["course too long", { count: 99 }, "count"],
  ])("invalid input (%s): 400 with field, nothing written", async (_, input, field) => {
    const e = await newSpecimen(subA);
    const r = await plan(subA, { specimenIds: [e], ...input });
    expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    expect(r.body["error"].details.map((d: { field: string }) => d.field)).toEqual([field]);
    expect((await cards(subA)).find((c) => c.id === e)?.treatment).toBeNull();
  });
});

describe("US-BEH-01 planning", () => {
  it("US-BEH-04 a single treatment: 201, and the card shows reason and due date (US-BES-06)", async () => {
    const e = await newSpecimen(subA);
    const r = await plan(subA, { specimenIds: [e], date: "2026-10-01", agent: "Neemöl" });
    expect(r.status).toBe(201);
    expect(r.body["treatments"]).toMatchObject([
      { specimenId: e, reason: "Wollläuse", agent: "Neemöl", dueAt: "2026-10-01", courseId: null },
    ]);
    expect((await cards(subA)).find((c) => c.id === e)).toMatchObject({
      treatment: { reason: "Wollläuse", dueDate: { text: "überfällig seit 2 Tg." } },
      moreTreatments: 0,
    });
  });

  it("US-BEH-04 a course: 3 dates at 7 days by default of the client, the card names the next one and '+2 more'", async () => {
    const e = await newSpecimen(subA);
    const r = await plan(subA, { specimenIds: [e], date: "2026-10-03", count: 3, intervalDays: 7 });
    expect(r.status).toBe(201);
    expect(r.body["treatments"].map((t: { dueAt: string }) => t.dueAt)).toEqual([
      "2026-10-03",
      "2026-10-10",
      "2026-10-17",
    ]);
    expect(new Set(r.body["treatments"].map((t: { courseId: string }) => t.courseId)).size).toBe(1);
    expect((await cards(subA)).find((c) => c.id === e)).toMatchObject({
      treatment: { dueDate: { text: "heute fällig" } },
      moreTreatments: 2,
    });
  });

  it("several specimens including a cutting get one treatment each (FR-BEH-04)", async () => {
    const [a, b] = [await newSpecimen(subA), await newSpecimen(subA, "cutting")];
    const r = await plan(subA, { specimenIds: [a, b] });
    expect(r.status).toBe(201);
    expect(r.body["treatments"]).toHaveLength(2);
    for (const c of (await cards(subA)).filter((c) => [a, b].includes(c.id)))
      expect(c.treatment?.reason).toBe("Wollläuse");
  });

  it("the same Idempotency-Key writes once", async () => {
    const e = await newSpecimen(subA);
    const key = randomUUID();
    const first = await plan(subA, { specimenIds: [e], count: 2, intervalDays: 3 }, key);
    const again = await plan(subA, { specimenIds: [e], count: 2, intervalDays: 3 }, key);
    expect(again.body).toEqual(first.body);
    expect((await cards(subA)).find((c) => c.id === e)?.moreTreatments).toBe(1);
  });
});

describe("US-BEH-01 tenant isolation (P-04)", () => {
  it("a foreign specimen looks like an unknown one: 404, nothing written for either account", async () => {
    const mine = await newSpecimen(subA);
    const foreign = await newSpecimen(subB);
    const r = await plan(subA, { specimenIds: [mine, foreign] });
    expect(r).toMatchObject({ status: 404, body: { error: { code: "specimen.not_found" } } });
    expect((await cards(subA)).find((c) => c.id === mine)?.treatment).toBeNull();
    expect((await cards(subB)).find((c) => c.id === foreign)?.treatment).toBeNull();
  });

  it("a treatment of Anna never appears on Ben's cards", async () => {
    const e = await newSpecimen(subA);
    await plan(subA, { specimenIds: [e] });
    expect((await cards(subB)).some((c) => c.id === e)).toBe(false);
  });

  it("an archived specimen cannot be treated: 409 specimen.archived", async () => {
    const e = await newSpecimen(subA);
    await call(subA, "POST", `/specimens/${e}/archive`, {
      reason: "eingegangen",
      timeZone: "Europe/Berlin",
    });
    const r = await plan(subA, { specimenIds: [e] });
    expect(r.body["error"]["code"]).toBe("specimen.archived");
    expect(r.status).toBe(409);
  });
});

type ListedTreatment = {
  id: string;
  specimenId: string;
  specimenName: string;
  reason: string;
  agent: string | null;
  dueAt: string;
  status: { kind: string; text: string };
};
const open = async (sub: string | null, zone = "Europe/Berlin") =>
  call(sub, "GET", `/treatments?timeZone=${encodeURIComponent(zone)}`);
const listed = async (sub: string): Promise<ListedTreatment[]> =>
  (await open(sub)).body["treatments"] as ListedTreatment[];

describe("US-BEH-02 open treatments", () => {
  it("US-BEH-02 GET /treatments without token: 401", async () => {
    expect((await open(null)).status).toBe(401);
  });

  it("US-BEH-02 an unknown time zone: 400 input.invalid", async () => {
    const r = await open(subA, "Mars/Base");
    expect(r.status).toBe(400);
    expect(r.body["error"]["code"]).toBe("input.invalid");
  });

  it("US-BEH-02 lists the own open treatments ascending by date with status, agent or null", async () => {
    const e = await newSpecimen(subA);
    await plan(subA, { specimenIds: [e], reason: "Spät", date: "2026-10-20", agent: "Neemöl" });
    await plan(subA, { specimenIds: [e], reason: "Früh", date: "2026-10-01" });
    await plan(subA, { specimenIds: [e], reason: "Heute", date: "2026-10-03" });
    const mine = (await listed(subA)).filter((t) => t.specimenId === e);
    expect(mine.map((t) => [t.reason, t.agent, t.dueAt, t.status.text])).toEqual([
      ["Früh", null, "2026-10-01", "überfällig seit 2 Tagen"],
      ["Heute", null, "2026-10-03", "heute fällig"],
      ["Spät", "Neemöl", "2026-10-20", "20.10.2026"],
    ]);
    const all = (await listed(subA)).map((t) => t.dueAt);
    expect(all).toEqual([...all].sort());
  });

  it("US-BEH-02 Anna's treatments never appear for Ben, and the other way round (two accounts, P-04)", async () => {
    const a = await newSpecimen(subA);
    const b = await newSpecimen(subB);
    await plan(subA, { specimenIds: [a], reason: "Nur Anna" });
    await plan(subB, { specimenIds: [b], reason: "Nur Ben" });
    expect((await listed(subB)).map((t) => t.reason)).not.toContain("Nur Anna");
    expect((await listed(subB)).map((t) => t.reason)).toContain("Nur Ben");
    expect((await listed(subA)).map((t) => t.reason)).not.toContain("Nur Ben");
  });

  it("US-BEH-02 an archived specimen has no open treatments in the list", async () => {
    const e = await newSpecimen(subA);
    await plan(subA, { specimenIds: [e], reason: "Archiviert danach" });
    await call(subA, "POST", `/specimens/${e}/archive`, {
      reason: "eingegangen",
      timeZone: "Europe/Berlin",
    });
    expect((await listed(subA)).some((t) => t.specimenId === e)).toBe(false);
  });

  it("US-BEH-02 an account without specimens gets an empty list", async () => {
    const fresh = `beh2-${randomUUID()}`;
    const r = await open(fresh);
    expect(r.status).toBe(200);
    expect(r.body["treatments"]).toEqual([]);
    await pool.query("delete from account where subject = $1", [fresh]);
  });
});

const complete = (
  sub: string | null,
  id: string,
  body: unknown = { timeZone: "Europe/Berlin" },
  key?: string | null,
) => call(sub, "POST", `/treatments/${id}/complete`, body, key);
const planned = async (sub: string, specimenId: string, extra: Record<string, unknown> = {}) =>
  (await plan(sub, { specimenIds: [specimenId], ...extra })).body["treatments"] as { id: string }[];
const history = (sub: string | null, specimenId: string) =>
  call(sub, "GET", `/treatments/history?specimenId=${specimenId}`);

describe("US-BEH-03 tick off a date", () => {
  it("POST /treatments/:id/complete without token: 401", async () => {
    expect((await complete(null, randomUUID())).status).toBe(401);
  });

  it("US-BEH-03 without Idempotency-Key: 400, and the treatment stays open", async () => {
    const e = await newSpecimen(subA);
    const [t] = await planned(subA, e);
    const r = await complete(subA, (t as { id: string }).id, undefined, null);
    expect(r).toMatchObject({ status: 400, body: { error: { code: "idempotency.key_missing" } } });
    expect((await listed(subA)).some((x) => x.id === (t as { id: string }).id)).toBe(true);
  });

  it("US-BEH-03 ticks off with the local date (23:30 UTC is already the 3rd in Berlin, still the 2nd in Los Angeles, NFR-08)", async () => {
    const e = await newSpecimen(subA);
    const [berlin, la] = await planned(subA, e, { count: 2, intervalDays: 1, date: "2026-10-01" });
    const a = await complete(subA, (berlin as { id: string }).id);
    const b = await complete(subA, (la as { id: string }).id, { timeZone: "America/Los_Angeles" });
    expect(a).toMatchObject({
      status: 200,
      body: { treatment: { done: true, doneAt: "2026-10-03" } },
    });
    expect(b.body["treatment"]).toMatchObject({ done: true, doneAt: "2026-10-02" });
  });

  it("US-BEH-03 the row leaves the open list and the card names the next date (US-BES-06)", async () => {
    const e = await newSpecimen(subA);
    const [first, second] = await planned(subA, e, {
      count: 2,
      intervalDays: 7,
      date: "2026-10-01",
    });
    expect((await cards(subA)).find((c) => c.id === e)?.moreTreatments).toBe(1);
    await complete(subA, (first as { id: string }).id);
    expect((await listed(subA)).filter((t) => t.specimenId === e).map((t) => t.id)).toEqual([
      (second as { id: string }).id,
    ]);
    expect((await cards(subA)).find((c) => c.id === e)).toMatchObject({
      treatment: { dueDate: { text: "in 5 Tagen" } },
      moreTreatments: 0,
    });
    await complete(subA, (second as { id: string }).id);
    expect((await cards(subA)).find((c) => c.id === e)?.treatment).toBeNull();
  });

  it("US-BEH-03 a second tap (second device, new key) changes nothing: 200, same done date", async () => {
    const e = await newSpecimen(subA);
    const [t] = await planned(subA, e);
    const id = (t as { id: string }).id;
    const first = await complete(subA, id);
    const again = await complete(subA, id, { timeZone: "Pacific/Kiritimati" });
    expect(again).toMatchObject({ status: 200 });
    expect(again.body["treatment"]).toEqual(first.body["treatment"]);
  });

  it.each([
    ["no time zone", {}],
    ["unknown time zone", { timeZone: "Mars/Base" }],
  ])("US-BEH-03 invalid input (%s): 400 and nothing written", async (_, body) => {
    const e = await newSpecimen(subA);
    const [t] = await planned(subA, e);
    const r = await complete(subA, (t as { id: string }).id, body);
    expect(r).toMatchObject({ status: 400, body: { error: { code: "input.invalid" } } });
    expect((await listed(subA)).some((x) => x.id === (t as { id: string }).id)).toBe(true);
  });

  it("US-BEH-03 an id that is not an id: 400; an unknown one: 404 treatment.not_found", async () => {
    expect((await complete(subA, "3")).status).toBe(400);
    expect(await complete(subA, randomUUID())).toMatchObject({
      status: 404,
      body: { error: { code: "treatment.not_found" } },
    });
  });

  it("US-BEH-03 tenant: Ben cannot tick off Anna's treatment, it looks unknown and stays open (P-04)", async () => {
    const e = await newSpecimen(subA);
    const [t] = await planned(subA, e);
    const id = (t as { id: string }).id;
    expect(await complete(subB, id)).toMatchObject({
      status: 404,
      body: { error: { code: "treatment.not_found" } },
    });
    expect((await listed(subA)).some((x) => x.id === id)).toBe(true);
  });

  it("US-BEH-03 a treatment of an archived specimen is refused: 409 specimen.archived", async () => {
    const e = await newSpecimen(subA);
    const [t] = await planned(subA, e);
    await call(subA, "POST", `/specimens/${e}/archive`, {
      reason: "eingegangen",
      timeZone: "Europe/Berlin",
    });
    const r = await complete(subA, (t as { id: string }).id);
    expect(r).toMatchObject({ status: 409, body: { error: { code: "specimen.archived" } } });
  });
});

describe("US-BEH-03 history per specimen", () => {
  it("GET /treatments/history without token: 401", async () => {
    expect((await history(null, randomUUID())).status).toBe(401);
  });

  it("US-BEH-03 done entries stay as history of the specimen, open ones are not in it", async () => {
    const e = await newSpecimen(subA);
    const [a, b] = await planned(subA, e, { count: 2, intervalDays: 7, date: "2026-10-01" });
    await complete(subA, (a as { id: string }).id);
    const r = await history(subA, e);
    expect(r.status).toBe(200);
    expect(r.body["treatments"]).toMatchObject([
      { id: (a as { id: string }).id, done: true, doneAt: "2026-10-03" },
    ]);
    expect(JSON.stringify(r.body)).not.toContain((b as { id: string }).id);
  });

  it("US-BEH-03 tenant: Ben asking for Anna's specimen gets 404 specimen.not_found (P-04)", async () => {
    const e = await newSpecimen(subA);
    const [t] = await planned(subA, e);
    await complete(subA, (t as { id: string }).id);
    expect(await history(subB, e)).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
  });

  it("US-BEH-03 no or invalid specimenId: 400", async () => {
    expect((await call(subA, "GET", "/treatments/history")).status).toBe(400);
    expect((await history(subA, "x")).status).toBe(400);
  });
});
