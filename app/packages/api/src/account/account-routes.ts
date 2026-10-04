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

type Identity = { email: string; displayName: string | null; emailConfirmed: boolean };

/** Creates or refreshes the data row of the caller (email and confirmation from the token; a chosen name is kept). */
async function ensureRow(pool: Pool, id: string, data: Identity) {
  return withAccount(pool, id, async (db) => {
    const r = await db.query<{ display_name: string | null; time_zone: string | null }>(
      `insert into account_data (account_id, email, display_name, email_confirmed, last_active_at)
       values ($1, $2, $3, $4, now())
       on conflict (account_id) do update
         set email = excluded.email,
             display_name = coalesce(account_data.display_name, excluded.display_name),
             email_confirmed = excluded.email_confirmed, updated_at = now(), last_active_at = now()
       returning display_name, time_zone`,
      [id, data.email, data.displayName, data.emailConfirmed],
    );
    return r.rows[0];
  });
}

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
    const own = await ensureRow(pool, id, data);
    // Only a hint for the UI (shows the review list and the operator area); the operations check the role again
    // (US-BES-10, US-ACC-05, P-04).
    const roles = await withAccount(pool, id, async (db) => {
      const r = await db.query<{ reviewer: boolean; operator: boolean }>(
        "select is_reviewer() as reviewer, is_operator() as operator",
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
      reviewer: roles?.reviewer === true,
      operator: roles?.operator === true,
    });
  });

  // The profile can be the first call of a fresh token: the row exists before it is read or written (P-04: the row
  // belongs to the account of the caller, created by the same statement as in `GET /account`).
  routes.use("/profile", async (c, next) => {
    const { id, data } = c.get("account");
    await ensureRow(pool, id, data);
    await next();
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
