import type { Hono, MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import {
  FEED_PATHS,
  FRIEND_PATHS,
  SHARING_PATHS,
  feedRoutes,
  friendRoutes,
  sharingRoutes,
} from "./social";
import { OFFER_PATHS, offerRoutes } from "./swap";

/** The modules `social` (friends, sharing, feed) and `swap` (offers): sign-in guard in front of the paths, then the routes. */
export function bindFriends(app: Hono, pool: Pool, auth: MiddlewareHandler, clock?: () => Date) {
  for (const path of [...FRIEND_PATHS, ...SHARING_PATHS, ...FEED_PATHS, ...OFFER_PATHS])
    app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", friendRoutes(pool, clock));
  app.route("/", sharingRoutes(pool));
  app.route("/", feedRoutes(pool, clock));
  app.route("/", offerRoutes(pool, { ...(clock ? { clock } : {}) }));
}
