import {
  featureEnabled,
  featureStates,
  knownFeatures,
  type Feature,
  type FeatureSet,
} from "@pflanzendex/core";
import { AccountFeaturesPostgres } from "@pflanzendex/db";
import type { MiddlewareHandler } from "hono";
import type { Pool } from "pg";
import type { AuthEnv } from "./auth-env";

/**
 * The one place the routes ask whether a function group is reachable (US-DEV-06): on when the global switch (`FEATURES`)
 * is on or the operator opened it for the account. A function that is off is invisible, never "forbidden".
 */
export interface FeatureAccess {
  enabled(feature: Feature, accountId: string): Promise<boolean>;
  /** The effective state of every function for the account (what the web app receives). */
  states(accountId: string): Promise<Record<Feature, boolean>>;
}

export function featureAccess(pool: Pool, global: FeatureSet): FeatureAccess {
  const store = new AccountFeaturesPostgres(pool);
  const forAccount = async (id: string) => knownFeatures(await store.find(id));
  return {
    // Globally on needs no query; only a switched-off function looks at the account.
    enabled: async (feature, id) =>
      global.has(feature) || featureEnabled(feature, global, await forAccount(id)),
    states: async (id) => featureStates(global, await forAccount(id)),
  };
}

/**
 * Behind the sign-in guard: answers like a path that does not exist (404, nothing hints at the function) while the
 * function is off for the account. The data stays untouched (P-10); switching on restores everything.
 */
export const featureGate =
  (access: FeatureAccess, feature: Feature): MiddlewareHandler<AuthEnv> =>
  async (c, next) => {
    if (!(await access.enabled(feature, c.get("account").id))) return c.notFound();
    await next();
  };
