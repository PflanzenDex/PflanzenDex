import {
  localToday,
  readAchievementSettings,
  readKeeperStyle,
  type KeeperStyle,
  type UnlockInput,
} from "@pflanzendex/core";
import {
  AchievementSettingsPostgres,
  HintPostgres,
  KeeperStylePostgres,
  ManualUnlockPostgres,
  unlockSummaryOf,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import type { FeatureAccess } from "../../../kernel";
import { existingDataOf } from "./existing-data";

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
  const existing = existingDataOf(pool);
  const calm = new AchievementSettingsPostgres(pool);
  const styles = new KeeperStylePostgres(pool);
  const style = opt.style ?? ((userId: string) => readKeeperStyle(styles, userId));
  const featureSet = async (userId: string) =>
    new Set(
      Object.entries(await opt.features.states(userId))
        .filter(([, on]) => on)
        .map(([name]) => name),
    ) as UnlockInput["features"];
  // The reads are independent and run side by side (NFR-12). Each one is one transaction on the pool (at most 4
  // connections, the pool's size), and none of them takes a second connection while holding one, so the parallel
  // reads cannot wait for each other. A failing read rejects the whole answer, never a partial one (P-10).
  const facts = async (userId: string, timeZone: string): Promise<UnlockInput> => {
    const [summary, keeperStyle, settings, features, manual, existingData] = await Promise.all([
      unlockSummaryOf(pool, userId),
      style(userId),
      readAchievementSettings(calm, userId),
      featureSet(userId),
      unlocks.list(userId),
      existing(userId),
    ]);
    return {
      style: keeperStyle,
      activeSpecimens: summary.active,
      // The local date of the first specimen ever created (NFR-08); archived specimens count (history stays).
      firstSpecimenDate:
        summary.firstCreatedAt === null
          ? null
          : localToday(new Date(summary.firstCreatedAt), timeZone),
      today: localToday(clock(), timeZone),
      calmMode: settings.calmMode,
      features,
      manualUnlocks: new Set(manual.map((u) => u.id)),
      existingData,
    };
  };
  const hints = new HintPostgres(pool);
  // What decides whether a hint shows at all (US-ONB-07): the keeper style and calm mode.
  const hintContext = async (userId: string) => ({
    style: await style(userId),
    calmMode: (await readAchievementSettings(calm, userId)).calmMode,
  });
  return { unlocks, styles, featureSet, facts, hints, hintContext };
}
