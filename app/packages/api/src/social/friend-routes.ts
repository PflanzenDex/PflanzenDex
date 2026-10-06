import { randomBytes } from "node:crypto";
import { friendInvite, friendRequest, friendRequests } from "@pflanzendex/core";
import { FriendsPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
export const FRIEND_PATHS = ["/friends"] as const;

/**
 * Friends by invitation (US-SOZ-01, FR-SOZ-08): there is no user search, friends find each other only through a code
 * that is passed on outside the app. Everything runs as the account of the caller (P-04, P-05).
 * - POST /friends/invitations: 201 with the single-use code (valid 7 days), shown this once
 * - POST /friends/requests `{ code }`: 201 with the request (display name of the inviter), not yet a friendship
 * - GET /friends/requests: `{ incoming, outgoing }`, the open requests; only the display name of the other side
 */
export function friendRoutes(pool: Pool, clock: () => Date = () => new Date()): Hono<AuthEnv> {
  const friends = new FriendsPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const invite = friendInvite({ friends, random: (n) => randomBytes(n), now: clock });
  const request = friendRequest({ friends });
  const routes = new Hono<AuthEnv>();
  routes.post("/friends/invitations", async (c) => {
    const response = await write(c, deps, invite, { input: {}, success: 201 });
    response.headers.set("cache-control", "no-store");
    return response;
  });
  routes.post("/friends/requests", async (c) =>
    write(c, deps, request, { input: await body(c), success: 201 }),
  );
  routes.get("/friends/requests", async (c) =>
    c.json(await friendRequests({ friends }, c.get("account").id)),
  );
  return routes;
}
