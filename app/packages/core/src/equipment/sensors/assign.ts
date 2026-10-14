import { appError, defineOperation, failed, idField, ok, orNull, shape } from "../../kernel";
import { isActive, type SpecimenRow } from "../../collection";
import type { EquipmentStore } from "../store/types";

const schema = shape({
  id: idField("id"),
  specimenId: orNull(idField("specimenId")),
  locationId: orNull(idField("locationId")),
});

/**
 * Assigns a sensor to a specimen or to a location, or to neither when both are empty (US-EQU-06). A sensor sits in one
 * place only: both at once is refused. Raw sensor values are not part of equipment (FR-MON-07); only the assignment is.
 * Only a sensor is assigned; a specimen or location of another account looks unknown (P-04).
 */
export const equipmentAssignSensor = (deps: {
  equipment: EquipmentStore;
  specimens: { list(userId: string): Promise<readonly SpecimenRow[]> };
}) =>
  defineOperation({
    name: "equipment.assign_sensor",
    schema,
    run: async ({ userId }, { id, specimenId, locationId }) => {
      if (specimenId !== null && locationId !== null)
        return failed(
          appError("input.invalid", {
            details: [{ field: "locationId", code: "input.invalid" }],
          }),
        );
      if (specimenId !== null) {
        const own = await deps.specimens.list(userId);
        if (!own.some((s) => s.id === specimenId && isActive(s)))
          return failed(appError("equipment.target_unknown"));
      }
      const r = await deps.equipment.setSensorTarget(userId, id, { specimenId, locationId });
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "not_sensor") return failed(appError("equipment.not_a_sensor"));
      if (r === "target_unknown") return failed(appError("equipment.target_unknown"));
      return ok(r);
    },
  });
