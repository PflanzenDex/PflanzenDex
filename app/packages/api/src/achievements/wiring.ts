import {
  achievementsAddRhythmPause,
  achievementsMarkSeen,
  achievementsRemoveRhythmPause,
  achievementsSetCalmMode,
  ACHIEVEMENT_IDS,
  readAchievementSettings,
} from "@pflanzendex/core";
import {
  AchievementSeenPostgres,
  AchievementSettingsPostgres,
  CareProfilePostgres,
  IdempotencyPostgres,
  MeasurementsPostgres,
  RemindersPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  SwapsPostgres,
  TreatmentsPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { achievementsGrowth } from "./history/growth";
import { earnedAchievementIds } from "./news";
import { achievementsView } from "./view";

/** The adapters and operations of the module `achievements`, wired once per app (AB-1: adapters live in `db`). */
export function achievementsWiring(pool: Pool, clock: () => Date) {
  const settings = new AchievementSettingsPostgres(pool);
  const seen = new AchievementSeenPostgres(pool);
  const sources = {
    specimens: new SpecimenPostgres(pool),
    species: new SpeciesPostgres(pool),
    profiles: new CareProfilePostgres(pool),
    treatments: new TreatmentsPostgres(pool),
    measurements: new MeasurementsPostgres(pool),
    swaps: new SwapsPostgres(pool),
  };
  const earned = (userId: string, timeZone: string) =>
    earnedAchievementIds(sources, userId, timeZone, clock());
  const rhythmSources = {
    ...sources,
    reminders: new RemindersPostgres(pool),
    pauses: settings,
  };
  return {
    settings,
    rhythmSources,
    seen,
    sources,
    writeDeps: { idempotency: new IdempotencyPostgres(pool) },
    addPause: achievementsAddRhythmPause({ pauses: settings }),
    removePause: achievementsRemoveRhythmPause({ pauses: settings }),
    markSeen: achievementsMarkSeen({ seen, earned }),
    // Switching calm mode off marks what is earned as seen: nothing earned meanwhile counts as new (US-ACH-08).
    setCalmMode: achievementsSetCalmMode({
      settings,
      acknowledge: async (userId) => {
        await seen.add(userId, await earned(userId, "UTC"), ACHIEVEMENT_IDS);
      },
    }),
  };
}

/**
 * The overview (US-ACH-02) and the growth records of a specimen (US-ACH-05) as `GET /achievements` and
 * `GET /achievements/growth/:specimenId` answer them, for the AI client (US-KI-12): in calm mode only `{ calmMode: true }`
 * (US-ACH-08); an unknown or foreign specimen is `null` (P-04).
 */
export function achievementReadsFor(pool: Pool, clock: () => Date) {
  const w = achievementsWiring(pool, clock);
  const calm = async (userId: string) =>
    (await readAchievementSettings(w.settings, userId)).calmMode;
  return {
    overview: async (userId: string, timeZone: string) =>
      (await calm(userId))
        ? { calmMode: true as const }
        : achievementsView(w.sources, await w.seen.find(userId), {
            userId,
            timeZone,
            now: clock(),
          }),
    growth: async (userId: string, specimenId: string) =>
      (await calm(userId))
        ? { calmMode: true as const }
        : achievementsGrowth(w.sources, userId, specimenId),
  };
}
