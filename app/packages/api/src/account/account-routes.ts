import { mayShareWithFriends, validateProfileInput, type AccountProfile } from "@pflanzendex/core";
import { withAccount } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "../kernel";

/** Own account data (FR-ACC-01): email and display name come from the verified token and are kept current. */
// eslint-disable-next-line max-lines-per-function
export function accountRoutes(pool: Pool): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();
  routes.get("/", async (c) => {
    const { id, data } = c.get("account");
    await withAccount(pool, id, (db) =>
      db.query(
        `insert into account_data (account_id, email, display_name, email_confirmed)
         values ($1, $2, $3, $4)
         on conflict (account_id) do update
           set email = excluded.email, display_name = excluded.display_name,
               email_confirmed = excluded.email_confirmed, updated_at = now()`,
        [id, data.email, data.displayName, data.emailConfirmed],
      ),
    );
    return c.json({
      id,
      email: data.email,
      displayName: data.displayName,
      emailConfirmed: data.emailConfirmed,
      mayShareWithFriends: mayShareWithFriends(data),
    });
  });

  routes.get("/profile", async (c) => {
    const { id } = c.get("account");
    const result = await withAccount(pool, id, async (client) => {
      const res = await client.query(
        `select display_name, time_zone, everything_private, no_recommendations, notification_settings
         from account_data where account_id = $1`,
        [id],
      );
      return res.rows[0];
    });
    if (!result)
      return c.json(
        { error: { code: "access.denied", text: "Darauf hast du keinen Zugriff." } },
        403,
      );
    const profile: AccountProfile = {
      displayName: result.display_name,
      timeZone: result.time_zone,
      everythingPrivate: result.everything_private,
      noRecommendations: result.no_recommendations,
      notificationSettings: result.notification_settings,
    };
    return c.json(profile);
  });

  // eslint-disable-next-line max-lines-per-function
  routes.put("/profile", async (c) => {
    const { id } = c.get("account");
    let input;
    try {
      input = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: "input.invalid",
            text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
          },
        },
        400,
      );
    }
    const validationResult = validateProfileInput(input);
    if (!validationResult.ok)
      return c.json(
        { error: { code: validationResult.error.code, text: validationResult.error.text } },
        400,
      );

    const updates: string[] = [];
    const values: unknown[] = [id];
    if (input.displayName !== undefined) {
      updates.push(`display_name = $${values.length + 1}`);
      values.push(input.displayName);
    }
    if (input.timeZone !== undefined) {
      updates.push(`time_zone = $${values.length + 1}`);
      values.push(input.timeZone);
    }
    if (input.everythingPrivate !== undefined) {
      updates.push(`everything_private = $${values.length + 1}`);
      values.push(input.everythingPrivate);
    }
    if (input.noRecommendations !== undefined) {
      updates.push(`no_recommendations = $${values.length + 1}`);
      values.push(input.noRecommendations);
    }
    if (input.notificationSettings !== undefined) {
      updates.push(`notification_settings = $${values.length + 1}`);
      values.push(JSON.stringify(input.notificationSettings));
    }
    if (updates.length === 0)
      return c.json(
        {
          error: {
            code: "input.invalid",
            text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
          },
        },
        400,
      );

    const result = await withAccount(pool, id, async (client) => {
      await client.query(
        `update account_data set ${updates.join(", ")} where account_id = $1`,
        values,
      );
      const res = await client.query(
        `select display_name, time_zone, everything_private, no_recommendations, notification_settings
         from account_data where account_id = $1`,
        [id],
      );
      return res.rows[0];
    });
    const profile: AccountProfile = {
      displayName: result.display_name,
      timeZone: result.time_zone,
      everythingPrivate: result.everything_private,
      noRecommendations: result.no_recommendations,
      notificationSettings: result.notification_settings,
    };
    return c.json(profile);
  });

  return routes;
}
