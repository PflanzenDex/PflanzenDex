import {
  achievementsSetCalmMode,
  appError,
  isTimeZone,
  readAchievementSettings,
} from "@pflanzendex/core";
import {
  AchievementSettingsPostgres,
  CareProfilePostgres,
  IdempotencyPostgres,
  MeasurementsPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  SwapsPostgres,
  TreatmentsPostgres,
} from "@pflanzendex/db";
import { Hono, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { body, errorBody, write, type AuthEnv } from "../kernel";
import { achievementsView } from "./view";

const ACHIEVEMENT_PATHS = ["/achievements"] as const;

/**
 * Achievements of the keeper (epic ACH). `GET /achievements?timeZone=` answers the overview derived from the own data
 * (US-ACH-02); in calm mode it answers `{ calmMode: true }` and nothing else (US-ACH-08). `GET /achievements/settings`
 * answers `{ calmMode }`; `PUT /achievements/settings/calm-mode` switches it through `achievements.set_calm_mode` (P-03,
 * with `Idempotency-Key`). All only touch the own account (P-04).
 */
export function achievementsRoutes(
  pool: Pool,
  auth: MiddlewareHandler,
  clock: () => Date = () => new Date(),
): Hono<AuthEnv> {
  const settings = new AchievementSettingsPostgres(pool);
  const setCalmMode = achievementsSetCalmMode({ settings });
  const writeDeps = { idempotency: new IdempotencyPostgres(pool) };
  const sources = {
    specimens: new SpecimenPostgres(pool),
    species: new SpeciesPostgres(pool),
    profiles: new CareProfilePostgres(pool),
    treatments: new TreatmentsPostgres(pool),
    measurements: new MeasurementsPostgres(pool),
    swaps: new SwapsPostgres(pool),
  };
  const routes = new Hono<AuthEnv>();
  for (const path of ACHIEVEMENT_PATHS) routes.use(path, auth).use(`${path}/*`, auth);
  routes.get("/achievements", async (c) => {
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
    if ((await readAchievementSettings(settings, userId)).calmMode) {
      return c.json({ calmMode: true });
    }
    return c.json(await achievementsView(sources, userId, timeZone, clock()));
  });
  routes.get("/achievements/settings", async (c) =>
    c.json(await readAchievementSettings(settings, c.get("account").id)),
  );
  routes.put("/achievements/settings/calm-mode", async (c) =>
    write(c, writeDeps, setCalmMode, { input: await body(c) }),
  );
  return routes;
}
