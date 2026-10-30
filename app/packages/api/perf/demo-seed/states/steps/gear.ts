import { daysAgo, ensureEquipment, type Ctx, type Id } from "../../accounts/common/shared.ts";
import { must, specimenOf, zonesOf } from "../helpers.ts";

// Equipment states beyond the base seed (US-EQU-01 to US-EQU-09): prices and the cost view, an equipment wish, a sensor
// assigned to a specimen, a defective lamp without replacement, a shared device, and a lux measurement that deviates
// from the zone ceiling ("Zone prüfen"). Ben is the keeper with the equipment. Idempotent by name.

type Named = { id: Id; name: string; status?: string };

const equipmentNamed = async (ctx: Ctx): Promise<Named[]> =>
  ((await ctx.api.ok(ctx.sub, "GET", "/equipment"))["equipment"] ?? []) as Named[];

export async function benGear(ben: Ctx): Promise<void> {
  const zones = await zonesOf(ben);
  const zone3 = must([...zones.entries()], ([n]) => n === "Zone 3", "Zone 3")[1] as Id;
  await ensureEquipment(ben, [
    {
      type: "Lamp",
      name: "Pflanzenlampe LED 60 W",
      fields: {
        manufacturer: "Beispiel GmbH",
        model: "Grow 60",
        lightZoneId: zone3,
        priceEur: 129.9,
        boughtAt: daysAgo(90),
      },
      after: async (id) => {
        await ben.api.ok(ben.sub, "POST", `/equipment/${id}/lamp-data`, {
          powerW: 60,
          luxStatement: 30000,
        });
      },
    },
    { type: "Substrate", name: "Kakteenerde", fields: { priceEur: 8.9, boughtAt: daysAgo(30) } },
  ]);

  const wishes = JSON.stringify(await ben.api.ok(ben.sub, "GET", "/equipment/wishes"));
  if (!wishes.includes("Pflanzenlampe Wohnzimmer"))
    await ben.api.ok(ben.sub, "POST", "/equipment/wishes", {
      equipmentType: "Lamp",
      name: "Pflanzenlampe Wohnzimmer",
      priceEur: 79,
    });

  const all = await equipmentNamed(ben);
  const sensor = must(all, (e) => e.name === "Bodenfeuchte-Sensor Monstera", "the sensor");
  const monstera = await specimenOf(ben, "Monstera deliciosa", "Ableger");
  await ben.api.ok(ben.sub, "POST", `/equipment/${sensor.id}/sensor-target`, {
    specimenId: monstera,
  });

  const cutting = must(all, (e) => e.name === "Stecklingslampe 15 W", "the cutting lamp");
  if (cutting.status !== "defective")
    await ben.api.ok(ben.sub, "POST", `/equipment/${cutting.id}/status`, { status: "defective" });

  const timer = must(all, (e) => e.name === "Zeitschaltuhr Regal", "the timer");
  await ben.api.ok(ben.sub, "PUT", `/equipment/${timer.id}/sharing`, { share: "friends" });

  // "Zone prüfen": the lamp of zone 3 measures far above its zone ceiling, the keeper's limit is 20 percent.
  await ben.api.ok(ben.sub, "POST", "/equipment/lamps/limit", { percent: 20 });
  const lamp = must(all, (e) => e.name === "Regallampe 40 W", "the shelf lamp");
  const view = (await ben.api.ok(ben.sub, "GET", "/equipment/lamps")) as {
    lamps: { id: Id; last: { measuredOn: string } | null }[];
  };
  const latest = view.lamps.find((l) => l.id === lamp.id)?.last;
  if (latest?.measuredOn !== daysAgo(0))
    await ben.api.ok(ben.sub, "POST", `/equipment/${lamp.id}/measurements`, {
      measuredOn: daysAgo(0),
      lux: 40000, // 60 percent below the zone 3 ceiling: "Zone prüfen" with the limit of 20 percent
      method: "Handmessgerät",
    });
}
