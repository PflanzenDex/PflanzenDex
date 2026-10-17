import {
  anniversaries,
  localToday,
  type MeasurementStore,
  type SpecimenStore,
} from "@pflanzendex/core";

/** The ports of the anniversaries: the own specimens and measurements only (P-04). */
export interface AnniversarySources {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly measurements: Pick<MeasurementStore, "list">;
}

const photoOf = (specimenId: string, m: { id: string; date: string }) => ({
  url: `/specimens/${specimenId}/measurements/${m.id}/photo`,
  date: m.date,
});

/**
 * The anniversaries due today (US-ACH-06), derived from the catch dates of the own active specimens on every request
 * (FR-ACH-02). Each carries the first and the latest photo of the specimen if present; with a single photo only
 * `first` is set. `today` is the local date in `timeZone` (NFR-08).
 */
export async function achievementsAnniversaries(
  src: AnniversarySources,
  userId: string,
  timeZone: string,
  now: Date,
) {
  const rows = await src.specimens.list(userId);
  const due = anniversaries(
    rows.map((r) => ({ id: r.id, name: r.name, caughtOn: r.caughtAt, archivedOn: r.archivedAt })),
    localToday(now, timeZone),
  );
  const items = await Promise.all(
    due.map(async (a) => {
      const photos = (await src.measurements.list(userId, a.specimenId))
        .filter((m) => m.photo !== null)
        .sort((x, y) => x.date.localeCompare(y.date));
      const first = photos[0];
      const latest = photos.length > 1 ? photos[photos.length - 1] : undefined;
      return {
        ...a,
        first: first ? photoOf(a.specimenId, first) : null,
        latest: latest ? photoOf(a.specimenId, latest) : null,
      };
    }),
  );
  return { calmMode: false as const, items };
}
