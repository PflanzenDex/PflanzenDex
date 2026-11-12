import type { AreaName, NotReleasedCall } from "@pflanzendex/core";

/** The route of each area read of the AI interface (US-KI-12); the tools call these with the caller's token. */
export const AREA_PATHS: Readonly<Record<AreaName, string>> = {
  list_care_phases: "/mcp/care-phases",
  list_open_treatments: "/mcp/treatments",
  list_treatment_history: "/mcp/treatments/history",
  list_watering_due: "/mcp/watering/due",
  list_reminders: "/mcp/reminders",
  get_reminder_settings: "/mcp/reminders/settings",
  list_wish_candidates: "/mcp/wishes/candidates",
  list_bought_wishes: "/mcp/wishes/bought",
  list_discarded_wishes: "/mcp/wishes/discarded",
  get_pokedex_ownership: "/mcp/pokedex/ownership",
  list_pokedex_cards: "/mcp/pokedex/cards",
  get_achievements: "/mcp/achievements",
  get_growth_records: "/mcp/achievements/growth",
  list_care_profiles: "/mcp/care-profiles",
  get_light_distribution: "/mcp/light-distribution",
  get_difficulty_comparison: "/mcp/difficulty",
  list_collection_hints: "/mcp/hints",
  list_catalog_gaps: "/mcp/catalog/gaps",
  list_my_corrections: "/mcp/catalog/corrections",
  list_unlocks: "/mcp/unlocks",
  get_profile: "/mcp/profile",
  list_equipment: "/mcp/equipment",
  list_equipment_lamps: "/mcp/equipment/lamps",
  list_equipment_sensors: "/mcp/equipment/sensors",
  list_equipment_agents: "/mcp/equipment/agents",
  list_equipment_zones: "/mcp/equipment/zones",
  list_equipment_needs: "/mcp/equipment/needs",
  list_equipment_checks_due: "/mcp/equipment/checks-due",
  list_equipment_wishes: "/mcp/equipment/wishes",
  list_bought_equipment_wishes: "/mcp/equipment/wishes/bought",
  list_discarded_equipment_wishes: "/mcp/equipment/wishes/discarded",
  list_ai_log: "/mcp/log",
  list_ai_drafts: "/mcp/drafts",
};

/** The calls that are never released (FR-KI-10, FR-KI-22): `GET /mcp/not-released/<subject>` answers `ai.not_released`. */
export const notReleasedPath = (subject: NotReleasedCall) => `/mcp/not-released/${subject}`;
