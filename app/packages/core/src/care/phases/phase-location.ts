import type { CarePhase } from "./phase";

/**
 * Port "location per phase" (FR-PHA-02, US-PHA-01/03): the id of the location the keeper assigned to this phase of a
 * species, selected from their own locations and never typed (FR-PHA-03), or `null` for "unknown". The care profile
 * (US-BES-09) will implement it; `care` only reads it. Every call applies to the account `userId` only (P-04).
 */
export interface PhaseLocationSource {
  phaseLocation(userId: string, speciesId: string, phase: CarePhase): Promise<string | null>;
}

/**
 * Until the care profile (US-BES-09) exists, nobody knows a location per phase. Instead of inventing one (P-08) it
 * stays "unknown"; confirming a move is then refused with `care.target_unknown`.
 */
export const NO_PHASE_LOCATION: PhaseLocationSource = {
  phaseLocation: async () => null,
};
