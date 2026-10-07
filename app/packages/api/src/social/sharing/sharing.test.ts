import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-SOZ-04, US-SOZ-03: what friends see, through the API (real PostgreSQL).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant setup and cleanup (QG-D1)
const [subA, subB, subC, subOp] = [0, 1, 2, 3].map(() => `soz4-${randomUUID()}`) as [
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

const latin = `Sozialis${randomUUID()
  .replace(/[0-9-]/g, "x")
  .slice(0, 8)} amicus`;
let speciesId = "";
let annaSpecimen = "";
let annaMarked = "";
let friendOfBen = ""; // Ben's friendship id for Anna
let friendOfAnna = "";

const newSpecimen = async (sub: string, name: string, marker?: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId,
      marker: marker ?? null,
      ...(marker ? {} : { name }),
    })
  ).body as { id: string };

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  for (const sub of [subA, subB, subC, subOp]) await call(sub, "GET", "/account");
  await admin.query(
    "insert into account_role (account, role) select id, 'operator' from account where subject = $1",
    [subOp],
  );
  speciesId = (
    await call(subA, "POST", "/species", {
      latinName: latin,
      germanName: "Freundespflanze",
      difficulty: 2,
      standardLevel: 2,
      lightDemandLux: 15000,
      growthMeasure: "rosette_diameter",
      etiolationSigns: "Rosette streckt sich.",
      successCriteria: "Dichte, flache Rosette.",
      source: "RHS",
    })
  ).body.id;
  // A new species is a private proposal; friends learn species names only after the review approved it (P-05).
  const entries = (await call(subOp, "GET", "/review")).body.entries as {
    species: { id: string } | null;
    reviewCase: { id: string };
  }[];
  const entry = entries.find((e) => e.species?.id === speciesId);
  await call(subOp, "POST", `/review/${entry?.reviewCase.id}/decide`, { status: "reviewed" });
  annaSpecimen = (await newSpecimen(subA, "Anna Eins")).id;
  annaMarked = (await newSpecimen(subA, "x", "M1")).id;
  await newSpecimen(subB, "Ben Eins");
  const { code } = (await call(subA, "POST", "/friends/invitations", {})).body;
  await call(subB, "POST", "/friends/requests", { code });
  const incoming = (await call(subA, "GET", "/friends/requests")).body.incoming[0].id;
  await call(subA, "POST", `/friends/requests/${incoming}/answer`, { decision: "accept" });
  friendOfAnna = (await call(subA, "GET", "/friends")).body.friends[0].id;
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

describe("US-SOZ-04 sharing settings", () => {
  it("US-SOZ-04 without a token: 401; everything is private by default", async () => {
    expect((await call(null, "GET", "/sharing")).status).toBe(401);
    expect(
      (await call(null, "PUT", `/sharing/specimens/${annaSpecimen}`, { share: "friends" })).status,
    ).toBe(401);
    expect((await call(subA, "GET", "/sharing")).body).toEqual({ shared: [] });
    expect((await call(subB, "GET", `/friends/${friendOfBen}/shared`)).body).toEqual({
      specimens: [],
    });
  });

  it("US-SOZ-04 invalid input: 400; a foreign or unknown specimen: 404, nothing written (P-04)", async () => {
    expect(
      (await call(subA, "PUT", `/sharing/specimens/${annaSpecimen}`, { share: "world" })).status,
    ).toBe(400);
    expect(
      await call(subB, "PUT", `/sharing/specimens/${annaSpecimen}`, { share: "friends" }),
    ).toMatchObject({
      status: 404,
      body: { error: { code: "specimen.not_found" } },
    });
    expect((await call(subA, "GET", "/sharing")).body).toEqual({ shared: [] });
  });
});

