import {
  appError,
  isDismissed,
  isTimeZone,
  localToday,
  onboardingDismissHint,
  onboardingShowHint,
  pickHint,
  FIRST_PLANT_GUIDE,
  type Dependencies,
  type HintStore,
  type KeeperStyle,
} from "@pflanzendex/core";
import type { Hono, MiddlewareHandler } from "hono";
import { body, errorBody, write, type AuthEnv, type Ctx } from "../../kernel";

const badZone = (c: Ctx) =>
  c.json(
    errorBody(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    ),
    400,
  );

/**
 * Calm hints and the end of the first-plant guide (US-ONB-07, DM-ONB-03). `GET /onboarding/hints?timeZone=&applicable=a,b`
 * answers `{ hint, guideEnded }`: `hint` is the one occasion that may show now among the applicable ones (or `null`; none
 * in calm mode or under style `many`, none after a dismissal or after 7 days), `guideEnded` is the stored end of the
 * guide, per account and not per device. `PUT /onboarding/hints/:occasion` with `{ state: "shown" | "dismissed",
 * timeZone }` stores it through `onboarding.show_hint` / `onboarding.dismiss_hint` (P-03, with `Idempotency-Key`); the
 * guide uses the occasion `first_plant_guide`. Only the own account is read or written (P-04).
 */
export function hintRoutes(
  routes: Hono<AuthEnv>,
  auth: MiddlewareHandler,
  w: {
    readonly hints: HintStore;
    readonly context: (userId: string) => Promise<{ style: KeeperStyle; calmMode: boolean }>;
    readonly deps: Dependencies;
    readonly clock: () => Date;
  },
) {
  const show = onboardingShowHint({ hints: w.hints });
  const dismiss = onboardingDismissHint({ hints: w.hints });
  routes.use("/onboarding/hints", auth).use("/onboarding/hints/*", auth);
  routes.get("/onboarding/hints", async (c) => {
    const timeZone = c.req.query("timeZone");
    if (!isTimeZone(timeZone)) return badZone(c);
    const userId = c.get("account").id;
    const records = await w.hints.list(userId);
    const { style, calmMode } = await w.context(userId);
    const applicable = (c.req.query("applicable") ?? "").split(",").filter(Boolean);
    const today = localToday(w.clock(), timeZone);
    return c.json({
      hint: pickHint({ applicable, records, style, calmMode, today }),
      guideEnded: isDismissed(records, FIRST_PLANT_GUIDE),
    });
  });
  routes.put("/onboarding/hints/:occasion", async (c) => {
    const input = await body(c);
    if (!isTimeZone(input["timeZone"])) return badZone(c);
    const state = input["state"];
    if (state !== "shown" && state !== "dismissed") {
      const bad = appError("input.invalid", {
        details: [{ field: "state", code: "input.invalid" }],
      });
      return c.json(errorBody(bad), 400);
    }
    return write(c, w.deps, state === "shown" ? show : dismiss, {
      input: { occasion: c.req.param("occasion"), on: localToday(w.clock(), input["timeZone"]) },
    });
  });
}
