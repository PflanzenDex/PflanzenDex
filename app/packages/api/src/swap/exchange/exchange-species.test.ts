import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool, holdTaxonLock } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-SOZ-09: the approved species, "you lack it" and the wishlist hint through the API (real PostgreSQL). Only this file
// approves a species for the exchange, so it holds the taxon lock for the shortest time possible.
let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant setup and cleanup (QG-D1)
let releaseTaxa: (() => Promise<void>) | undefined;
const [subA, subB, subOp] = [0, 1, 2].map(() => `soz9-${randomUUID()}`) as [string, string, string];
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid" && sub
    ? { sub, email: `${sub}@example.test`, name: `Name ${sub.slice(-4)}`, email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(
  sub: string | null,
  method: string,
  path: string,
  body?: unknown,
  key: string | null = randomUUID(),
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sub) headers["authorization"] = `Bearer valid:${sub}`;
  if (key && method !== "GET") headers["idempotency-key"] = key;
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

const tz = "timeZone=Europe%2FBerlin";
let speciesId = "";
let latin = "";
const specimen = async (sub: string, marker: string) =>
  (await call(sub, "POST", "/specimens", { timeZone: "Europe/Berlin", speciesId, marker })).body
    .id as string;
const share = (sub: string, id: string) =>
  call(sub, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
async function befriend(inviter: string, redeemer: string) {
  const { code } = (await call(inviter, "POST", "/friends/invitations", {})).body;
  await call(redeemer, "POST", "/friends/requests", { code });
  const incoming = (await call(inviter, "GET", "/friends/requests")).body.incoming as {
    id: string;
  }[];
  await call(inviter, "POST", `/friends/requests/${incoming[0]?.id}/answer`, {
    decision: "accept",
  });
}
const offer = async (sub: string, marker: string, extra: Record<string, unknown> = {}) => {
  const id = await specimen(sub, marker);
  await share(sub, id);
  const r = await call(sub, "POST", "/offers", {
    specimenId: id,
    type: "cutting",
    mode: "swap",
    ...extra,
  });
  return { specimenId: id, offerId: r.body.id as string };
};
const exchange = (sub: string | null, query = "") =>
  call(sub, "GET", `/exchange/offers?${tz}${query}`);

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
  latin = `Exchangus${randomUUID()
    .replace(/[0-9-]/g, "x")
    .slice(0, 8)} novus`;
  speciesId = (
    await call(subA, "POST", "/species", {
      latinName: latin,
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
  await befriend(subA, subB);
}, 120_000); // waits for the taxon lock of the other test files
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subOp]];
  await admin.query(`delete from swap where account_id in (${accounts})`, subs);
  await admin.query(`delete from offer where account_id in (${accounts})`, subs);
  await admin.query(`delete from specimen where account_id in (${accounts})`, subs);
  await admin.query(
    `delete from species where id in (select object_id from review_case where account_id in (${accounts}))`,
    subs,
  );
  await admin.query(`delete from friendship where account_id in (${accounts})`, subs);
  await admin.query("delete from account where subject = any($1)", subs);
  await pool.end();
  await releaseTaxa?.();
  await admin.end();
});

describe("US-SOZ-09 species, 'you lack it' and the wishlist hint through the API", () => {
  it("a friend sees the approved species, health and 'you lack it'; an unapproved proposal stays unknown (P-05)", async () => {
    const o = await offer(subA, "L1", { note: "Gut bewurzelt" });
    const mine = (await exchange(subB)).body.offers.find(
      (x: { offerId: string }) => x.offerId === o.offerId,
    );
    expect(mine).toMatchObject({
      speciesLatin: latin,
      type: "cutting",
      mode: "swap",
      lack: true,
      onWishlist: false,
      requested: false,
      note: "Gut bewurzelt",
      health: { treatmentOpen: false, lastTreated: null },
    });
    expect(mine.ownerName).toBeTruthy();
  });

  it("the species is on my wishlist: a hint appears, and the wishlist itself is not part of the answer (FR-WUN-07)", async () => {
    await call(subB, "POST", "/wishes", { name: latin });
    const o = await offer(subA, "L4");
    const r = await exchange(subB);
    const found = r.body.offers.find((x: { offerId: string }) => x.offerId === o.offerId);
    expect(found.onWishlist).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('"wishes"');
  });
});
