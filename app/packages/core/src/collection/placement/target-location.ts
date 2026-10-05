import type { TargetLocationSource } from "../shared/types";

/**
 * Until the care phases (PHA) and the care profile (BES-09) exist, nobody knows a target location. Instead of inventing
 * a location (P-08), it stays "unknown"; the keeper chooses it themselves.
 */
export const NO_TARGET_LOCATION: TargetLocationSource = {
  targetLocation: async () => null,
  growthLocation: async () => null,
};
