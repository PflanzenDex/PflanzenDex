import {
  growthMoments,
  growthTrend,
  isId,
  type MeasurementStore,
  type SpecimenStore,
} from "@pflanzendex/core";

/** The ports of the growth moments: the own specimens and measurements only (P-04). */
export interface GrowthSources {
  readonly specimens: Pick<SpecimenStore, "find">;
  readonly measurements: Pick<MeasurementStore, "list">;
}

/**
 * Growth moment of the newest measurement and the measurements that set a personal record (US-ACH-05), derived from the
 * specimen's own measurements on every request (FR-ACH-02). The trend of the care module is passed in, so a slower
 * trend shows nothing. `null` for an unknown or foreign specimen (both look the same, P-04).
 */
export async function achievementsGrowth(src: GrowthSources, userId: string, specimenId: string) {
  if (!isId(specimenId)) return null;
  const id = specimenId.toLowerCase();
  if (!(await src.specimens.find(userId, id))) return null;
  const rows = await src.measurements.list(userId, id);
  const moments = growthMoments(
    rows.map((m) => ({ id: m.id, date: m.date, value: m.value, quality: m.quality })),
    (upTo) => growthTrend(upTo).trend,
  );
  return { calmMode: false as const, latest: moments.latest, records: moments.records };
}
