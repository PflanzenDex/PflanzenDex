import {
  effectiveDormancy,
  type CareProfileReader,
  type TargetLocationSource,
} from "../../collection";
import { carePhase, type CarePhase } from "../phases/phase";
import type { PhaseLocationSource } from "../phases/phase-location";

async function profileOf(profiles: CareProfileReader, userId: string, speciesId: string) {
  return (await profiles.list(userId)).find((p) => p.speciesId === speciesId) ?? null;
}

/**
 * The real source of the port `PhaseLocationSource` (US-BES-09): the location the keeper selected in their care
 * profile for this phase of the species, or `null` = unknown (P-08). Only the profile of the account is read (P-04).
 */
export function careProfileLocations(profiles: CareProfileReader): PhaseLocationSource {
  return {
    phaseLocation: async (userId, speciesId, phase) => {
      const p = await profileOf(profiles, userId, speciesId);
      return (phase === "growth" ? p?.growthLocationId : p?.dormancyLocationId) ?? null;
    },
  };
}

/**
 * The real source of the port `TargetLocationSource` (US-BES-02, FR-PHA-05) from the same care profile. The phase of
 * `today` follows the effective dormancy period (own override, else catalog); without a period it is the growth phase.
 */
export function careProfileTargetLocation(profiles: CareProfileReader): TargetLocationSource {
  const source = careProfileLocations(profiles);
  return {
    growthLocation: (userId, species) => source.phaseLocation(userId, species.id, "growth"),
    targetLocation: async (userId, species, today) => {
      const p = await profileOf(profiles, userId, species.id);
      const period = effectiveDormancy(species, p);
      const phase: CarePhase = period ? carePhase(period.from, period.until, today) : "growth";
      return source.phaseLocation(userId, species.id, phase);
    },
  };
}
