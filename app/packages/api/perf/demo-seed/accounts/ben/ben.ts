import { placeholderPhoto } from "../../access/photo.ts";
import {
  daysAgo,
  ensureLocations,
  ensureMeasurements,
  ensureSpecimens,
  ensureWishes,
  ensureZones,
  setUp,
  shareSpecimens,
  speciesByLatin,
  TZ,
  type Ctx,
  type Id,
} from "../common/shared.ts";
import { BEN_LOCATIONS, BEN_SPECIMENS, CUTTING_SERIES, seriesFor } from "./ben-plants.ts";
import { seedCareProfiles, seedTreatments } from "./ben-care.ts";
import { seedBenEquipment } from "./ben-gear.ts";

const PHOTOS = 8; // the first specimens get a placeholder photo on their latest measurement

/** Ben (`test2`): the large collection with lamps, zones, locations, measurements, photos, own care profiles, treatments. */
export async function seedBen(
  ctx: Ctx,
  withPhotos: boolean,
): Promise<{ specimens: Map<string, Id> }> {
  const { api, sub } = ctx;
  await setUp(ctx, "Ben", "many");
  const zones = await ensureZones(ctx);
  const locations = await ensureLocations(ctx, zones, BEN_LOCATIONS);
  const species = await speciesByLatin(ctx, [...new Set(BEN_SPECIMENS.map((s) => s.latin))]);
  const specimens = await ensureSpecimens(ctx, species, locations, BEN_SPECIMENS);

  let index = 0;
  const adults = BEN_SPECIMENS.filter((s) => !s.status);
  let photos = 0;
  for (const def of adults) {
    const id = specimens.get(def.marker ? `${def.latin}|${def.marker}` : def.latin);
    if (!id) continue;
    await ensureMeasurements(ctx, id, seriesFor(index));
    if (withPhotos && photos < PHOTOS) {
      const last = await api.ok(sub, "GET", `/specimens/${id}/measurements?timeZone=${TZ}`);
      if (last["last"] && !last["last"].photo) {
        const reply = await api.photo(sub, id, daysAgo(3), await placeholderPhoto(index));
        if (reply.status >= 300)
          throw new Error(`photo upload -> ${reply.status} ${JSON.stringify(reply.body)}`);
      }
      photos += 1;
    }
    index += 1;
  }
  for (const [key, series] of Object.entries(CUTTING_SERIES)) {
    const id = specimens.get(key);
    if (id) await ensureMeasurements(ctx, id, series);
  }
  await seedCareProfiles(ctx, species, locations);
  const pick = (...latin: string[]) =>
    latin.map((l) => specimens.get(l)).filter((x): x is Id => !!x);
  await seedTreatments(
    ctx,
    pick("Ficus benjamina", "Schefflera arboricola", "Hoya carnosa", "Citrus limon"),
  );
  await seedBenEquipment(ctx, zones);
  await ensureWishes(ctx, [
    { name: "Anthurium clarinervium", zone: zones.get("Lampe 3") ?? "" },
    { name: "Monstera adansonii", zone: zones.get("Lampe 3") ?? "" },
  ]);
  // The cutting offered to friends (swap) later in `links`; sharing it with friends is the precondition (US-SOZ-08).
  await shareSpecimens(ctx, pick("Pilea peperomioides|Ableger", "Monstera deliciosa|Ableger"));
  ctx.log(`Ben: ${specimens.size} specimens, ${photos} with photo`);
  return { specimens };
}
