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
  SWAP_PATHS,
  cancelOrphanedSwaps,
  exchangeRoutes,
  offerDependencies,
  offerRoutes,
  swapRoutes,
  swappedSourceFor,
} from "./swap";

/** The modules `social` (friends, sharing, feed) and `swap` (offers, exchange): sign-in guard in front of the paths, then the routes. */
export function bindFriends(app: Hono, pool: Pool, auth: MiddlewareHandler, clock?: () => Date) {
  for (const path of [
    ...FRIEND_PATHS,
    ...SHARING_PATHS,
    ...FEED_PATHS,
    ...OFFER_PATHS,
    ...EXCHANGE_PATHS,
    ...SWAP_PATHS,
  ])
    app.use(path, auth).use(`${path}/*`, auth);
  app.route("/", friendRoutes(pool, clock, cancelOrphanedSwaps(pool)));
  app.route("/", sharingRoutes(pool));
  app.route("/", feedRoutes(pool, clock, swappedSourceFor(pool)));
  const swapOptions = { ...(clock ? { clock } : {}) };
  app.route("/", offerRoutes(pool, swapOptions));
  app.route("/", swapRoutes(pool, clock));
  app.route("/", exchangeRoutes(pool, offerDependencies(pool, swapOptions)));
}
