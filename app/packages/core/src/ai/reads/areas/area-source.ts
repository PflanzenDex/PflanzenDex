// Every other area of the app through the AI interface (US-KI-12, KI-R10): the port the app fills with the functions its
// own routes call (FR-KI-14), one per area, and what each area's read needs and marks as data (FR-KI-07).
import type { Result } from "../../../kernel";

/** What an area read gets besides the account: the keeper's time zone, a resolved specimen and the own connection. */
export interface AreaQuery {
  /** IANA name; set for the areas that need "today" (NFR-08), otherwise `null`. */
  readonly timeZone: string | null;
  /** The specimen the client named, already resolved within the account (FR-KI-15); otherwise `null`. */
  readonly specimenId: string | null;
  /** The connection that calls: the log and the drafts inbox show only its own entries (US-KI-12). */
  readonly connectionId: string;
}

/** The free texts of an equipment record (DM-EQU-01): what the keeper typed. */
const EQUIPMENT_TEXTS = [
  "name",
  "manufacturer",
  "model",
  "productId",
  "note",
  "material",
  "lifetimeValue",
  "lifetimeSource",
  "agentLink",
];

/**
 * The read areas (US-KI-12), named after their tools, equipment (EQU) included; friends' data, sharing,
 * offers, swaps, recommendations and the human-only functions are never released (FR-KI-10, FR-KI-22, `NOT_RELEASED_CALLS`).
 */
export const AREA_READS = {
  // Care (PHA, BEH, MON): phases and the location they ask for, treatments, watering, reminders.
  list_care_phases: { needs: "timeZone", list: "phases", data: ["name"] },
  list_open_treatments: {
    needs: "timeZone",
    list: "treatments",
    data: ["specimenName", "reason", "agent"],
  },
  list_treatment_history: { needs: "specimen", list: "treatments", data: ["reason", "agent"] },
  list_watering_due: { needs: "timeZone", list: "due", data: ["name"] },
  list_reminders: { needs: "nothing", list: "reminders", data: ["items"] },
  get_reminder_settings: { needs: "nothing", list: null, data: [] },
  // Wishlist (WUN): open candidates, bought and discarded wishes.
  list_wish_candidates: {
    needs: "nothing",
    list: "candidates",
    data: ["name", "german", "title", "reasoning"],
  },
  list_bought_wishes: { needs: "nothing", list: "bought", data: ["name", "title"] },
  list_discarded_wishes: { needs: "nothing", list: "discarded", data: ["name", "title"] },
  // Pokédex (POK) and achievements (ACH): ownership is derived, never stored (P-01).
  get_pokedex_ownership: { needs: "timeZone", list: "caught", data: ["germanName"] },
  list_pokedex_cards: { needs: "timeZone", list: "cards", data: ["germanName", "summary"] },
  get_achievements: { needs: "timeZone", list: null, data: [] },
  get_growth_records: { needs: "specimen", list: null, data: [] },
  // Collection views (BES, LIC): own care profiles, light distribution, difficulty, hints.
  list_care_profiles: { needs: "nothing", list: "entries", data: ["speciesName", "wateringHint"] },
  get_light_distribution: { needs: "nothing", list: null, data: [] },
  get_difficulty_comparison: {
    needs: "nothing",
    list: "rows",
    data: ["speciesName", "wateringHint", "substrate", "pruning", "successCriteria"],
  },
  list_collection_hints: { needs: "nothing", list: "hints", data: ["specimenName"] },
  // Catalog (BES): gaps of the shared catalog and the corrections the keeper proposed.
  list_catalog_gaps: { needs: "nothing", list: "entries", data: [] },
  list_my_corrections: {
    needs: "nothing",
    list: "corrections",
    data: ["oldValue", "proposedValue", "reason", "decisionReason"],
  },
  // Account (ONB, ACC, KI): unlock state, time zone and display name, the own connection's log and drafts.
  list_unlocks: { needs: "timeZone", list: "functions", data: [] },
  get_profile: { needs: "nothing", list: null, data: ["displayName"] },
  list_ai_log: { needs: "nothing", list: "log", data: [] },
  list_ai_drafts: { needs: "nothing", list: "drafts", data: ["content", "reference"] },
  // Equipment (EQU), its own tool set after the areas above: every kind, lamps, sensors, plant agents, devices per zone,
  // needs, checks due and wishes. Only the own equipment; what friends share stays unreachable (FR-KI-10).
  list_equipment: { needs: "nothing", list: "equipment", data: EQUIPMENT_TEXTS },
  list_equipment_lamps: {
    needs: "nothing",
    list: "lamps",
    data: ["name", "zone.name", "last.method", "measurements[].method"],
  },
  list_equipment_sensors: {
    needs: "nothing",
    list: "sensors",
    data: ["name", "target.name", "specimens[].name", "locations[].name"],
  },
  list_equipment_agents: { needs: "nothing", list: "agents", data: ["name", "agentLink"] },
  list_equipment_zones: {
    needs: "nothing",
    list: "zones",
    data: ["name", "lamps[].name", "unassigned[].name"],
  },
  list_equipment_needs: { needs: "nothing", list: "needs", data: ["reason", "source"] },
  list_equipment_checks_due: { needs: "timeZone", list: "due", data: ["name"] },
  list_equipment_wishes: { needs: "nothing", list: "open", data: ["name", "productId"] },
  list_bought_equipment_wishes: { needs: "nothing", list: "bought", data: ["name", "productId"] },
  list_discarded_equipment_wishes: {
    needs: "nothing",
    list: "discarded",
    data: ["name", "productId"],
  },
} as const satisfies Readonly<Record<string, AreaRead>>;

