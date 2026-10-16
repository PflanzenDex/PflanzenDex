import { achievementsMarkSeen, achievementsSetCalmMode, ACHIEVEMENT_IDS } from "@pflanzendex/core";
import {
  AchievementSeenPostgres,
  AchievementSettingsPostgres,
  CareProfilePostgres,
  IdempotencyPostgres,
  MeasurementsPostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  SwapsPostgres,
  TreatmentsPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";
import { earnedAchievementIds } from "./news";

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
  return {
    settings,
    seen,
    sources,
    writeDeps: { idempotency: new IdempotencyPostgres(pool) },
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
