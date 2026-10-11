import type { ZoneUsage } from "../../light";
import type { EquipmentStore } from "../store/types";

/**
 * Port "zone usage" for the lamps (US-EQU-02): a zone with a lamp cannot be deleted unnoticed (P-10). Names the lamps
 * of the own account that serve the zone, whatever their state (P-04).
 */
export function equipmentZoneUsage(deps: {
  equipment: Pick<EquipmentStore, "usingZone">;
}): ZoneUsage {
  return {
    user: async (userId, lightZoneId) =>
      (await deps.equipment.usingZone(userId, lightZoneId)).map((e) => ({
        kind: "equipment" as const,
        id: e.id,
        name: e.name,
      })),
  };
}
