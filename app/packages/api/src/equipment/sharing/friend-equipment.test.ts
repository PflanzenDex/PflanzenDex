import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openFixturePool, openOwnerPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-EQU-12 through the API (real PostgreSQL): private by default, whitelist only, friendship, "Everything private" (P-05).
let pool: Pool;
let admin: Pool;
const [subA, subB, subC] = [0, 1, 2].map(() => `equ12-${randomUUID()}`) as [string, string, string];
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid" && sub
    ? { sub, email: `${sub}@example.test`, name: "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
let friendOfBen = "";
let lampId = "";
let timerId = "";

async function call(sub: string, method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer valid:${sub}`,
  };
  if (method !== "GET") headers["idempotency-key"] = randomUUID();
  const res = await app.request(path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  pool = openOwnerPool();
  admin = openFixturePool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  for (const sub of [subA, subB, subC]) await call(sub, "GET", "/account");
  const zone = (await call(subA, "POST", "/light-zones", { name: "Meine Zone", luxCeiling: 15000 }))
    .body;
  const zoneId = (zone.zone ?? zone).id as string;
  lampId = (
    await call(subA, "POST", "/equipment", {
      type: "Lamp",
      name: "Lampe Alpha",
      model: "GL-9",
      productId: "SN-12345",
      priceEur: 99,
      boughtAt: "2026-01-02",
      note: "geheime Notiz",
      lightZoneId: zoneId,
    })
  ).body.equipment.id;
  timerId = (await call(subA, "POST", "/equipment", { type: "Timer", name: "Zeitschaltuhr" })).body
    .equipment.id;
  const { code } = (await call(subA, "POST", "/friends/invitations", {})).body;
  await call(subB, "POST", "/friends/requests", { code });
  const incoming = (await call(subA, "GET", "/friends/requests")).body.incoming[0].id;
  await call(subA, "POST", `/friends/requests/${incoming}/answer`, { decision: "accept" });
  friendOfBen = (await call(subB, "GET", "/friends")).body.friends[0].id;
});
afterAll(async () => {
  const subs = [[subA, subB, subC]];
  await admin.query("delete from account where subject = any($1)", subs);
  await admin.end();
  await pool.end();
});

describe("US-EQU-12 share equipment with friends through the API", () => {
  it("US-EQU-12 equipment is private by default: a friend sees nothing", async () => {
    expect((await call(subA, "GET", "/equipment/sharing")).body).toEqual({ shared: [] });
    expect((await call(subB, "GET", `/equipment/friends/${friendOfBen}`)).body.devices).toEqual([]);
  });

  it("US-EQU-12 a shared device shows type, name, model, light level and note, and never price, product id, date or location", async () => {
    const r = await call(subA, "PUT", `/equipment/${lampId}/sharing`, {
      share: "friends",
      note: "sehr hell, läuft ruhig",
    });
    expect(r.status).toBe(200);
    const seen = (await call(subB, "GET", `/equipment/friends/${friendOfBen}`)).body;
    expect(seen.devices).toEqual([
      {
        id: lampId,
        type: "Lamp",
        name: "Lampe Alpha",
        model: "GL-9",
        luxCeiling: 15000,
        note: "sehr hell, läuft ruhig",
      },
    ]);
    expect(JSON.stringify(seen)).not.toMatch(/SN-12345|99|2026-01-02|geheime|Meine Zone/);
    expect((await call(subA, "GET", "/equipment/sharing")).body.shared).toEqual([
      { equipmentId: lampId, note: "sehr hell, läuft ruhig" },
    ]);
  });

  it("US-EQU-12 a shared device does not appear in the feed of a friend", async () => {
    const feed = await call(subB, "GET", "/feed");
    expect(JSON.stringify(feed.body)).not.toContain("Lampe Alpha");
  });

  it("US-EQU-12 a stranger gets 404 and no data; foreign equipment cannot be shared (P-04)", async () => {
    expect(await call(subC, "GET", `/equipment/friends/${friendOfBen}`)).toMatchObject({
      status: 404,
      body: { error: { code: "friend.not_found" } },
    });
    expect(
      await call(subB, "PUT", `/equipment/${timerId}/sharing`, { share: "friends" }),
    ).toMatchObject({
      status: 404,
      body: { error: { code: "equipment.not_found" } },
    });
  });

  it("US-EQU-12 'Everything private' suspends the sharing, withdrawing hides the device and clears the note", async () => {
    const profile = (await call(subA, "GET", "/account/profile")).body;
    await call(subA, "PUT", "/account/profile", { ...profile, everythingPrivate: true });
    expect((await call(subB, "GET", `/equipment/friends/${friendOfBen}`)).body.devices).toEqual([]);
    expect((await call(subA, "GET", "/equipment/sharing")).body.shared).toHaveLength(1);
    await call(subA, "PUT", "/account/profile", { ...profile, everythingPrivate: false });
    expect(
      (await call(subB, "GET", `/equipment/friends/${friendOfBen}`)).body.devices,
    ).toHaveLength(1);
    await call(subA, "PUT", `/equipment/${lampId}/sharing`, { share: "private" });
    expect((await call(subB, "GET", `/equipment/friends/${friendOfBen}`)).body.devices).toEqual([]);
    expect((await call(subA, "GET", "/equipment/sharing")).body.shared).toEqual([]);
  });

  it("US-EQU-12 ending the friendship withdraws everything at once; a bad value is refused", async () => {
    await call(subA, "PUT", `/equipment/${timerId}/sharing`, { share: "friends", note: null });
    expect(
      (await call(subB, "GET", `/equipment/friends/${friendOfBen}`)).body.devices,
    ).toHaveLength(1);
    expect(
      (await call(subA, "PUT", `/equipment/${timerId}/sharing`, { share: "everyone" })).status,
    ).toBe(400);
    await call(subB, "POST", `/friends/${friendOfBen}/end`, {});
    expect((await call(subB, "GET", `/equipment/friends/${friendOfBen}`)).status).toBe(404);
  });
});
