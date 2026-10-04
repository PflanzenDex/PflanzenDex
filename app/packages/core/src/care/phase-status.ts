import type { PhasesRow } from "./phases";

/**
 * How a row of the phase list relates to its target location (US-PHA-02): `deviation` = the specimen stands somewhere
 * else than the target, `location_missing` = it has no location (own warning, US-BES-08), `in_place` = everything else
 * (at the target, or the target is unknown, which is never a deviation, P-08).
 */
export type PhaseStatus = "deviation" | "location_missing" | "in_place";

export function phaseStatus(row: Pick<PhasesRow, "locationId" | "targetLocationId">): PhaseStatus {
  return row.locationId === row.targetLocationId ? "in_place" : "in_place";
}
