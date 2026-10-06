import type { CardMeasurementView, MeasurementSource } from "../../collection";
import type { MeasurementStore } from "./types";

export interface SourceDependencies {
  readonly measurements: Pick<MeasurementStore, "lastFor">;
}

/**
 * Implements the port "Measurements per specimen" of `collection` (US-BES-06): the last measurement of each specimen.
 * The photo is `null` until photos are recorded (US-WAC-03); a specimen without a measurement is missing from the
 * answer (P-08).
 */
export function measurementSource(deps: SourceDependencies): MeasurementSource {
  return {
    async forSpecimens(userId, specimenIds) {
      const views = new Map<string, CardMeasurementView>();
      if (specimenIds.length === 0) return views;
      for (const [id, m] of await deps.measurements.lastFor(userId, specimenIds)) {
        const { date, value, quality, note } = m;
        views.set(id, { last: { date, value, quality, note }, photo: null });
      }
      return views;
    },
  };
}
