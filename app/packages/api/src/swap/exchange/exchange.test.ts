import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-SOZ-09: the offers of friends and requesting them through the API (real PostgreSQL).
let pool: Pool;
let admin: Pool; // superuser fixture pool: cross-tenant setup and cleanup (QG-D1)
const [subA, subB, subC, subD] = [0, 1, 2, 3].map(() => `soz9-${randomUUID()}`) as [
  string,
  string,
  string,
  string,
];
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
// Every account keeps its own, unapproved species proposal: no review, so no taxon lock; a friend sees such a species as
// unknown (P-05). The approved species are covered by exchange-species.test.ts.
const speciesOf: Record<string, string> = {};
const specimen = async (sub: string, marker: string) =>
  (
    await call(sub, "POST", "/specimens", {
      timeZone: "Europe/Berlin",
      speciesId: speciesOf[sub],
      marker,
    })
  ).body.id as string;
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
  await migrate(pool);
  app = createApp({ reviewer, pool });
  for (const sub of [subA, subB, subC, subD]) await call(sub, "GET", "/account");
  for (const sub of [subA, subB])
    speciesOf[sub] = (
      await call(sub, "POST", "/species", {
        latinName: `Exchangus${randomUUID()
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
  await befriend(subA, subB);
});
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subC, subD]];
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
  await admin.end();
});

describe("US-SOZ-09 the exchange list through the API", () => {
  it("without a token 401; a bad time zone, type or lack filter 400 with the field", async () => {
    expect((await exchange(null)).status).toBe(401);
    expect((await call(subB, "GET", "/exchange/offers")).status).toBe(400);
    expect((await exchange(subB, "&type=tree")).body.error.details).toEqual([
      { field: "type", code: "input.invalid" },
    ]);
    expect((await exchange(subB, "&lack=maybe")).status).toBe(400);
  });

  it("a friend sees the open offer with health and the name of the giver, an unapproved species stays unknown (P-05); a stranger sees nothing", async () => {
    const o = await offer(subA, "L1", { note: "Gut bewurzelt" });
    const mine = (await exchange(subB)).body.offers.find(
      (x: { offerId: string }) => x.offerId === o.offerId,
    );
    expect(mine).toMatchObject({
      speciesLatin: null,
      speciesGerman: null,
      type: "cutting",
      mode: "swap",
      lack: null,
      onWishlist: false,
      requested: false,
      note: "Gut bewurzelt",
      health: { treatmentOpen: false, lastTreated: null },
    });
    expect(mine.ownerName).toBeTruthy();
    expect((await exchange(subC)).body.offers).toEqual([]);
    expect(
      (await exchange(subA)).body.offers.map((x: { offerId: string }) => x.offerId),
    ).not.toContain(o.offerId);
  });

  it("an offer is hidden when the specimen is not shared (P-05) and filters narrow the list", async () => {
    const id = await specimen(subA, "L2");
    const unshared = await call(subA, "POST", "/offers", {
      specimenId: id,
      type: "plant",
      mode: "swap",
    });
    expect(unshared.status).toBe(409);
    const plant = await offer(subA, "L3", { type: "plant" });
    const ids = async (q: string) =>
      (await exchange(subB, q)).body.offers.map((x: { offerId: string }) => x.offerId);
    expect(await ids("&type=plant")).toEqual([plant.offerId]);
    // A species that is unknown is not "lacking" (P-08), so the filter leaves it out.
    expect(await ids("&lack=true")).toEqual([]);
  });
});

describe("US-SOZ-09 'Everything private' hides the offers (P-05)", () => {
  const profile = (private_: boolean) =>
    call(subA, "PUT", "/account/profile", {
      displayName: "Anna",
      timeZone: "Europe/Berlin",
      everythingPrivate: private_,
      noRecommendations: false,
      notifications: {},
    });

  it("while the owner is 'Everything private' friends see no offer and cannot request it; switching it off brings it back", async () => {
    const o = await offer(subA, "P1");
    expect((await exchange(subB)).body.offers.map((x: { offerId: string }) => x.offerId)).toContain(
      o.offerId,
    );
    await profile(true);
    try {
      expect(
        (await exchange(subB)).body.offers.map((x: { offerId: string }) => x.offerId),
      ).not.toContain(o.offerId);
      expect((await call(subB, "POST", `/offers/${o.offerId}/request`, {})).status).toBe(404);
    } finally {
      await profile(false);
    }
    expect((await exchange(subB)).body.offers.map((x: { offerId: string }) => x.offerId)).toContain(
      o.offerId,
    );
  });
});

describe("US-SOZ-09 the privacy switch of another account never hides an offer (regression of migration 0044)", () => {
  it("the viewer's own 'Everything private' neither hides a friend's offers nor blocks a request", async () => {
    const o = await offer(subA, "P2");
    await call(subB, "PUT", "/account/profile", {
      displayName: "Ben",
      timeZone: "Europe/Berlin",
      everythingPrivate: true,
      noRecommendations: false,
      notifications: {},
    });
    try {
      expect(
        (await exchange(subB)).body.offers.map((x: { offerId: string }) => x.offerId),
      ).toContain(o.offerId);
      expect((await call(subB, "POST", `/offers/${o.offerId}/request`, {})).status).toBe(201);
    } finally {
      await call(subB, "PUT", "/account/profile", {
        displayName: "Ben",
        timeZone: "Europe/Berlin",
        everythingPrivate: false,
        noRecommendations: false,
        notifications: {},
      });
    }
  });
});

describe("US-SOZ-09 requesting an offer through the API", () => {
  const request = (sub: string | null, id: string, body: unknown = {}, key?: string | null) =>
    call(sub, "POST", `/offers/${id}/request`, body, key);

  it("without a token 401, without Idempotency-Key 400, bad input 400", async () => {
    const o = await offer(subA, "R0");
    expect((await request(null, o.offerId)).status).toBe(401);
    expect((await request(subB, o.offerId, {}, null)).status).toBe(400);
    expect((await request(subB, o.offerId, { counterText: "" })).status).toBe(400);
  });

  it("creates the request, marks the offer as requested and shows the swap on both sides; the same key answers once", async () => {
    const o = await offer(subA, "R1");
    const key = randomUUID();
    const first = await request(subB, o.offerId, { counterText: "Ein Ableger bitte" }, key);
    expect(first.status).toBe(201);
    expect(first.body.swapId).toEqual(expect.any(String));
    expect(
      (await request(subB, o.offerId, { counterText: "Ein Ableger bitte" }, key)).body,
    ).toEqual(first.body);
    const rows = await admin.query(
      "select role, status from swap where swap_id = $1 order by role",
      [first.body.swapId],
    );
    expect(rows.rows).toEqual([
      { role: "giver", status: "requested" },
      { role: "recipient", status: "requested" },
    ]);
    const listed = (await exchange(subB)).body.offers.find(
      (x: { offerId: string }) => x.offerId === o.offerId,
    );
    expect(listed.requested).toBe(true);
  });

  it("a second request from me is 409 swap.already_requested, my own offer 409 swap.own_offer, an unknown or foreign offer 404", async () => {
    const o = await offer(subA, "R2");
    await request(subB, o.offerId);
    expect(await request(subB, o.offerId)).toMatchObject({
      status: 409,
      body: { error: { code: "swap.already_requested" } },
    });
    expect(await request(subA, o.offerId)).toMatchObject({
      status: 409,
      body: { error: { code: "swap.own_offer" } },
    });
    expect(await request(subB, randomUUID())).toMatchObject({
      status: 404,
      body: { error: { code: "offer.not_found" } },
    });
    expect(await request(subD, o.offerId)).toMatchObject({
      status: 404,
      body: { error: { code: "offer.not_found" } },
    });
  });

  it("an own shared specimen is the counter-offer; one that is not shared, foreign, or for a gift is refused", async () => {
    const swapOffer = await offer(subA, "R3");
    const gift = await offer(subA, "R4", { mode: "give_away" });
    const mineShared = await specimen(subB, "G1");
    await share(subB, mineShared);
    const mineSecret = await specimen(subB, "G2");
    expect(
      (await request(subB, swapOffer.offerId, { counterSpecimenId: mineSecret })).body.error.code,
    ).toBe("swap.counter_not_shared");
    expect(
      (await request(subB, gift.offerId, { counterSpecimenId: mineShared })).body.error.code,
    ).toBe("swap.counter_not_allowed");
    expect(
      (await request(subB, swapOffer.offerId, { counterSpecimenId: swapOffer.specimenId })).body
        .error.code,
    ).toBe("specimen.not_found");
    const ok = await request(subB, swapOffer.offerId, { counterSpecimenId: mineShared });
    expect(ok.status).toBe(201);
    const row = await admin.query(
      "select counter_name from swap where swap_id = $1 and role = 'giver'",
      [ok.body.swapId],
    );
    expect(row.rows[0].counter_name).toBeTruthy();
  });

  it("a withdrawn offer cannot be requested (409 offer.not_active)", async () => {
    const o = await offer(subA, "R5");
    await call(subA, "POST", `/offers/${o.offerId}/withdraw`, {});
    expect(await request(subB, o.offerId)).toMatchObject({
      status: 409,
      body: { error: { code: "offer.not_active" } },
    });
  });
});
