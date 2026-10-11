import { appError, defineOperation, failed, ok } from "../../kernel";
import { CONSUMABLE_TYPES, type EquipmentStore } from "../types";
import { recordSchema } from "./fields";

export interface RecordEquipmentDependencies {
  readonly equipment: EquipmentStore;
}

/**
 * Records a piece of equipment (US-EQU-01, DM-EQU-01): only type and name are required; everything else stays unknown
 * instead of guessed (P-08). A device starts `active`, a consumable has no operating status. The name is unique per
 * account (case-insensitive); for several of a kind the text says to append " – <distinction>". The product id must not
 * be a URL (FR-EQU-03). Nothing is written on refusal, the same Idempotency-Key writes once (US-QS-03).
 */
export const equipmentRecord = (deps: RecordEquipmentDependencies) =>
  defineOperation({
    name: "equipment.record",
    schema: recordSchema,
    run: async ({ userId }, input) => {
      const status = CONSUMABLE_TYPES.includes(input.type) ? null : "active";
      const row = await deps.equipment.create(userId, input, status);
      return row === "name_taken" ? failed(appError("equipment.name_taken")) : ok(row);
    },
  });
