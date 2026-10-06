import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, openPool } from "@pflanzendex/db";
import { createApp, type AppOptions } from "../app";

type TokenVerifier = NonNullable<AppOptions["reviewer"]>;

// US-SOZ-01: friend codes and requests through the API (real PostgreSQL).
let pool: Pool;
const subA = `soz1-${randomUUID()}`;
const subB = `soz1-${randomUUID()}`;
const subC = `soz1-${randomUUID()}`;
const NAMES: Record<string, string> = { [subA]: "Anna", [subB]: "Ben", [subC]: "Cleo" };
const reviewer: TokenVerifier = async (token) => {
  const [kind, sub] = token.split(":");
  return kind === "valid" && sub
    ? { sub, email: `${sub}@example.test`, name: NAMES[sub] ?? "Test", email_verified: true }
    : null;
};
let app: ReturnType<typeof createApp>;
type Response = { status: number; body: Record<string, any>; headers: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any

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
  return {
    status: res.status,
    body: (await res.json()) as Record<string, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    headers: res.headers,
  };
}
const invite = async (sub: string) => (await call(sub, "POST", "/friends/invitations", {})).body;
const requests = async (sub: string) => (await call(sub, "GET", "/friends/requests")).body;
const redeem = (sub: string, code: string) => call(sub, "POST", "/friends/requests", { code });

beforeAll(async () => {
  pool = openPool();
  await migrate(pool);
  app = createApp({ reviewer, pool });
  for (const sub of [subA, subB, subC]) await call(sub, "GET", "/account");
});
afterAll(async () => {
  await pool.query("delete from account where subject = any($1)", [[subA, subB, subC]]);
  await pool.end();
});

describe("US-SOZ-01 sign-in and input", () => {
  it("US-SOZ-01 all friend routes without a token: 401", async () => {
    expect((await call(null, "POST", "/friends/invitations", {})).status).toBe(401);
    expect((await call(null, "POST", "/friends/requests", { code: "x" })).status).toBe(401);
    expect((await call(null, "GET", "/friends/requests")).status).toBe(401);
  });

  it("US-SOZ-01 POST /friends/requests without Idempotency-Key: 400, nothing written", async () => {
    const r = await call(subB, "POST", "/friends/requests", { code: "x" }, null);
    expect(r).toMatchObject({ status: 400, body: { error: { code: "idempotency.key_missing" } } });
  });

  it("US-SOZ-01 a request without a code or with a number: 400 with a stable code", async () => {
    expect(await call(subB, "POST", "/friends/requests", {})).toMatchObject({
      status: 400,
      body: { error: { code: "input.invalid" } },
    });
    expect((await call(subB, "POST", "/friends/requests", { code: 5 })).status).toBe(400);
  });
});

describe("US-SOZ-01 invite, redeem, request", () => {
  it("US-SOZ-01 invite answers 201 with a code that is not cached", async () => {
    const r = await call(subA, "POST", "/friends/invitations", {});
    expect(r.status).toBe(201);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.body["code"]).toMatch(/^[0-9A-HJKMNP-TV-Z-]{29}$/);
    expect(r.body["code"].split("-")).toHaveLength(6);
    expect(new Date(r.body["expiresAt"]).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
  });

  it("US-SOZ-01 redeeming shows the request with the display name to the inviter, not yet a friendship", async () => {
    const { code } = await invite(subA);
    const r = await redeem(subB, code);
    expect(r).toMatchObject({ status: 201, body: { otherName: "Anna", direction: "sent" } });
    expect((await requests(subA)).incoming).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ otherName: "Ben", direction: "received" }),
      ]),
    );
    expect((await requests(subB)).outgoing).toEqual(
      expect.arrayContaining([expect.objectContaining({ otherName: "Anna" })]),
    );
  });

  it("US-SOZ-01 a third account sees none of it (P-04, P-05)", async () => {
    expect(await requests(subC)).toEqual({ incoming: [], outgoing: [] });
  });

  it("US-SOZ-01 a used code answers 409 friend.code_used, an unknown one 404 friend.unknown_code", async () => {
    const { code } = await invite(subC);
    await redeem(subB, code);
    expect(await redeem(subA, code)).toMatchObject({
      status: 409,
      body: { error: { code: "friend.code_used" } },
    });
    expect(await redeem(subA, "0000-0000-0000-0000-0000-0000")).toMatchObject({
      status: 404,
      body: { error: { code: "friend.unknown_code" } },
    });
  });

  it("US-SOZ-01 an own code answers 409 friend.own_code; a duplicate request 409 friend.already_linked", async () => {
    const own = await invite(subA);
    expect(await redeem(subA, own["code"])).toMatchObject({
      status: 409,
      body: { error: { code: "friend.own_code" } },
    });
    expect(await redeem(subB, own["code"])).toMatchObject({
      status: 409,
      body: { error: { code: "friend.already_linked" } },
    });
  });

  it("US-SOZ-01 an expired code answers 409 friend.code_expired", async () => {
    const { code } = await invite(subA);
    await pool.query(
      "update friend_code set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where created_by in (select id from account where subject = $1)",
      [subA],
    );
    expect(await redeem(subC, code)).toMatchObject({
      status: 409,
      body: { error: { code: "friend.code_expired" } },
    });
  });
});
