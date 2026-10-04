import {
  careProfileTargetLocation,
  measurementSource,
  treatmentSource,
  type MeasurementSource,
  type TreatmentSource,
  type TargetLocationSource,
} from "@pflanzendex/core";
import { CareProfilePostgres, MeasurementsPostgres, TreatmentsPostgres } from "@pflanzendex/db";
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
