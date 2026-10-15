import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  ok,
  shape,
} from "../../../kernel";
import { EQUIPMENT_STATUSES, type EquipmentStore } from "../../store/types";

export interface SetStatusDependencies {
  readonly equipment: EquipmentStore;
}

const schema = shape({ id: idField("id"), status: choiceField("status", EQUIPMENT_STATUSES) });

/**
 * Sets the state of a device to `active`, `defective` or `retired` (DM-EQU-01, US-EQU-02). A consumable has no state
 * (its supply comes with US-EQU-05). The record stays; nothing disappears silently (P-10).
 */
export const equipmentSetStatus = (deps: SetStatusDependencies) =>
  defineOperation({
    name: "equipment.set_status",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.equipment.setStatus(userId, input.id, input.status);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "no_status") return failed(appError("equipment.no_status"));
      return ok(r);
    },
  });
