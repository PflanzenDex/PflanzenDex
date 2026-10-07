import { randomBytes } from "node:crypto";
import {
  friendAnswer,
  friendEnd,
  friendInvite,
  friendList,
  friendRequest,
  friendRequests,
  sharedSpeciesCount,
} from "@pflanzendex/core";
import { FriendsPostgres, IdempotencyPostgres, SharingPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";
import { friendSharedRoute } from "../sharing/sharing-routes";
import { sharingPorts } from "../sharing/wiring";

/** Paths the sign-in guard (bearer token) must cover. */
export const FRIEND_PATHS = ["/friends"] as const;

/**
 * Friends by invitation (US-SOZ-01, FR-SOZ-08): there is no user search, friends find each other only through a code
 * that is passed on outside the app. Everything runs as the account of the caller (P-04, P-05).
 * - POST /friends/invitations: 201 with the single-use code (valid 7 days), shown this once
 * - POST /friends/requests `{ code }`: 201 with the request (display name of the inviter), not yet a friendship
 * - GET /friends/requests: `{ incoming, outgoing }`, the open requests; only the display name of the other side.
 *   `outgoing` also holds the requests the other side declined (`status: "declined"`: shown as "not accepted", US-SOZ-02)
 * - POST /friends/requests/:id/answer `{ decision: "accept" | "decline" }` (US-SOZ-02): only the receiver; 404 for any
 *   other id (no leak), 409 `friend.request_answered` when answered the other way before
 * - POST /friends/:id/end (US-SOZ-03): ends the friendship on both sides at once; 404 `friend.not_found` for any id that is
 *   not one of the caller's confirmed or ended friendships (no leak); ending twice is a no-op
 * - GET /friends: `{ friends }`, the confirmed friends: display name, since, and `sharedSpecies`, the number of species the
 *   friend shares with me that I have caught too (`null` = unknown, the friend shares nothing, US-SOZ-03); never their collections (P-05)
 * - GET /friends/:id/shared (US-SOZ-04): what this friend shares with the caller, whitelisted facts only
 */
export function friendRoutes(pool: Pool, clock: () => Date = () => new Date()): Hono<AuthEnv> {
  const friends = new FriendsPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const invite = friendInvite({ friends, random: (n) => randomBytes(n), now: clock });
  const request = friendRequest({ friends });
  const answer = friendAnswer({ friends });
  const end = friendEnd({ friends });
  const sharing = new SharingPostgres(pool);
  const ports = sharingPorts(pool);
  const sharedSpecies = (viewerId: string, ownerId: string) =>
    sharedSpeciesCount({ sharing, ...ports }, viewerId, ownerId);
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
  routes.post("/friends/requests/:id/answer", async (c) => {
    return write(c, deps, answer, { input: { ...(await body(c)), requestId: c.req.param("id") } });
  });
  routes.post("/friends/:id/end", async (c) =>
    write(c, deps, end, { input: { friendId: c.req.param("id") } }),
  );
  routes.get("/friends/:id/shared", friendSharedRoute(pool));
  routes.get("/friends", async (c) =>
    c.json(await friendList({ friends, sharedSpecies }, c.get("account").id)),
  );
  return routes;
}
