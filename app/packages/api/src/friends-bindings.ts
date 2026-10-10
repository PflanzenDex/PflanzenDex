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
import {
  EXCHANGE_PATHS,
  OFFER_PATHS,
  exchangeRoutes,
  offerDependencies,
  offerRoutes,
} from "./swap";

/** The modules `social` (friends, sharing, feed) and `swap` (offers, exchange): sign-in guard in front of the paths, then the routes. */
export function bindFriends(app: Hono, pool: Pool, auth: MiddlewareHandler, clock?: () => Date) {
  for (const path of [
    ...FRIEND_PATHS,
    ...SHARING_PATHS,
    ...FEED_PATHS,
    ...OFFER_PATHS,
    ...EXCHANGE_PATHS,
  ])
    app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", friendRoutes(pool, clock));
  app.route("/", sharingRoutes(pool));
  app.route("/", feedRoutes(pool, clock));
  const swapOptions = { ...(clock ? { clock } : {}) };
  app.route("/", offerRoutes(pool, swapOptions));
  app.route("/", exchangeRoutes(pool, offerDependencies(pool, swapOptions)));
}
