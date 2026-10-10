import {
  appError,
  careProfileTargetLocation,
  failed,
  measurementPhotoById,
  type ObjectStore,
  type PhotoSource,
  measurementSource,
  treatmentSource,
  type MeasurementSource,
  type TreatmentSource,
  type TargetLocationSource,
} from "@pflanzendex/core";
import {
  CareProfilePostgres,
  MeasurementsPostgres,
  SpecimenPostgres,
  TreatmentsPostgres,
} from "@pflanzendex/db";
import type { Pool } from "pg";

/** The port "Measurements per specimen" of the specimen cards (US-BES-06), fed by the measurements (US-WAC-01). */
export function measurementSourceFor(pool: Pool): MeasurementSource {
  return measurementSource({ measurements: new MeasurementsPostgres(pool) });
}

/** The port "Open treatments per specimen" of the specimen cards (US-BES-06), fed by the planned treatments (US-BEH-01). */
export function treatmentSourceFor(pool: Pool): TreatmentSource {
  return treatmentSource({ treatments: new TreatmentsPostgres(pool) });
}

/** The port "target location" of new specimens (US-BES-02, FR-PHA-05), fed by the keeper's own care profile (US-BES-09). */
export function targetLocationFor(pool: Pool): TargetLocationSource {
  return careProfileTargetLocation(new CareProfilePostgres(pool));
}

/** The port "photo of a measurement" of the AI interface (US-KI-04), the same reading as the photo route of the owner. */
export function measurementPhotoSourceFor(
  pool: Pool,
  media: { store: ObjectStore } | undefined,
): PhotoSource {
  const deps = {
    measurements: new MeasurementsPostgres(pool),
    specimens: new SpecimenPostgres(pool),
  };
  return async (userId, measurementId) =>
    media
      ? measurementPhotoById({ ...deps, objects: media.store }, userId, measurementId)
      : failed(appError("media.storage_unavailable"));
}
