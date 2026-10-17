import type { CardMeasurementView, MeasurementSource } from "../../../collection";
import type { MeasurementStore } from "../types";

export interface SourceDependencies {
  readonly measurements: Pick<MeasurementStore, "lastFor" | "lastPhotoFor">;
}

/**
 * Implements the port "Measurements per specimen" of `collection` (US-BES-06): the last measurement of each specimen.
 * The photo is the most recent one of the specimen (US-WAC-05), `null` if there is none; a specimen without a measurement is missing from the
 * answer (P-08).
 */
export function measurementSource(deps: SourceDependencies): MeasurementSource {
  return {
    async forSpecimens(userId, specimenIds) {
      const views = new Map<string, CardMeasurementView>();
      if (specimenIds.length === 0) return views;
      const photos = await deps.measurements.lastPhotoFor(userId, specimenIds);
      for (const [id, m] of await deps.measurements.lastFor(userId, specimenIds)) {
        const { date, value, quality, note } = m;
        const p = photos.get(id);
        // The url is the private API path; the web fetches it with the token (P-05).
        const photo = p
          ? { url: `/specimens/${id}/measurements/${p.id}/photo`, date: p.date }
          : null;
        views.set(id, { last: { date, value, quality, note }, photo });
      }
      return views;
    },
  };
}