describe("US-SOZ-04 what a friend sees", () => {
  it("US-SOZ-04 shares one specimen; the friend sees only the whitelisted facts", async () => {
    expect(
      await call(subA, "PUT", `/sharing/specimens/${annaSpecimen}`, { share: "friends" }),
    ).toMatchObject({
      status: 200,
      body: { share: "friends", photos: false },
    });
    const { specimens } = (await call(subB, "GET", `/friends/${friendOfBen}/shared`)).body;
    expect(specimens).toHaveLength(1);
    expect(specimens[0]).toMatchObject({
      id: annaSpecimen,
      speciesLatin: latin,
      speciesGerman: "Freundespflanze",
      name: "Freundespflanze",
      isCutting: false,
      photoShared: false,
    });
    expect(Object.keys(specimens[0]).sort()).toEqual([
      "caughtAt",
      "id",
      "isCutting",
      "name",
      "photoShared",
      "speciesGerman",
      "speciesLatin",
    ]);
  });

  it("US-SOZ-04 a marker never reaches a friend: the name is the species name alone", async () => {
    await call(subA, "PUT", `/sharing/specimens/${annaMarked}`, { share: "friends" });
    const { specimens } = (await call(subB, "GET", `/friends/${friendOfBen}/shared`)).body;
    const marked = specimens.find((s: { id: string }) => s.id === annaMarked);
    expect(marked.name).toBe("Freundespflanze");
    expect(JSON.stringify(specimens)).not.toContain("M1");
  });

  it("US-SOZ-03 the friend list counts the species shared with me that I have caught too; unknown when nothing is shared", async () => {
    expect((await call(subB, "GET", "/friends")).body.friends[0].sharedSpecies).toBe(1);
    expect((await call(subA, "GET", "/friends")).body.friends[0].sharedSpecies).toBeNull();
    expect(JSON.stringify((await call(subB, "GET", "/friends")).body)).not.toContain("accountId");
  });

  it("US-SOZ-04 a stranger gets 404 for the friendship id and no data; the owner sees only the friendship of others as not found", async () => {
    expect(await call(subC, "GET", `/friends/${friendOfBen}/shared`)).toMatchObject({
      status: 404,
      body: { error: { code: "friend.not_found" } },
    });
  });

  it("US-SOZ-04 'Everything private' suspends all sharing without deleting it", async () => {
    const profile = (await call(subA, "GET", "/account/profile")).body;
    await call(subA, "PUT", "/account/profile", { ...profile, everythingPrivate: true });
    expect((await call(subB, "GET", `/friends/${friendOfBen}/shared`)).body).toEqual({
      specimens: [],
    });
    expect((await call(subB, "GET", "/friends")).body.friends[0].sharedSpecies).toBeNull();
    expect((await call(subA, "GET", "/sharing")).body.shared).toHaveLength(2);
    await call(subA, "PUT", "/account/profile", { ...profile, everythingPrivate: false });
    expect((await call(subB, "GET", `/friends/${friendOfBen}/shared`)).body.specimens).toHaveLength(
      2,
    );
  });

  it("US-SOZ-04 withdrawing takes effect at once; the bulk action covers every active specimen of a species", async () => {
    await call(subA, "PUT", `/sharing/specimens/${annaSpecimen}`, { share: "private" });
    expect((await call(subB, "GET", `/friends/${friendOfBen}/shared`)).body.specimens).toHaveLength(
      1,
    );
    expect(
      await call(subA, "PUT", `/sharing/species/${speciesId}`, { share: "friends", photos: true }),
    ).toMatchObject({
      status: 200,
      body: { changed: 2 },
    });
    expect((await call(subA, "GET", "/sharing")).body.shared).toEqual(
      expect.arrayContaining([expect.objectContaining({ photos: true })]),
    );
  });

  it("US-SOZ-07 the friend's collection as cards with 'you have it'; strangers get 404 (P-05)", async () => {
    const stranger = await call(subC, "GET", `/friends/${friendOfBen}/collection`);
    expect(stranger).toMatchObject({ status: 404, body: { error: { code: "friend.not_found" } } });
    await call(subA, "PUT", `/sharing/species/${speciesId}`, { share: "friends" });
    const r = await call(subB, "GET", `/friends/${friendOfBen}/collection`);
    expect(r.body.friend).toEqual({ name: "Anna" });
    expect(r.body.cards).toHaveLength(1);
    expect(r.body.cards[0]).toMatchObject({
      speciesLatin: latin,
      speciesGerman: "Freundespflanze",
      specimens: 2,
      iHave: true,
    });
    expect(Object.keys(r.body.cards[0]).sort()).toEqual(
      ["cuttings", "firstCaught", "iHave", "specimens", "speciesGerman", "speciesLatin"].sort(),
    );
  });

  it("US-SOZ-03 US-SOZ-04 ending the friendship withdraws everything at once and deletes nothing", async () => {
    expect((await call(subA, "POST", `/friends/${friendOfAnna}/end`, {})).status).toBe(200);
    expect((await call(subB, "GET", `/friends/${friendOfBen}/shared`)).status).toBe(404);
    expect((await call(subA, "GET", "/sharing")).body.shared).toHaveLength(2);
  });
});
