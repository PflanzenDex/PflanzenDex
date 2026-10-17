import {
  appError,
  calendarDateField,
  defineOperation,
  failed,
  idField,
  integerField,
  ok,
  orNull,
  shape,
  textField,
} from "../../kernel";
import { MAINTENANCE_LIMITS, type EquipmentStore } from "../store/types";

const maintenanceSchema = shape({
  id: idField("id"),
  inOperationSince: orNull(calendarDateField("inOperationSince")),
  checkIntervalDays: orNull(integerField("checkIntervalDays", MAINTENANCE_LIMITS.intervalDays)),
  lifetimeValue: orNull(textField("lifetimeValue", MAINTENANCE_LIMITS.lifetimeValue)),
  lifetimeSource: orNull(textField("lifetimeSource", MAINTENANCE_LIMITS.lifetimeSource)),
});

/**
 * Sets the operation and maintenance data of a device (US-EQU-04): since when it runs, how often the keeper wants to
 * check it, and what the manufacturer states about its lifetime. Every value is optional and replaces the earlier one;
 * a missing value is unknown (P-08). A lifetime is only kept together with its source, so no lifetime or wear value
 * appears without a citable origin. A consumable is not a device and has none of this.
 */
export const equipmentSetMaintenance = (deps: { equipment: EquipmentStore }) =>
  defineOperation({
    name: "equipment.set_maintenance",
    schema: maintenanceSchema,
    run: async ({ userId }, { id, ...data }) => {
      if ((data.lifetimeValue === null) !== (data.lifetimeSource === null)) {
        const field = data.lifetimeValue === null ? "lifetimeValue" : "lifetimeSource";
        return failed(appError("input.invalid", { details: [{ field, code: "input.invalid" }] }));
      }
      const r = await deps.equipment.setMaintenance(userId, id, data);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "consumable") return failed(appError("equipment.not_a_device"));
      return ok(r);
    },
  });

const checkedSchema = shape({ id: idField("id"), checkedOn: calendarDateField("checkedOn") });

/** Notes that the keeper checked a device on a date (US-EQU-04); it restarts the interval. */
export const equipmentMarkChecked = (deps: { equipment: EquipmentStore }) =>
  defineOperation({
    name: "equipment.mark_checked",
    schema: checkedSchema,
    run: async ({ userId }, { id, checkedOn }) => {
      const r = await deps.equipment.markChecked(userId, id, checkedOn);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "consumable") return failed(appError("equipment.not_a_device"));
      return ok(r);
    },
  });
