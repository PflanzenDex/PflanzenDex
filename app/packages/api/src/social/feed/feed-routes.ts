import {
  appError,
  FEED_DAYS,
  feedMarkSeen,
  friendBanner,
  friendFeed,
  type SwappedSource,
  isTimeZone,
  localToday,
} from "@pflanzendex/core";
import {
  FeedSeenPostgres,
  FriendsPostgres,
  IdempotencyPostgres,
  SharingPostgres,
} from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, write, type AuthEnv } from "../../kernel";
import { sharingPorts } from "../sharing/wiring";

/** Paths the sign-in guard (bearer token) must cover. */
export const FEED_PATHS = ["/feed"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Neu bei Freunden" (US-SOZ-05, DM-SOZ-04): `GET /feed?timeZone=...` returns `{ events, hint }`, derived on every request
 * from what friends share (never stored, P-01; read only through `friendView`, so only through a confirmed friendship).
 * The types are new species, new specimen, new cutting, "potted" (the repot day of a shared specimen) and "swapped" (a
 * handed-over swap I took part in with a current friend; the app root fills the port from `swap`). "Today" is the local date of the requested time zone (NFR-08). Filters: `days` (1 to 365, default 30), `friend` (the
 * friendship id from `GET /friends`), `onlyNewSpecies=true`. A bad parameter answers 400 `input.invalid` naming the field.
 * The answer carries `asOf` (the instant it was read), so a screen that only has an older copy can say "Stand" (FR-SOZ-03).
 * - GET /feed/banner (US-SOZ-06): `{ firstVisit, count, items, asOf }`, what became visible to me since I last marked the feed as
 *   seen; on the first visit `firstVisit` is true, nothing is new and no banner is shown
 * - POST /feed/seen `{ upTo }` (with `Idempotency-Key`): "Okay" and the silent creation of the first visit; marks the feed as seen
 *   up to `upTo` (the `asOf` of the banner), never backwards and never past now
 */
export function feedRoutes(
  pool: Pool,
  clock: () => Date = () => new Date(),
  swapped?: SwappedSource,
): Hono<AuthEnv> {
  const friends = new FriendsPostgres(pool);
  const sharing = new SharingPostgres(pool);
  const { privacy, facts } = sharingPorts(pool);
  const seen = new FeedSeenPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const mark = feedMarkSeen({ seen });
  const routes = new Hono<AuthEnv>();
  routes.get("/feed", async (c) => {
    const timeZone = c.req.query("timeZone");
    const days = c.req.query("days");
    const friend = c.req.query("friend");
    const bad = [
      ...(isTimeZone(timeZone) ? [] : ["timeZone"]),
      ...(days === undefined || (/^\d{1,3}$/.test(days) && Number(days) >= 1 && Number(days) <= 365)
        ? []
        : ["days"]),
      ...(friend === undefined || UUID.test(friend) ? [] : ["friend"]),
    ];
    if (bad.length > 0 || !isTimeZone(timeZone)) {
      const details = bad.map((field) => ({ field, code: "input.invalid" as const }));
      return c.json(errorBody(appError("input.invalid", { details })), 400);
    }
    const feed = await friendFeed(
      { friends, sharing, privacy, facts, now: clock, ...(swapped ? { swapped } : {}) },
      c.get("account").id,
      {
        today: localToday(clock(), timeZone),
        timeZone,
        days: days === undefined ? FEED_DAYS : Number(days),
        ...(friend === undefined ? {} : { friendId: friend }),
        ...(c.req.query("onlyNewSpecies") === "true" ? { onlyNewSpecies: true } : {}),
      },
    );
    return c.json(feed);
  });
  routes.get("/feed/banner", async (c) =>
    c.json(
      await friendBanner(
        { friends, sharing, privacy, facts, seen, now: clock },
        c.get("account").id,
      ),
    ),
  );
  routes.post("/feed/seen", async (c) => write(c, deps, mark, { input: await body(c) }));
  return routes;
}