export interface AreaRead {
  /** What the read takes besides paging: nothing, the time zone (NFR-08) or a specimen by id or name. */
  readonly needs: "nothing" | "timeZone" | "specimen";
  /** The key of the app's answer that holds the list (paged, FR-KI-16); `null` for a single view. */
  readonly list: string | null;
  /**
   * Free texts of the keeper or of other keepers, delivered marked as data (FR-KI-07). In a list area a field of the
   * list's items; one whose first key is beside the list in the app's answer keeps its own path (`specimens[].name`).
   */
  readonly data: readonly string[];
}

export type AreaName = keyof typeof AREA_READS;
export const AREA_NAMES = Object.keys(AREA_READS) as readonly AreaName[];

/**
 * Port: per area the function behind the app's own route (FR-KI-14), answering what that route answers, for the account
 * `userId` only (P-04). A refusal of the app (e.g. a foreign specimen) comes back unchanged.
 */
export type AreaReadSource = Readonly<
  Record<AreaName, (userId: string, query: AreaQuery) => Promise<Result<object>>>
>;

/** The areas the app's modules answer; the AI module adds the own connection's log and drafts itself. */
export type AppAreaReadSource = Omit<AreaReadSource, "list_ai_log" | "list_ai_drafts">;

/**
 * What a client may ask for but never gets through a connection (FR-KI-10, FR-KI-22): the subject of the call and the
 * operation of class `never` it falls under. A call answers `ai.not_released` and is logged (US-KI-12, FR-KI-19), whatever
 * the connection's rights. Reads and writes alike: the route carries no payload, so the arguments are never read.
 */
export const NOT_RELEASED_CALLS = {
  // Friends' data, sharing, offers, swaps and partner data (FR-KI-10).
  friends: "friends_data",
  feed: "friends_data",
  sharing: "sharing_settings",
  offers: "offers_and_swaps",
  swaps: "offers_and_swaps",
  recommendations: "partner_data",
  // Human-only functions (FR-KI-22): profile, devices, calm mode, onboarding, keeper switches, visibility for friends,
  // reviewer and operator functions, connections, swap acceptance and handover, account deletion and export.
  profile: "profile_settings",
  push: "push_subscriptions",
  "calm-mode": "calm_mode",
  onboarding: "onboarding_settings",
  switches: "keeper_switches",
  visibility: "friend_visibility",
  review: "review_functions",
  operator: "operator_functions",
  connections: "manage_connections",
  "swap-accept": "accept_swap",
  handover: "hand_over",
  "account-deletion": "delete_account",
  "account-export": "export_account",
} as const;
export type NotReleasedCall = keyof typeof NOT_RELEASED_CALLS;
