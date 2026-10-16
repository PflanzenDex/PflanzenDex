import { achievementsSetCalmMode, readAchievementSettings } from "@pflanzendex/core";
import { AchievementSettingsPostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../kernel";

const ACHIEVEMENT_PATHS = ["/achievements"] as const;

/**
 * Achievements of the keeper (epic ACH). `GET /achievements/settings` answers `{ calmMode }` (false until the keeper
 * sets it, US-ACH-08); `PUT /achievements/settings/calm-mode` switches it through `achievements.set_calm_mode` (P-03,
 * with `Idempotency-Key`). Both only touch the own account (P-04).
 */
export function achievementsRoutes(pool: Pool, auth: MiddlewareHandler): Hono<AuthEnv> {
  const settings = new AchievementSettingsPostgres(pool);
  const setCalmMode = achievementsSetCalmMode({ settings });
  const writeDeps = { idempotency: new IdempotencyPostgres(pool) };
  const routes = new Hono<AuthEnv>();
  for (const path of ACHIEVEMENT_PATHS) routes.use(path, auth).use(`${path}/*`, auth);
  routes.get("/achievements/settings", async (c) =>
    c.json(await readAchievementSettings(settings, c.get("account").id)),
  );
  routes.put("/achievements/settings/calm-mode", async (c) =>
    write(c, writeDeps, setCalmMode, { input: await body(c) }),
  );
  return routes;
}
