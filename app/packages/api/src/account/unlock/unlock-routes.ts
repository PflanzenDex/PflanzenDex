import {
  appError,
  isTimeZone,
  localToday,
  onboardingUnlockFunction,
  unlockState,
  unlockStates,
  UNLOCK_FUNCTIONS,
  type UnlockStatus,
} from "@pflanzendex/core";
import { IdempotencyPostgres } from "@pflanzendex/db";
import { Hono, type MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import { hintRoutes } from "../hint";
import { styleRoutes } from "./style-routes";
import { unlockSources } from "./sources/unlock-sources";
import { body, errorBody, write, type AuthEnv, type Ctx, type FeatureAccess } from "../../kernel";

/** The parts of the app options the lock routes read. */
interface UnlockRouteOptions {
  readonly clock?: (() => Date) | undefined;
  /** Replaces the stored keeper style of the account (tests; DM-ONB-01, US-ONB-03). */
  readonly keeperStyle?: ((userId: string) => Promise<"few" | "many">) | undefined;
}

const badZone = (c: Ctx) =>
  c.json(
    errorBody(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    ),
    400,
  );

/** The entry the web app and the AI client get: registry data plus the derived state, reason and way as data. */
const entry = (s: UnlockStatus) => {
  const f = UNLOCK_FUNCTIONS.find((u) => u.id === s.id);
  return { ...s, epic: f?.epic, destination: f?.destination };
};

/**
 * Lock states of the keeper's functions (US-ONB-05, FR-ONB-01), derived on every request from the own data and never
 * stored. `GET /onboarding/unlocks?timeZone=` lists every function that may be announced; a function the operator switched
 * off is not in the list (FR-ONB-03). `GET /onboarding/unlocks/:id?timeZone=` answers one function: `200` while open,
 * `409 onboarding.locked` with the same reason and way as `data` while locked, `404 onboarding.unknown_function` for an
 * unknown or switched-off one. `POST /onboarding/unlocks/:id` ("Jetzt freischalten", body `{ timeZone }`) stores the
 * decision through `onboarding.unlock_function` (P-03, with `Idempotency-Key`). A lock is no permission: no other route
 * checks it (FR-ONB-04). Only the own account is touched (P-04).
 */
export function unlockRoutes(
  pool: Pool,
  auth: MiddlewareHandler,
  features: FeatureAccess,
  opt: UnlockRouteOptions,
): Hono<AuthEnv> {
  const clock = opt.clock ?? (() => new Date());
  const { unlocks, styles, featureSet, facts, hints, hintContext } = unlockSources(pool, {
    features,
    clock: opt.clock,
    style: opt.keeperStyle,
  });
  const unlock = onboardingUnlockFunction({ unlocks, features: featureSet });
  const deps = { idempotency: new IdempotencyPostgres(pool) };

  const routes = new Hono<AuthEnv>();
  styleRoutes(routes, auth, { styles, unlocks, facts, deps, clock });
  hintRoutes(routes, auth, { hints, context: hintContext, deps, clock });
  routes.use("/onboarding/unlocks", auth).use("/onboarding/unlocks/*", auth);
  routes.get("/onboarding/unlocks", async (c) => {
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) return badZone(c);
    const input = await facts(c.get("account").id, timeZone);
    return c.json({
      functions: unlockStates(input)
        .filter((s) => s.state !== "switched_off")
        .map(entry),
    });
  });
  routes.get("/onboarding/unlocks/:id", async (c) => {
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) return badZone(c);
    const found = unlockState(c.req.param("id"), await facts(c.get("account").id, timeZone));
    if (!found.ok || found.value.state === "switched_off") {
      const gone = appError("onboarding.unknown_function", { data: { id: c.req.param("id") } });
      return c.json(errorBody(found.ok ? gone : found.error), 404);
    }
    if (found.value.state === "locked") {
      return c.json(errorBody(appError("onboarding.locked", { data: entry(found.value) })), 409);
    }
    return c.json(entry(found.value));
  });
  routes.post("/onboarding/unlocks/:id", async (c) => {
    const timeZone = (await body(c))["timeZone"];
    if (!isTimeZone(timeZone)) return badZone(c);
    return write(c, deps, unlock, {
      input: { id: c.req.param("id"), on: localToday(clock(), timeZone) },
    });
  });
  return routes;
}
