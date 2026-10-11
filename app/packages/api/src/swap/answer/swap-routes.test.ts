import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-SOZ-10: answering swap requests through the API (real PostgreSQL).
let pool: Pool;
let admin: Pool;
// The species stays an own proposal of the giver (no review, so no taxon lock): the requesters need no specimens here.
const [subA, subB, subC] = [0, 1, 2].map(() => `soz10-${randomUUID()}`) as [string, string, string];
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

let speciesId = "";
const specimen = async (sub: string, marker: string) =>
  (await call(sub, "POST", "/specimens", { timeZone: "Europe/Berlin", speciesId, marker })).body
    .id as string;
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
const offer = async (sub: string, marker: string) => {
  const id = await specimen(sub, marker);
  await call(sub, "PUT", `/sharing/specimens/${id}`, { share: "friends" });
  return (await call(sub, "POST", "/offers", { specimenId: id, type: "cutting", mode: "swap" }))
    .body.id as string;
};
const request = async (sub: string, offerId: string, body: unknown = {}) =>
  (await call(sub, "POST", `/offers/${offerId}/request`, body)).body.swapId as string;
const answer = (sub: string | null, swapId: string, body: unknown, key?: string | null) =>
  call(sub, "POST", `/swaps/${swapId}/answer`, body, key);
const overview = (sub: string | null) => call(sub, "GET", "/swaps");
const find = async (sub: string, swapId: string) => {
  const o = (await overview(sub)).body as {
    received: { swapId: string }[];
    sent: { swapId: string }[];
  };
  return [...o.received, ...o.sent].find((s) => s.swapId === swapId) as
    Record<string, unknown> | undefined;
};

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  for (const sub of [subA, subB, subC]) await call(sub, "GET", "/account");
  speciesId = (
    await call(subA, "POST", "/species", {
      latinName: `Answerus${randomUUID()
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
  await befriend(subA, subC);
});
afterAll(async () => {
  const accounts = "select id from account where subject = any($1)";
  const subs = [[subA, subB, subC]];
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

describe("US-SOZ-10 swaps through the API", () => {
  it("without a token 401; no Idempotency-Key 400; unknown action 400; foreign or unknown id 404", async () => {
    expect((await overview(null)).status).toBe(401);
    expect((await answer(null, randomUUID(), { action: "accept" })).status).toBe(401);
    expect((await answer(subA, randomUUID(), { action: "accept" }, null)).status).toBe(400);
    expect((await answer(subA, randomUUID(), { action: "explode" })).body.error.details).toEqual([
      { field: "action", code: "input.invalid" },
    ]);
    expect(await answer(subA, randomUUID(), { action: "accept" })).toMatchObject({
      status: 404,
      body: { error: { code: "swap.not_found" } },
    });
  });

  it("both sides see the request; accepting shows 'accepted' on both and takes the offer off the exchange list", async () => {
    const o = await offer(subA, "S1");
    const s = await request(subB, o);
    expect(await find(subA, s)).toMatchObject({ role: "giver", status: "requested" });
    expect(await find(subB, s)).toMatchObject({ role: "recipient", status: "requested" });
    expect(await answer(subA, s, { action: "accept" })).toMatchObject({
      status: 200,
      body: { status: "accepted" },
    });
    expect(await find(subB, s)).toMatchObject({ status: "accepted" });
    const listed = (
      await call(subC, "GET", "/exchange/offers?timeZone=Europe%2FBerlin")
    ).body.offers.map((x: { offerId: string }) => x.offerId);
    expect(listed).not.toContain(o);
  });

  it("accepting declines the other request automatically; a foreign account and the wrong side are refused", async () => {
    const o = await offer(subA, "S2");
    const first = await request(subB, o);
    const second = await request(subC, o);
    expect((await answer(subB, first, { action: "accept" })).body.error.code).toBe(
      "swap.not_allowed",
    );
    expect((await answer(subC, first, { action: "withdraw" })).status).toBe(404);
    await answer(subA, first, { action: "accept" });
    expect(await find(subC, second)).toMatchObject({ status: "declined", cause: "already_given" });
    expect((await answer(subA, second, { action: "accept" })).body.error.code).toBe(
      "swap.wrong_state",
    );
  });

  it("declining with a reason is shown to the requester; repeating it answers the same, the same key answers once", async () => {
    const o = await offer(subA, "S3");
    const s = await request(subB, o);
    const key = randomUUID();
    const first = await answer(subA, s, { action: "decline", reason: "Zu klein" }, key);
    expect(first).toMatchObject({ status: 200, body: { status: "declined" } });
    expect((await answer(subA, s, { action: "decline", reason: "Zu klein" }, key)).body).toEqual(
      first.body,
    );
    expect(await find(subB, s)).toMatchObject({ status: "declined", reason: "Zu klein" });
    expect((await answer(subA, s, { action: "decline" })).status).toBe(200);
  });

  it("proposing something else changes the counter-offer on both sides; the requester withdraws and the offer is open again", async () => {
    const o = await offer(subA, "S4");
    const s = await request(subB, o);
    expect((await answer(subA, s, { action: "propose" })).status).toBe(400);
    await answer(subA, s, { action: "propose", proposal: "Lieber eine Aloe" });
    expect(await find(subB, s)).toMatchObject({
      status: "requested",
      counterText: "Lieber eine Aloe",
      proposal: true,
    });
    await answer(subA, s, { action: "accept" });
    await answer(subB, s, { action: "withdraw" });
    expect(await find(subA, s)).toMatchObject({ status: "withdrawn" });
    const listed = (
      await call(subC, "GET", "/exchange/offers?timeZone=Europe%2FBerlin")
    ).body.offers.map((x: { offerId: string }) => x.offerId);
    expect(listed).toContain(o);
  });

  it("withdrawing the offer cancels its requests; ending the friendship cancels the open swaps with that friend", async () => {
    const o = await offer(subA, "S5");
    const s = await request(subB, o);
    await call(subA, "POST", `/offers/${o}/withdraw`, {});
    expect(await find(subB, s)).toMatchObject({ status: "canceled", cause: "offer_withdrawn" });
    const o2 = await offer(subA, "S6");
    const s2 = await request(subC, o2);
    await answer(subA, s2, { action: "accept" });
    const friendId = (await call(subA, "GET", "/friends")).body.friends.find(
      (f: { accountId?: string; id: string; displayName?: string }) => f.id,
    )?.id;
    const friends = (await call(subA, "GET", "/friends")).body.friends as { id: string }[];
    expect(friendId).toBeTruthy();
    const cRow = await admin.query(
      "select f.id from friendship f join account a on a.id = f.account_id where a.subject = $1 and f.other_id = (select id from account where subject = $2)",
      [subA, subC],
    );
    expect(friends.map((f) => f.id)).toContain(cRow.rows[0].id);
    expect((await call(subA, "POST", `/friends/${cRow.rows[0].id}/end`, {})).status).toBe(200);
    expect(await find(subC, s2)).toMatchObject({ status: "canceled", cause: "friendship_ended" });
    const status = await admin.query("select status from offer where id = $1", [o2]);
    expect(status.rows[0].status).toBe("open");
  });
});
