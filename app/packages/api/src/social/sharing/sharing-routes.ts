import {
  appError,
  friendAccount,
  friendCollection,
  friendView,
  sharingList,
  sharingSet,
  sharingSetSpecies,
} from "@pflanzendex/core";
import { FriendsPostgres, IdempotencyPostgres, SharingPostgres } from "@pflanzendex/db";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../../kernel";
import { sharingPorts } from "./wiring";

/** Paths the sign-in guard (bearer token) must cover. */
export const SHARING_PATHS = ["/sharing"] as const;

/**
 * What friends see (US-SOZ-04, FR-SOZ-01): private by default, nothing leaves the account without a decision (P-05).
 * - GET /sharing: `{ shared: [{ specimenId, photos }] }`, the keeper's own settings; every other specimen is private
 * - PUT /sharing/specimens/:id `{ share: "private" | "friends", photos? }` (with `Idempotency-Key`): one specimen
 * - PUT /sharing/species/:id `{ share, photos? }`: every active specimen of the species in one transaction, `{ changed }`
 * Reading a friend's shares is `GET /friends/:id/shared` (see `friendRoutes`): only the whitelisted facts, only through a
 * confirmed friendship, nothing while the friend switched "Everything private" on.
 */
export function sharingRoutes(pool: Pool): Hono<AuthEnv> {
  const sharing = new SharingPostgres(pool);
  const { lookup } = sharingPorts(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const ops = { sharing, specimens: lookup };
  const set = sharingSet(ops);
  const setSpecies = sharingSetSpecies(ops);
  const routes = new Hono<AuthEnv>();
  routes.get("/sharing", async (c) => c.json(await sharingList({ sharing }, c.get("account").id)));
  routes.put("/sharing/specimens/:id", async (c) =>
    write(c, deps, set, { input: { ...(await body(c)), specimenId: c.req.param("id") } }),
  );
  routes.put("/sharing/species/:id", async (c) =>
    write(c, deps, setSpecies, { input: { ...(await body(c)), speciesId: c.req.param("id") } }),
  );
  return routes;
}

/** `GET /friends/:id/shared`: what the friend with this friendship id shares with the caller (US-SOZ-04). */
export function friendSharedRoute(pool: Pool) {
  const friends = new FriendsPostgres(pool);
  const sharing = new SharingPostgres(pool);
  const { privacy, facts } = sharingPorts(pool);
  return async (c: Context<AuthEnv>) => {
    const me = c.get("account").id;
    const owner = await friendAccount({ friends }, me, c.req.param("id") ?? "");
    if (owner === null) {
      const error = appError("friend.not_found");
      return c.json(errorBody(error), statusFor(error));
    }
    return c.json(await friendView({ sharing, privacy, facts }, me, owner));
  };
}

/**
 * `GET /friends/:id/collection` (US-SOZ-07): the shared collection of the friend with this friendship id as cards, with
 * "you have it" from my own collection; `{ friend: { name }, cards }`. Only what the friend shares, only through a confirmed
 * friendship; an id that is not one of my friends is 404 `friend.not_found`.
 */
export function friendCollectionRoute(pool: Pool) {
  const friends = new FriendsPostgres(pool);
  const sharing = new SharingPostgres(pool);
  const { privacy, facts, mine } = sharingPorts(pool);
  return async (c: Context<AuthEnv>) => {
    const me = c.get("account").id;
    const friend = (await friends.friends(me)).find((f) => f.id === c.req.param("id"));
    if (!friend) {
      const error = appError("friend.not_found");
      return c.json(errorBody(error), statusFor(error));
    }
    const { cards } = await friendCollection(
      { sharing, privacy, facts, mine },
      me,
      friend.accountId,
    );
    return c.json({ friend: { name: friend.name }, cards });
  };
}
