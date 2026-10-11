import { appError, defineOperation, failed, idField, ok, shape } from "../../kernel";
import type { EquipmentStore } from "../store/types";

export interface SetZoneDependencies {
  readonly equipment: EquipmentStore;
}

const schema = shape({ id: idField("id"), lightZoneId: idField("lightZoneId") });

/**
 * Moves a lamp to another light zone (US-EQU-02): a lamp belongs to exactly one zone, chosen from the zones of the
 * account. Only lamps have a zone; a zone of another account looks like an unknown zone (P-04).
 */
export const equipmentSetZone = (deps: SetZoneDependencies) =>
  defineOperation({
    name: "equipment.set_zone",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.equipment.setZone(userId, input.id, input.lightZoneId);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "not_lamp") return failed(appError("equipment.not_a_lamp"));
      if (r === "zone_unknown") return failed(appError("light_zone.not_found"));
      return ok(r);
    },
  });
