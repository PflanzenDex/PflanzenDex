import {
  ensureLocations,
  ensureMeasurements,
  ensureSpecimens,
  ensureZones,
  setUp,
  shareSpecimens,
  speciesByLatin,
  type Ctx,
} from "./common/shared.ts";

// Anna (`test`): a beginner with three houseplants, style "few", one location (Zuhause), calm mode on (no
// achievement pop-ups; the realm has only three users, so calm mode lives here, see docs/guides/reference/app.md).
const PLANTS = ["Monstera deliciosa", "Epipremnum aureum", "Sansevieria trifasciata"] as const;

export async function seedAnna(ctx: Ctx): Promise<{ specimens: Map<string, string> }> {
  const { api, sub } = ctx;
  await setUp(ctx, "Anna", "few");
  const zones = await ensureZones(ctx);
  const locations = await ensureLocations(ctx, zones, [{ name: "Zuhause", zone: "Zone 2" }]);
  const species = await speciesByLatin(ctx, PLANTS);
  const specimens = await ensureSpecimens(
    ctx,
    species,
    locations,
    PLANTS.map((latin, i) => ({ latin, location: "Zuhause", caughtDaysAgo: 120 - i * 30 })),
  );
  const monstera = specimens.get("Monstera deliciosa");
  if (monstera)
    await ensureMeasurements(ctx, monstera, [
      [42, 35],
      [28, 36.5],
      [14, 38],
      [3, 39.5],
    ]);
  await shareSpecimens(ctx, [monstera ?? ""].filter(Boolean));
  await api.ok(sub, "PUT", "/achievements/settings/calm-mode", { calmMode: true });
  ctx.log("Anna: 3 plants, calm mode on");
  return { specimens };
}
