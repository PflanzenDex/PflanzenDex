import { appError, FEED_DAYS, friendFeed, isTimeZone, localToday } from "@pflanzendex/core";
import { FriendsPostgres, SharingPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, type AuthEnv } from "../../kernel";
import { sharingPorts } from "../sharing/wiring";

/** Paths the sign-in guard (bearer token) must cover. */
export const FEED_PATHS = ["/feed"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Neu bei Freunden" (US-SOZ-05, DM-SOZ-04): `GET /feed?timeZone=...` returns `{ events, hint }`, derived on every request
 * from what friends share (never stored, P-01; read only through `friendView`, so only through a confirmed friendship).
 * "Today" is the local date of the requested time zone (NFR-08). Filters: `days` (1 to 365, default 30), `friend` (the
 * friendship id from `GET /friends`), `onlyNewSpecies=true`. A bad parameter answers 400 `input.invalid` naming the field.
 */
export function feedRoutes(pool: Pool, clock: () => Date = () => new Date()): Hono<AuthEnv> {
  const friends = new FriendsPostgres(pool);
  const sharing = new SharingPostgres(pool);
  const { privacy, facts } = sharingPorts(pool);
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
    const feed = await friendFeed({ friends, sharing, privacy, facts }, c.get("account").id, {
      today: localToday(clock(), timeZone),
      days: days === undefined ? FEED_DAYS : Number(days),
      ...(friend === undefined ? {} : { friendId: friend }),
      ...(c.req.query("onlyNewSpecies") === "true" ? { onlyNewSpecies: true } : {}),
    });
    return c.json(feed);
  });
  return routes;
}
