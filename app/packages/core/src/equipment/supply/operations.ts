import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  ok,
  orNull,
  shape,
  textField,
} from "../../kernel";
import { SUPPLY_LEVELS, SUPPLY_LIMITS, type EquipmentStore } from "../store/types";

const supplySchema = shape({ id: idField("id"), supply: choiceField("supply", SUPPLY_LEVELS) });

/**
 * Sets how much of a consumable is left: `available`, `low` or `empty` (US-EQU-05), one tap. A device has no supply. A
 * consumable that is `low` or `empty` is a need that US-EQU-07 derives; nothing is stored for it here.
 */
export const equipmentSetSupply = (deps: { equipment: EquipmentStore }) =>
  defineOperation({
    name: "equipment.set_supply",
    schema: supplySchema,
    run: async ({ userId }, { id, supply }) => {
      const r = await deps.equipment.setSupply(userId, id, supply);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "not_consumable") return failed(appError("equipment.not_a_consumable"));
      return ok(r);
    },
  });

const linkSchema = shape({
  id: idField("id"),
  agentLink: orNull(textField("agentLink", SUPPLY_LIMITS.agentLink)),
});

/**
 * Links a plant agent to the text that occurs in `Treatment.Agent` (DM-EQU-03), or removes the link with `null`. The
 * free text of treatments stays as it is; the link only lets the supply of the agent be found for it (US-EQU-05).
 */
export const equipmentLinkAgent = (deps: { equipment: EquipmentStore }) =>
  defineOperation({
    name: "equipment.link_agent",
    schema: linkSchema,
    run: async ({ userId }, { id, agentLink }) => {
      const r = await deps.equipment.setAgentLink(userId, id, agentLink);
      if (r === "not_found") return failed(appError("equipment.not_found"));
      if (r === "not_plant_agent") return failed(appError("equipment.not_a_plant_agent"));
      return ok(r);
    },
  });
