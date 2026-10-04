import {
  accountUpdateProfile,
  appError,
  defaultNotifications,
  mayShareWithFriends,
} from "@pflanzendex/core";
import { IdempotencyPostgres, ProfilePostgres, withAccount } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, errorBody, statusFor, write, type AuthEnv } from "../kernel";

/**
 * Own account data (FR-ACC-01): email and confirmation come from the verified token and are kept current. The display
 * name is taken over from the token only while the user has not chosen one (US-ACC-02), a chosen name is never
 * overwritten by a sign-in. The profile (US-ACC-02) is written only through `account.update_profile` (P-03, with
 * `Idempotency-Key`) for the account of the caller (P-04); reading is derived from the same row.
 */
export function accountRoutes(pool: Pool): Hono<AuthEnv> {
  const profiles = new ProfilePostgres(pool);
  const update = accountUpdateProfile({ profiles });
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  routes.get("/", async (c) => {
    const { id, data } = c.get("account");
    const own = await withAccount(pool, id, async (db) => {
      const r = await db.query<{ display_name: string | null; time_zone: string | null }>(
        `insert into account_data (account_id, email, display_name, email_confirmed)
         values ($1, $2, $3, $4)
         on conflict (account_id) do update
           set email = excluded.email,
               display_name = coalesce(account_data.display_name, excluded.display_name),
               email_confirmed = excluded.email_confirmed, updated_at = now()
         returning display_name, time_zone`,
        [id, data.email, data.displayName, data.emailConfirmed],
      );
      return r.rows[0];
    });
    return c.json({
      id,
      email: data.email,
      displayName: own?.display_name ?? null,
      timeZone: own?.time_zone ?? null,
      emailConfirmed: data.emailConfirmed,
      mayShareWithFriends: mayShareWithFriends(data),
    });
  });

  routes.get("/profile", async (c) => {
    const profile = await profiles.find(c.get("account").id);
    if (!profile) {
      const denied = appError("access.denied");
      return c.json(errorBody(denied), statusFor(denied));
    }
    return c.json({
      ...profile,
      notifications: { ...defaultNotifications(), ...profile.notifications },
    });
  });

  routes.put("/profile", async (c) => write(c, deps, update, { input: await body(c) }));
  return routes;
}
