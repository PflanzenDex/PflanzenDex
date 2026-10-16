import type { Fixtures } from "../kernel/index.ts";

// Tables of the module `achievements` (FR-QG-07).
export const FIXTURES_ACHIEVEMENTS: Fixtures = {
  achievement_setting: () => ({ calm_mode: true }),
  achievement_seen: () => ({ seen_achievements: ["cutting-rooted"] }),
};
