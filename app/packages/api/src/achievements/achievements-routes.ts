import { appError, isTimeZone, readAchievementSettings } from "@pflanzendex/core";
import { Hono, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { body, errorBody, write, type AuthEnv, type Ctx } from "../kernel";
import { achievementsNews } from "./news";
import { achievementsView } from "./view";
import { achievementsWiring } from "./wiring";

const ACHIEVEMENT_PATHS = ["/achievements"] as const;

/**
 * Achievements of the keeper (epic ACH). `GET /achievements?timeZone=` answers the overview derived from the own data
 * (US-ACH-02); in calm mode it answers `{ calmMode: true }` and nothing else (US-ACH-08). `GET /achievements/news?timeZone=`
 * answers what is new (earned minus seen) and what to create silently as seen (US-ACH-03); `POST /achievements/seen`
 * marks achievements as seen through `achievements.mark_seen` (P-03, with `Idempotency-Key`). `GET /achievements/settings`
 * answers `{ calmMode }`; `PUT /achievements/settings/calm-mode` switches it through `achievements.set_calm_mode` (P-03,
 * with `Idempotency-Key`). All only touch the own account (P-04).
 */
export function achievementsRoutes(
  pool: Pool,
  auth: MiddlewareHandler,
  clock: () => Date = () => new Date(),
): Hono<AuthEnv> {
  const w = achievementsWiring(pool, clock);
  const routes = new Hono<AuthEnv>();
  for (const path of ACHIEVEMENT_PATHS) routes.use(path, auth).use(`${path}/*`, auth);
  /** Both reads need a valid time zone and answer `{ calmMode: true }` and nothing else in calm mode (US-ACH-08). */
  const keeperRead =
    (answer: (keeper: { userId: string; timeZone: string; now: Date }) => Promise<object>) =>
    async (c: Ctx) => {
      const userId = c.get("account").id;
      const timeZone = c.req.query("timeZone");
      if (!isTimeZone(timeZone)) {
        return c.json(
          errorBody(
            appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
          ),
          400,
        );
      }
      if ((await readAchievementSettings(w.settings, userId)).calmMode) {
        return c.json({ calmMode: true });
      }
      return c.json(await answer({ userId, timeZone, now: clock() }));
    };
  routes.get(
    "/achievements",
    keeperRead(async (k) => achievementsView(w.sources, await w.seen.find(k.userId), k)),
  );
  routes.get(
    "/achievements/news",
    keeperRead((k) => achievementsNews(w.sources, w.seen, k)),
  );
  routes.post("/achievements/seen", async (c) =>
    write(c, w.writeDeps, w.markSeen, { input: await body(c) }),
  );
  routes.get("/achievements/settings", async (c) =>
    c.json(await readAchievementSettings(w.settings, c.get("account").id)),
  );
  routes.put("/achievements/settings/calm-mode", async (c) =>
    write(c, w.writeDeps, w.setCalmMode, { input: await body(c) }),
  );
  return routes;
}
