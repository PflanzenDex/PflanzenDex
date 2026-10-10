import {
  monitoringSaveSettings,
  monitoringSubscribe,
  monitoringUnsubscribe,
  reminderInbox,
} from "@pflanzendex/core";
import { ChannelsPostgres, IdempotencyPostgres, RemindersPostgres } from "@pflanzendex/db";
import { Hono, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

/** Paths the sign-in guard (bearer token) must cover. */
const MONITORING_PATHS = ["/reminders"] as const;

/**
 * Reminders (epic MON), always for the own account (P-04, P-05):
 * `GET /reminders` the in-app inbox, newest first (days with nothing due are not listed; a failed delivery shows its status,
 * FR-MON-08); `GET`/`PUT /reminders/settings` the time of the daily check, quiet hours, pauses per occasion and the days of
 * an overdue measurement (US-MON-08); `POST`/`DELETE /reminders/subscriptions` the push subscription of a browser. The guard is applied here. Writes
 * need an `Idempotency-Key` and go through validating operations (P-03).
 */
export function monitoringRoutes(pool: Pool, auth: MiddlewareHandler): Hono<AuthEnv> {
  const reminders = new RemindersPostgres(pool);
  const channels = new ChannelsPostgres(pool);
  const writes = { idempotency: new IdempotencyPostgres(pool) };
  const save = monitoringSaveSettings({ reminders });
  const subscribe = monitoringSubscribe({ channels });
  const unsubscribe = monitoringUnsubscribe({ channels });
  const routes = new Hono<AuthEnv>();
  for (const path of MONITORING_PATHS) routes.use(path, auth).use(`${path}/*`, auth);
  routes.get("/reminders", async (c) =>
    c.json({ reminders: await reminderInbox({ reminders }, c.get("account").id) }),
  );
  routes.get("/reminders/settings", async (c) =>
    c.json(await reminders.settings(c.get("account").id)),
  );
  routes.put("/reminders/settings", async (c) => write(c, writes, save, { input: await body(c) }));
  routes.post("/reminders/subscriptions", async (c) =>
    write(c, writes, subscribe, { input: await body(c), success: 201 }),
  );
  routes.delete("/reminders/subscriptions", async (c) =>
    write(c, writes, unsubscribe, { input: await body(c) }),
  );
  return routes;
}
