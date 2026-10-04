import type { ZoneUsage } from "../light";
import type { WishStore } from "./types";

export interface WishZoneUsageDependencies {
  readonly wishes: Pick<WishStore, "usingZone">;
}

/**
 * Port "zone usage" for the target zone of a wish (US-WUN-01): a zone a wish points to cannot be deleted unnoticed
 * (P-10). Names the wishes of the own account that use the zone, whatever their status (P-04).
 */
export function wishZoneUsage(deps: WishZoneUsageDependencies): ZoneUsage {
  return {
    user: async (userId, lightZoneId) =>
      (await deps.wishes.usingZone(userId, lightZoneId)).map((w) => ({
        kind: "wish" as const,
        id: w.id,
        name: w.name,
      })),
  };
}
