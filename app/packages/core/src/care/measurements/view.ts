import { isId } from "../../kernel";
import type { SpeciesSource, SpecimenStore } from "../../collection";
import type { MeasurementView, MeasurementStore } from "./types";

export interface ViewDependencies {
  readonly measurements: MeasurementStore;
  readonly specimens: Pick<SpecimenStore, "find">;
  readonly species: SpeciesSource;
}

/**
 * The "Measure" view of a specimen (US-WAC-01): what is measured, the measurements, the last measurement and its
 * rating. Everything is derived and never stored (P-01). `null` if the specimen does not exist or belongs to another
 * account (both look the same, P-04).
 */
export async function measurementView(
  deps: ViewDependencies,
  userId: string,
  specimenId: string,
): Promise<MeasurementView | null> {
  if (!isId(specimenId)) return null;
  const specimen = await deps.specimens.find(userId, specimenId.toLowerCase());
  if (!specimen) return null;
  const species = await deps.species.find(userId, specimen.speciesId);
  const measurements = await deps.measurements.list(userId, specimen.id);
  const last = measurements[0] ?? null;
  return {
    specimenId: specimen.id,
    growthMeasure: species?.growthMeasure ?? null,
    measurements,
    last,
    lastRating: last?.quality ?? null,
  };
}
