import type { PhasesRow } from "./phases";

/**
 * How a row of the phase list relates to its target location (US-PHA-02): `deviation` = the specimen stands somewhere
 * else than the target, `location_missing` = it has no location (own warning, US-BES-08), `in_place` = everything else
 * (at the target, or the target is unknown, which is never a deviation, P-08).
 */
export type PhaseStatus = "deviation" | "location_missing" | "in_place";

/** Comparison by location ID, never by text (FR-PHA-03). */
export function phaseStatus(row: Pick<PhasesRow, "locationId" | "targetLocationId">): PhaseStatus {
  if (row.locationId === null) return "location_missing";
  if (row.targetLocationId !== null && row.targetLocationId !== row.locationId) return "deviation";
  return "in_place";
}

const RANK: Record<PhaseStatus, number> = { deviation: 0, location_missing: 1, in_place: 2 };

/** Deviations first, then specimens without location, then the rest; the order of the input stays inside a group. */
export function deviationsFirst<T extends Pick<PhasesRow, "locationId" | "targetLocationId">>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => RANK[phaseStatus(a)] - RANK[phaseStatus(b)]);
}
