import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-SOZ-05: "Neu bei Freunden" through the API (real PostgreSQL).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant setup and cleanup (QG-D1)
const [subA, subB, subC, subOp] = [0, 1, 2, 3].map(() => `soz5-${randomUUID()}`) as [
  string,
  string,
  string,
  string,
];
const NAMES: Record<string, string> = {
  [subA]: "Anna",
  [subB]: "Ben",
  [subC]: "Cleo",
  [subOp]: "Op",
};
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid" && sub
    ? { sub, email: `${sub}@example.test`, name: NAMES[sub] ?? "Test", email_verified: true }
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

const latin = `Feedus${randomUUID()
  .replace(/[0-9-]/g, "x")
  .slice(0, 8)} novus`;
const feed = (sub: string | null, query = "timeZone=Europe%2FBerlin") =>
  call(sub, "GET", `/feed?${query}`);
let friendOfBen = "";
let speciesId = "";
const specimen = async (sub: string, catchDate: string, marker: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      marker,
      catchDate,
    })
  ).body.id as string;

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool, clock: () => new Date("2026-10-06T10:00:00Z") });
  for (const sub of [subA, subB, subC, subOp]) await call(sub, "GET", "/account");
  await admin.query(
    "insert into account_role (account, role) select id, 'operator' from account where subject = $1",
    [subOp],
  );
  speciesId = (
    await call(subA, "POST", "/species", {
      latinName: latin,
      germanName: "Neuigkeitspflanze",
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      source: "RHS",
    })
  ).body.id;
  const entries = (await call(subOp, "GET", "/review")).body.entries as {
    species: { id: string } | null;
    reviewCase: { id: string };
  }[];
  const entry = entries.find((e) => e.species?.id === speciesId);
  await call(subOp, "POST", `/review/${entry?.reviewCase.id}/decide`, { status: "reviewed" });
  const { code } = (await call(subA, "POST", "/friends/invitations", {})).body;
  await call(subB, "POST", "/friends/requests", { code });
  const incoming = (await call(subA, "GET", "/friends/requests")).body.incoming[0].id;
  await call(subA, "POST", `/friends/requests/${incoming}/answer`, { decision: "accept" });
  friendOfBen = (await call(subB, "GET", "/friends")).body.friends[0].id;
});
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subC, subOp]];
  await admin.query(`delete from specimen where account_id in (${accounts})`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in (${accounts}))`,
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await admin.end();
});

describe("US-SOZ-05 feed through the API", () => {
  it("US-SOZ-05 without a token: 401; bad parameters: 400 naming the field", async () => {
    expect((await feed(null)).status).toBe(401);
    expect(await feed(subB, "")).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid", details: [{ field: "timeZone" }] } },
    });
    expect((await feed(subB, "timeZone=Europe%2FBerlin&days=0")).status).toBe(400);
    expect((await feed(subB, "timeZone=Europe%2FBerlin&friend=nope")).status).toBe(400);
  });

  it("US-SOZ-05 nothing shared yet: an empty feed that says what to do next (P-09)", async () => {
    const r = await feed(subB);
    expect(r.body.events).toEqual([]);
    expect(r.body.hint.text).toMatch(/noch nichts freigegeben/);
  });

  it("US-SOZ-05 shows what the friend shares, newest first, with the first specimen as new species", async () => {
    const [recent, older, ancient] = [
      await specimen(subA, "2026-10-04", "R1"),
      await specimen(subA, "2026-09-20", "R0"),
      await specimen(subA, "2026-03-01", "R-1"),
    ];
    await specimen(subA, "2026-10-05", "PRIVATE");
    for (const id of [recent, older, ancient])
      await call(subA, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
    const { events } = (await feed(subB)).body;
    expect(events.map((e: { date: string; type: string }) => [e.date, e.type])).toEqual([
      ["2026-10-04", "new_specimen"],
      ["2026-09-20", "new_specimen"],
    ]);
    expect(events[0]).toMatchObject({
      friendId: friendOfBen,
      friendName: "Anna",
      speciesLatin: latin,
      speciesGerman: "Neuigkeitspflanze",
      count: 1,
    });
    expect(JSON.stringify(events)).not.toMatch(/R1|PRIVATE|accountId/);
  });

  it("US-SOZ-05 filters: only new species, period, friend", async () => {
    expect((await feed(subB, "timeZone=Europe%2FBerlin&onlyNewSpecies=true")).body.events).toEqual(
      [],
    );
    const only = (await feed(subB, "timeZone=Europe%2FBerlin&onlyNewSpecies=true&days=365")).body
      .events;
    expect(only.map((e: { type: string; date: string }) => [e.type, e.date])).toEqual([
      ["new_species", "2026-03-01"],
    ]);
    expect((await feed(subB, "timeZone=Europe%2FBerlin&days=2")).body.events).toEqual([]);
    expect((await feed(subB, "timeZone=Europe%2FBerlin&days=400")).status).toBe(400);
    expect(
      (await feed(subB, `timeZone=Europe%2FBerlin&days=265&friend=${friendOfBen}`)).body.events,
    ).toHaveLength(3);
    expect(
      (await feed(subB, `timeZone=Europe%2FBerlin&friend=${randomUUID()}`)).body.events,
    ).toEqual([]);
  });

  it("US-SOZ-05 the viewer who is no friend sees nothing; the owner has no friends yet in the feed of a stranger (P-05)", async () => {
    const r = await feed(subC);
    expect(r.body.events).toEqual([]);
    expect(r.body.hint.text).toMatch(/noch keine Freunde/);
  });

  it("US-SOZ-05 'Everything private' empties the feed of the friend, ending the friendship too", async () => {
    const profile = (await call(subA, "GET", "/account/profile")).body;
    await call(subA, "PUT", "/account/profile", { ...profile, everythingPrivate: true });
    expect((await feed(subB)).body.events).toEqual([]);
    await call(subA, "PUT", "/account/profile", { ...profile, everythingPrivate: false });
    expect((await feed(subB)).body.events).toHaveLength(2);
    const friendOfAnna = (await call(subA, "GET", "/friends")).body.friends[0].id;
    await call(subA, "POST", `/friends/${friendOfAnna}/end`, {});
    expect((await feed(subB)).body.events).toEqual([]);
  });
});
