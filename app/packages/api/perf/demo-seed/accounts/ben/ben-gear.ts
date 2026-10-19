import { daysAgo, ensureEquipment, type Ctx, type Id } from "../common/shared.ts";

/** Ben's equipment: three lamps (one per upper zone, with data), timer, sensor, consumables, one plant agent. */
export async function seedBenEquipment(ctx: Ctx, zones: Map<string, Id>): Promise<void> {
  const { api, sub } = ctx;
  const lamp = (name: string, zone: string, powerW: number, luxStatement: number) => ({
    type: "Lamp",
    name,
    fields: {
      manufacturer: "Beispiel GmbH",
      model: `Grow ${powerW}`,
      lightZoneId: zones.get(zone) ?? null,
    },
    after: async (id: Id) => {
      await api.ok(sub, "POST", `/equipment/${id}/lamp-data`, { powerW, luxStatement });
      await api.ok(sub, "POST", `/equipment/${id}/maintenance`, {
        inOperationSince: daysAgo(300),
        checkIntervalDays: 90,
        lifetimeValue: null,
        lifetimeSource: null,
      });
    },
  });
  await ensureEquipment(ctx, [
    lamp("Regallampe 40 W", "Lampe 3", 40, 20000),
    lamp("Growbox-Lampe 100 W", "Lampe 4", 100, 60000),
    lamp("Stecklingslampe 15 W", "Lampe 1", 15, 3000),
    { type: "Timer", name: "Zeitschaltuhr Regal" },
    { type: "Sensor", name: "Bodenfeuchte-Sensor Monstera" },
    {
      type: "Substrate",
      name: "Aroid-Mix",
      after: (id) =>
        api.ok(sub, "POST", `/equipment/${id}/supply`, { supply: "low" }).then(() => undefined),
    },
    { type: "Fertilizer", name: "Flüssigdünger grün" },
    {
      type: "Plant agent",
      name: "Neemöl",
      after: (id) =>
        api
          .ok(sub, "POST", `/equipment/${id}/agent-link`, { agentLink: "Neemöl" })
          .then(() => undefined),
    },
  ]);
}
