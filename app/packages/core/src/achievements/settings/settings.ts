// Settings of the achievements per account (DM-ACH-03, US-ACH-08). Calm mode hides every game element; the care rhythm
// pause (US-ACH-04) joins this record with its story.
import { defineOperation, ok, shape, type ErrorDetail } from "../../kernel";

export interface AchievementSettings {
  /** When on, no achievement banner, overview entry, rhythm, record, anniversary or year in review is shown. */
  readonly calmMode: boolean;
}

/** Off for new accounts (assumption, decided by the PO, revisable; open question 4 of the spec). */
export const DEFAULT_ACHIEVEMENT_SETTINGS: AchievementSettings = { calmMode: false };

/** Port for persistence; the adapter lives in `db` (AB-1) and runs as the account of the caller (P-04). */
export interface AchievementSettingsStore {
  /** `null` while the account never changed a setting. */
  find(userId: string): Promise<AchievementSettings | null>;
  /** One statement; answers the stored settings. */
  setCalmMode(userId: string, calmMode: boolean): Promise<AchievementSettings>;
}

/** The settings of the account; the defaults while nothing was stored. */
export async function readAchievementSettings(
  store: Pick<AchievementSettingsStore, "find">,
  userId: string,
): Promise<AchievementSettings> {
  return (await store.find(userId)) ?? DEFAULT_ACHIEVEMENT_SETTINGS;
}

/** The one question every ACH element asks before it renders (US-ACH-08); the AI client interface asks it too (KI-R2). */
export const showsAchievements = (settings: AchievementSettings): boolean => !settings.calmMode;

const schema = shape({
  calmMode: (value: unknown): boolean | ErrorDetail =>
    typeof value === "boolean" ? value : { field: "calmMode", code: "input.invalid" },
});

/**
 * Switches calm mode on or off (US-ACH-08). Only the setting is written: earned achievements are derived and stay
 * untouched, so switching off again brings them back; they count as seen then (US-ACH-08, US-ACH-03).
 */
export const achievementsSetCalmMode = (deps: {
  settings: AchievementSettingsStore;
  /** Marks what is earned as seen; called when calm mode goes off, so nothing earned meanwhile counts as new (US-ACH-03). */
  acknowledge?: (userId: string) => Promise<void>;
}) =>
  defineOperation({
    name: "achievements.set_calm_mode",
    schema,
    run: async ({ userId }, { calmMode }) => {
      const stored = await deps.settings.setCalmMode(userId, calmMode);
      if (!calmMode) await deps.acknowledge?.(userId);
      return ok(stored);
    },
  });
