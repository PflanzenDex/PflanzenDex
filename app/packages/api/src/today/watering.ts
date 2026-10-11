import {
  carePhasesList,
  isActive,
  localToday,
  wateringDue,
  type CarePhase,
  type WateringCandidate,
  type WateringDue,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  SpeciesPostgres,
  SpecimenPostgres,
  WateringPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";

/**
 * The plants that are due to be watered today (US-MON-05), for the list in the app and for the reminders. The interval
 * is the keeper's own entry for the phase of today in the care profile (US-BES-09), the phase is the one of the phase
 * list (FR-MON-03; a species without a dormancy period is always in the growth phase). Without an interval nothing is
 * reported and nothing is invented (P-08). Cuttings and archived specimens are left out, as for the overdue measurement
 * (E-11 is open). `today` is the date in `timeZone` (NFR-08).
 */
export async function wateringDueFor(
  pool: Pool,
  userId: string,
  timeZone: string,
  now: Date,
): Promise<readonly WateringDue[]> {
  const specimens = new SpecimenPostgres(pool);
  const profiles = new CareProfilePostgres(pool);
  const phases = await carePhasesList(
    {
      specimens,
      species: new SpeciesPostgres(pool),
      profiles,
      // The target locations are not needed here; the phase does not depend on them.
      targets: { phaseLocation: async () => null },
      clock: () => now,
    },
    userId,
    timeZone,
  );
  if (!phases.ok) throw new Error(phases.error.code);
  const phaseOf = new Map(phases.value.map((p) => [p.specimenId, p.phase] as const));
  const own = new Map((await profiles.list(userId)).map((p) => [p.speciesId, p] as const));
  const plants = (await specimens.list(userId)).filter((r) => isActive(r) && r.status === "plant");
  const last = await new WateringPostgres(pool).lastWatered(
    userId,
    plants.map((r) => r.id),
  );
  const candidates = plants.map((r): WateringCandidate => {
    const phase: CarePhase = phaseOf.get(r.id) ?? "growth";
    const profile = own.get(r.speciesId);
    return {
      specimenId: r.id,
      name: r.name,
      intervalDays:
        (phase === "dormancy" ? profile?.wateringDormancyDays : profile?.wateringGrowthDays) ??
        null,
      lastWateredOn: last.get(r.id) ?? null,
      since: r.caughtAt,
    };
  });
  return wateringDue(candidates, localToday(now, timeZone));
}
