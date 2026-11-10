import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, holdTaxonLock } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-BES-18, US-QG-05 QG-D2, P-05: the private notes of a specimen leave the account nowhere. A friend sees the
// specimen in every friend output (shared list, collection, feed, banner, swap offers), and none of them carries the
// notes. The check is by text and by key, so a note added to any output later fails here (real PostgreSQL).
const SECRET = "Geheime Notiz nur für Anna 4711";
const TZ = "timeZone=Europe/Berlin";

let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant setup and cleanup (QG-D1)
// Approves the species: holds the taxon lock so a parallel taxonomy build sees a stable catalog (#646).
let releaseTaxa: (() => Promise<void>) | undefined;
const [subA, subB, subOp] = [0, 1, 2].map(() => `bes18p-${randomUUID()}`) as [
  string,
  string,
  string,
];
const NAMES: Record<string, string> = { [subA]: "Anna", [subB]: "Ben", [subOp]: "Op" };
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

const latin = `Notizfreund${randomUUID()
  .replace(/[0-9-]/g, "x")
  .slice(0, 8)} amicus`;
let speciesId = "";
let annaSpecimen = "";
let offerId = "";
let friendOfBen = ""; // Ben's friendship id for Anna

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  releaseTaxa = await holdTaxonLock(admin);
  await migrate(pool);
  app = createApp({ reviewer, pool });
  for (const sub of [subA, subB, subOp]) await call(sub, "GET", "/account");
  await admin.query(
    "insert into account_role (account, role) select id, 'operator' from account where subject = $1",
    [subOp],
  );
  speciesId = (
    await call(subA, "POST", "/species", {
      latinName: latin,
      germanName: "Notizpflanze",
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

  annaSpecimen = (await call(subA, "POST", "/specimens", { timeZone: "Europe/Berlin", speciesId }))
    .body.id;
  expect(
    (await call(subA, "POST", `/specimens/${annaSpecimen}/notes`, { notes: SECRET })).status,
  ).toBe(200);
  expect(
    (await call(subA, "PUT", `/sharing/specimens/${annaSpecimen}`, { share: "friends" })).status,
  ).toBe(200);
  const { code } = (await call(subA, "POST", "/friends/invitations", {})).body;
  await call(subB, "POST", "/friends/requests", { code });
  const incoming = (await call(subA, "GET", "/friends/requests")).body.incoming[0].id;
  await call(subA, "POST", `/friends/requests/${incoming}/answer`, { decision: "accept" });
  friendOfBen = (await call(subB, "GET", "/friends")).body.friends[0].id;
  offerId = (
    await call(subA, "POST", "/offers", {
      specimenId: annaSpecimen,
      type: "cutting",
      mode: "swap",
    })
  ).body.id;
});
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subOp]];
  // The offer of the specimen goes first: it references the specimen (offer_specimen, on delete restrict).
  await admin.query(`delete from offer where account_id in (${accounts})`, subs);
  await admin.query(`delete from specimen where account_id in (${accounts})`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in (${accounts}))`,
    subs,
  );
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await releaseTaxa?.();
  await admin.end();
});

describe("US-BES-18 US-QG-05 QG-D2 the notes never leave the account (P-05)", () => {
  it("no friend output carries the notes of the keeper's specimen, while every output does carry the specimen", async () => {
    const outputs = {
      "GET /friends/:id/shared": await call(subB, "GET", `/friends/${friendOfBen}/shared?${TZ}`),
      "GET /friends/:id/collection": await call(
        subB,
        "GET",
        `/friends/${friendOfBen}/collection?${TZ}`,
      ),
      "GET /feed": await call(subB, "GET", `/feed?${TZ}`),
      "GET /feed/banner": await call(subB, "GET", `/feed/banner?${TZ}`),
      "GET /exchange/offers": await call(subB, "GET", `/exchange/offers?${TZ}`),
    };
    for (const [name, r] of Object.entries(outputs)) {
      expect(r.status, name).toBe(200);
      expect(JSON.stringify(r.body), name).not.toContain(SECRET);
      expect(JSON.stringify(r.body), name).not.toContain('"notes"');
    }
    // The outputs really carry the specimen and its offer, so the checks above are not empty.
    expect(JSON.stringify(outputs["GET /friends/:id/shared"].body)).toContain("Notizpflanze");
    expect(JSON.stringify(outputs["GET /friends/:id/collection"].body)).toContain("Notizpflanze");
    expect(JSON.stringify(outputs["GET /exchange/offers"].body)).toContain(offerId);
  });

  it("the owner's own detail carries the notes; the friend's view of the same specimen does not", async () => {
    expect((await call(subA, "GET", `/specimens/${annaSpecimen}`)).body["notes"]).toBe(SECRET);
    const shared = await call(subB, "GET", `/friends/${friendOfBen}/shared?${TZ}`);
    const row = (shared.body.specimens as Record<string, unknown>[] | undefined)?.[0];
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("notes");
  });
});
