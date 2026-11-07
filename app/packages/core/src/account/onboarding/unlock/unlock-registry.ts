// The registry of the functions of the app and their unlock rules (US-ONB-04, FR-ONB-02). One table: navigation,
// overview and unlock rules all read it. Every threshold is a starting value decided by the PO, not measured (P-08,
// FR-ONB-07); the table in docs/specs/product/22-introduction-and-unlocking.md is the source.
import type { Feature } from "../../../kernel";

/** The five main destinations (US-QS-14) a function lives in. */
export type UnlockDestination = "today" | "collection" | "discover" | "friends" | "account";

/** One condition of a rule; a rule is met when ANY of its conditions is met (the table's "or"). */
export type UnlockCondition =
  /** The first specimen was created; archived or deleted ones do not take it back (history stays). */
  | { readonly kind: "first_specimen" }
  /** At least `count` active specimens. */
  | { readonly kind: "specimens"; readonly count: number }
  /** At least `days` calendar days since the local date of the first specimen ever created. */
  | { readonly kind: "days_since_first_specimen"; readonly days: number };

export type UnlockRuleId =
  | "always"
  | "first_plant"
  | "wishes_and_discover"
  | "equipment"
  | "social"
  | "ai"
  | "care_rhythm"
  | "anniversaries"
  | "year_in_review";

/** Starting values (assumption, decided by the PO, revisable). `[]` means always open. */
export const UNLOCK_RULES: Readonly<Record<UnlockRuleId, readonly UnlockCondition[]>> = {
  always: [],
  first_plant: [{ kind: "first_specimen" }],
  wishes_and_discover: [
    { kind: "days_since_first_specimen", days: 28 },
    { kind: "specimens", count: 5 },
  ],
  equipment: [
    { kind: "specimens", count: 3 },
    { kind: "days_since_first_specimen", days: 28 },
  ],
  social: [{ kind: "specimens", count: 5 }],
  ai: [{ kind: "specimens", count: 5 }],
  care_rhythm: [{ kind: "days_since_first_specimen", days: 28 }],
  anniversaries: [{ kind: "days_since_first_specimen", days: 365 }],
  year_in_review: [{ kind: "days_since_first_specimen", days: 365 }],
};

/**
 * The keeper switches (US-ONB-09, P-12): the features outside the core purpose that a keeper may leave out. Several
 * functions can share one switch (friends and swapping, the three achievement functions). Stored per keeper in
 * `account_keeper_switch`; a switch without a row is on.
 */
export const KEEPER_SWITCH_IDS = [
  "wishlist",
  "discover",
  "equipment",
  "friends",
  "ai_access",
  "achievement_views",
  "leaf_log",
  "pot_labels",
  "csv_import",
] as const;
export type KeeperSwitchId = (typeof KEEPER_SWITCH_IDS)[number];

export interface UnlockFunction {
  readonly id: string;
  readonly epic: string;
  readonly destination: UnlockDestination;
  readonly rule: UnlockRuleId;
  /** Operator switch (US-DEV-06): while off the function does not exist and is never announced (FR-ONB-03). */
  readonly feature?: Feature;
  /** Hidden in calm mode (US-ACH-08), also as locked (US-ONB-05). */
  readonly hiddenInCalmMode?: true;
  /** The keeper switch the function belongs to (US-ONB-09); no switch means core: it has no switch (P-12). */
  readonly keeperSwitch?: KeeperSwitchId;
}

const fn = (
  id: string,
  epic: string,
  destination: UnlockDestination,
  rest: {
    rule: UnlockRuleId;
    feature?: Feature;
    hiddenInCalmMode?: true;
    keeperSwitch?: KeeperSwitchId;
  },
): UnlockFunction => ({ id, epic, destination, ...rest });

/** In navigation order (US-ONB-06: ordered by the navigation, not by state). */
export const UNLOCK_FUNCTIONS = [
  fn("today", "BES", "today", { rule: "always" }),
  fn("collection", "BES", "collection", { rule: "always" }),
  fn("species_catalog", "BES", "discover", { rule: "always" }),
  fn("light_zones", "LIC", "collection", { rule: "always" }),
  fn("measuring", "WAC", "collection", { rule: "first_plant" }),
  fn("photos", "WAC", "collection", { rule: "first_plant" }),
  fn("growth", "WAC", "collection", { rule: "first_plant" }),
  fn("leaf_log", "WAC", "collection", { rule: "first_plant", keeperSwitch: "leaf_log" }),
  fn("pot_labels", "BES", "collection", { rule: "first_plant", keeperSwitch: "pot_labels" }),
  fn("csv_import", "BES", "collection", { rule: "always", keeperSwitch: "csv_import" }),
  fn("treatments", "BEH", "today", { rule: "first_plant" }),
  fn("pokedex", "POK", "collection", { rule: "first_plant" }),
  fn("wishlist", "WUN", "collection", { rule: "wishes_and_discover", keeperSwitch: "wishlist" }),
  fn("discover", "ENT", "discover", { rule: "wishes_and_discover", keeperSwitch: "discover" }),
  fn("equipment", "EQU", "account", {
    rule: "equipment",
    feature: "recommendations",
    keeperSwitch: "equipment",
  }),
  fn("friends", "SOZ", "friends", { rule: "social", feature: "social", keeperSwitch: "friends" }),
  fn("swapping", "TAU", "friends", { rule: "social", feature: "social", keeperSwitch: "friends" }),
  fn("ai_access", "KI", "account", { rule: "ai", feature: "ai", keeperSwitch: "ai_access" }),
  fn("care_rhythm", "ACH", "account", {
    rule: "care_rhythm",
    hiddenInCalmMode: true,
    keeperSwitch: "achievement_views",
  }),
  fn("anniversaries", "ACH", "account", {
    rule: "anniversaries",
    hiddenInCalmMode: true,
    keeperSwitch: "achievement_views",
  }),
  fn("year_in_review", "ACH", "account", {
    rule: "year_in_review",
    hiddenInCalmMode: true,
    keeperSwitch: "achievement_views",
  }),
] as const satisfies readonly UnlockFunction[];

export type UnlockFunctionId = (typeof UNLOCK_FUNCTIONS)[number]["id"];

export const UNLOCK_FUNCTION_IDS: readonly UnlockFunctionId[] = UNLOCK_FUNCTIONS.map((f) => f.id);

export const isUnlockFunctionId = (id: string): id is UnlockFunctionId =>
  (UNLOCK_FUNCTION_IDS as readonly string[]).includes(id);

/** The core functions (US-ONB-09): the registry without a keeper switch. They have no switch and say why in one sentence. */
export const CORE_FUNCTION_IDS: readonly UnlockFunctionId[] = UNLOCK_FUNCTIONS.filter(
  (f) => f.keeperSwitch === undefined,
).map((f) => f.id);

export const isKeeperSwitchId = (id: string): id is KeeperSwitchId =>
  (KEEPER_SWITCH_IDS as readonly string[]).includes(id);

export const isCoreFunctionId = (id: string): id is UnlockFunctionId =>
  (CORE_FUNCTION_IDS as readonly string[]).includes(id);

/** The functions a keeper switch turns on or off, in registry order (derived, never listed twice). */
export const keeperSwitchFunctions = (sw: KeeperSwitchId): readonly UnlockFunctionId[] =>
  UNLOCK_FUNCTIONS.filter((f) => f.keeperSwitch === sw).map((f) => f.id);
