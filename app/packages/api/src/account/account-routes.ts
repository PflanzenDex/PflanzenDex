import { mayShareWithFriends } from "@pflanzendex/core";
import { withAccount } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../kernel";

/** Own account data (FR-ACC-01): email and display name come from the verified token and are kept current. */
export function accountRoutes(pool: Pool): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.get("/", async (c) => {
    const { id, data } = c.get("account");
    const reviewer = await withAccount(pool, id, async (db) => {
      await db.query(
        `insert into account_data (account_id, email, display_name, email_confirmed)
         values ($1, $2, $3, $4)
         on conflict (account_id) do update
           set email = excluded.email, display_name = excluded.display_name,
               email_confirmed = excluded.email_confirmed, updated_at = now()`,
        [id, data.email, data.displayName, data.emailConfirmed],
      );
      // Only a hint for the UI (shows the review list); the operations check the role again (US-BES-10, P-04).
      return (
        (await db.query<{ reviewer: boolean }>("select is_reviewer() as reviewer")).rows[0]
          ?.reviewer === true
      );
    });
    return c.json({
      id,
      email: data.email,
      displayName: data.displayName,
      emailConfirmed: data.emailConfirmed,
      mayShareWithFriends: mayShareWithFriends(data),
      reviewer,
    });
  });
  return routes;
}
