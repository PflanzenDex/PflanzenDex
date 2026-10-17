import type { Fixtures } from "../kernel/index.ts";

// Tables of the module `achievements` (FR-QG-07).
export const FIXTURES_ACHIEVEMENTS: Fixtures = {
  achievement_setting: () => ({ calm_mode: true }),
  achievement_rhythm_pause: () => ({ from_on: "2026-07-01", until_on: "2026-07-14" }),
  achievement_seen: () => ({ seen_achievements: ["cutting-rooted"] }),
};
