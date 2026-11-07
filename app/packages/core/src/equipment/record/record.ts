import { appError, defineOperation, failed, ok } from "../../kernel";
import { CONSUMABLE_TYPES, LAMP_TYPE, POT_TYPE, type EquipmentStore } from "../store/types";
import { recordSchema } from "./fields";

export interface RecordEquipmentDependencies {
  readonly equipment: EquipmentStore;
}

/**
 * Records a piece of equipment (US-EQU-01, DM-EQU-01): only type and name are required; everything else stays unknown
 * instead of guessed (P-08). A device starts `active`, a consumable has no operating status. The name is unique per
 * account (case-insensitive); a lamp needs a light zone of the account, any other type none; for several of a kind the text says to append " – <distinction>". The product id must not
 * be a URL (FR-EQU-03). Nothing is written on refusal, the same Idempotency-Key writes once (US-QS-03).
 */
export const equipmentRecord = (deps: RecordEquipmentDependencies) =>
  defineOperation({
    name: "equipment.record",
    schema: recordSchema,
    run: async ({ userId }, input) => {
      // A lamp belongs to exactly one light zone, no other type to any (DM-EQU-02, US-EQU-02).
      if ((input.type === LAMP_TYPE) !== (input.lightZoneId !== null))
        return failed(
          appError("input.invalid", { details: [{ field: "lightZoneId", code: "input.invalid" }] }),
        );
      // The pot fields belong to a pot only (US-BES-19, DM-EQU-05): any other type refuses each one it is given.
      const potFields = (["diameterCm", "heightCm", "material", "drainage"] as const).filter(
        (field) => input[field] !== null,
      );
      if (input.type !== POT_TYPE && potFields.length > 0)
        return failed(
          appError("input.invalid", {
            details: potFields.map((field) => ({ field, code: "input.invalid" as const })),
          }),
        );
      const status = CONSUMABLE_TYPES.includes(input.type) ? null : "active";
      const row = await deps.equipment.create(userId, input, status);
      if (row === "name_taken") return failed(appError("equipment.name_taken"));
      if (row === "zone_unknown") return failed(appError("light_zone.not_found"));
      return ok(row);
    },
  });
