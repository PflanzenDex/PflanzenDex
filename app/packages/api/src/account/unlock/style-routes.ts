import {
  appError,
  isTimeZone,
  localToday,
  onboardingSetStyle,
  unlockStates,
  type Dependencies,
  type KeeperStyleStore,
  type ManualUnlockStore,
  type UnlockInput,
} from "@pflanzendex/core";
import type { Hono, MiddlewareHandler } from "hono";
import { body, errorBody, write, type AuthEnv } from "../../kernel";

/**
 * The keeper style (US-ONB-03, DM-ONB-01). `GET /onboarding/style` answers `{ style, chosen }`: `chosen` is false for an
 * account that never answered the question, so the web asks once after the first plant. `PUT /onboarding/style` with
 * `{ style, timeZone }` sets it through `onboarding.set_style` (P-03, with `Idempotency-Key`); skipping the question
 * sends `few`. The style is private (P-05): only the own account is read or written (P-04).
 */
export function styleRoutes(
  routes: Hono<AuthEnv>,
  auth: MiddlewareHandler,
  w: {
    readonly styles: KeeperStyleStore;
    readonly unlocks: ManualUnlockStore;
    readonly facts: (userId: string, timeZone: string) => Promise<UnlockInput>;
    readonly deps: Dependencies;
    readonly clock: () => Date;
  },
) {
  const setStyle = onboardingSetStyle({
    styles: w.styles,
    unlocks: w.unlocks,
    lockedFunctions: async (userId, timeZone) =>
      unlockStates({ ...(await w.facts(userId, timeZone)), style: "few" })
        .filter((s) => s.state === "locked")
        .map((s) => s.id),
  });
  routes.use("/onboarding/style", auth);
  routes.get("/onboarding/style", async (c) => {
    const found = await w.styles.find(c.get("account").id);
    return c.json({ style: found?.style ?? "few", chosen: found !== null });
  });
  routes.put("/onboarding/style", async (c) => {
    const input = await body(c);
    if (!isTimeZone(input["timeZone"])) {
      const bad = appError("input.invalid", {
        details: [{ field: "timeZone", code: "input.invalid" }],
      });
      return c.json(errorBody(bad), 400);
    }
    return write(c, w.deps, setStyle, {
      input: { ...input, on: localToday(w.clock(), input["timeZone"]) },
    });
  });
}
