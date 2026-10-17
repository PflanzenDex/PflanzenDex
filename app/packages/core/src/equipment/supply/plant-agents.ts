import type { EquipmentStore, SupplyLevel } from "../store/types";

/** A plant agent of the keeper with its supply and the text of `Treatment.Agent` it is linked to. */
export interface PlantAgent {
  readonly id: string;
  readonly name: string;
  readonly supply: SupplyLevel;
  /** `null` = not linked; the treatments keep their free text either way (US-EQU-05). */
  readonly agentLink: string | null;
}

export interface PlantAgentsDependencies {
  readonly equipment: Pick<EquipmentStore, "list">;
}

/** The plant agents of the account with their supply, by name; purely derived (P-01), private to the account (P-04). */
export async function plantAgents(
  deps: PlantAgentsDependencies,
  userId: string,
): Promise<readonly PlantAgent[]> {
  const items = await deps.equipment.list(userId);
  return items
    .filter((e) => e.type === "Plant agent")
    .map((e) => ({
      id: e.id,
      name: e.name,
      supply: e.supply ?? "available",
      agentLink: e.agentLink,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id));
}
