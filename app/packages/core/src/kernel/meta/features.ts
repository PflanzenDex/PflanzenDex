// Feature switches (US-DEV-06): the one place that decides whether a function group is reachable.

/** The function groups that can be switched: friends, feed, swap, sharing (R2, R3), AI access (R4), recommendations (R5). */
export const FEATURES = ["social", "ai", "recommendations"] as const;
export type Feature = (typeof FEATURES)[number];

/** Which functions are switched on for the whole installation. */
export type FeatureSet = ReadonlySet<Feature>;

export const ALL_FEATURES: FeatureSet = new Set(FEATURES);
export const NO_FEATURES: FeatureSet = new Set();

const isFeature = (name: string): name is Feature => (FEATURES as readonly string[]).includes(name);

/** Names from the database or a list; unknown names are dropped (a newer app version may have written them). */
export function knownFeatures(names: Iterable<string>): FeatureSet {
  return new Set([...names].filter(isFeature));
}

/**
 * The global switch from the environment variable `FEATURES` (comma separated, e.g. `social,ai`). Unset or empty:
 * everything is off in production (`NODE_ENV=production`) and on in development and tests (assumption, decided by the
 * PO). An unknown name stops the start instead of being ignored (P-10): a typo must not silently keep a function off.
 */
export function featuresFromEnv(env: {
  FEATURES?: string | undefined;
  NODE_ENV?: string | undefined;
}): FeatureSet {
  const list = (env.FEATURES ?? "").trim();
  if (list === "") return env.NODE_ENV === "production" ? NO_FEATURES : ALL_FEATURES;
  const names = list
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n !== "");
  const unknown = names.filter((n) => !isFeature(n));
  if (unknown.length > 0)
    throw new Error(
      `FEATURES names unknown functions: ${unknown.join(", ")} (known: ${FEATURES.join(", ")})`,
    );
  return knownFeatures(names);
}

/** On when the global switch is on or the operator opened it for this account (assumption, decided by the PO). */
export const featureEnabled = (
  feature: Feature,
  global: FeatureSet,
  account: FeatureSet,
): boolean => global.has(feature) || account.has(feature);

/** The effective state of every function for one account, as the web app receives it. */
export const featureStates = (
  global: FeatureSet,
  account: FeatureSet,
): Record<Feature, boolean> => ({
  social: featureEnabled("social", global, account),
  ai: featureEnabled("ai", global, account),
  recommendations: featureEnabled("recommendations", global, account),
});
