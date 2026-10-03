import { measurementSource, type MeasurementSource } from "@pflanzendex/core";
import { MeasurementsPostgres } from "@pflanzendex/db";
import type { Pool } from "pg";

/** The port "Measurements per specimen" of the specimen cards (US-BES-06), fed by the measurements (US-WAC-01). */
export function measurementSourceFor(pool: Pool): MeasurementSource {
  return measurementSource({ measurements: new MeasurementsPostgres(pool) });
}
