import {
  isActive,
  localToday,
  readAchievementSettings,
  type KeeperStyle,
  type UnlockInput,
} from "@pflanzendex/core";
import {
  AchievementSettingsPostgres,
  ManualUnlockPostgres,
  SpecimenPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import type { FeatureAccess } from "../../kernel";

/** The ports and the facts of the lock rules for one account, read live from its own data (FR-ONB-01, P-04). */
export function unlockSources(
  pool: Pool,
  opt: {
    readonly clock?: (() => Date) | undefined;
    readonly features: FeatureAccess;
    readonly style?: ((userId: string) => Promise<KeeperStyle>) | undefined;
  },
) {
  const clock = opt.clock ?? (() => new Date());
  const unlocks = new ManualUnlockPostgres(pool);
  const specimens = new SpecimenPostgres(pool);
  const calm = new AchievementSettingsPostgres(pool);
  const style = opt.style ?? (async () => "many" as const);
  const featureSet = async (userId: string) =>
    new Set(
      Object.entries(await opt.features.states(userId))
        .filter(([, on]) => on)
        .map(([name]) => name),
    ) as UnlockInput["features"];
  const facts = async (userId: string, timeZone: string): Promise<UnlockInput> => {
    const rows = await specimens.list(userId);
    const dates = rows
      .map((r) => (r.createdAt ? localToday(new Date(r.createdAt), timeZone) : r.caughtAt))
      .filter((d): d is string => d !== null)
      .sort();
    return {
      style: await style(userId),
      activeSpecimens: rows.filter(isActive).length,
      firstSpecimenDate: dates[0] ?? null,
      today: localToday(clock(), timeZone),
      calmMode: (await readAchievementSettings(calm, userId)).calmMode,
      features: await featureSet(userId),
      manualUnlocks: new Set((await unlocks.list(userId)).map((u) => u.id)),
      existingData: new Set(),
    };
  };
  return { unlocks, featureSet, facts };
}
