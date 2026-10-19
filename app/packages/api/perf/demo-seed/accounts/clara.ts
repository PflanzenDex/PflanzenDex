import {
  daysAgo,
  ensureEquipment,
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
  type SpecimenDef,
} from "./common/shared.ts";

// Clara (`test3`): friend of both. Cuttings to swap, a wishlist with some wishes visible to friends, equipment with a
// lamp and consumables, care rhythm (watering today, a pause), a correction proposal for the catalog.
const PLANTS: readonly SpecimenDef[] = [
  { latin: "Hoya carnosa", location: "Fensterbank", caughtDaysAgo: 300 },
  { latin: "Tradescantia zebrina", location: "Fensterbank", caughtDaysAgo: 200 },
  { latin: "Peperomia obtusifolia", location: "Regal", caughtDaysAgo: 90 },
  { latin: "Chlorophytum comosum", location: "Regal", caughtDaysAgo: 500 },
  {
    latin: "Hoya carnosa",
    marker: "Ableger",
    status: "cutting",
    location: "Stecklingsglas",
    caughtDaysAgo: 12,
  },
  {
    latin: "Tradescantia zebrina",
    marker: "Ableger",
    status: "cutting",
    location: "Stecklingsglas",
    caughtDaysAgo: 9,
  },
  {
    latin: "Chlorophytum comosum",
    marker: "Kindel",
    status: "cutting",
    location: "Stecklingsglas",
    caughtDaysAgo: 6,
  },
];

const WISHES = [
  "Philodendron hederaceum",
  "Alocasia amazonica",
  "Calathea orbifolia",
  "Ceropegia woodii",
  "Begonia maculata",
  "Platycerium bifurcatum",
] as const;
const ADULTS = [
  "Hoya carnosa",
  "Tradescantia zebrina",
  "Peperomia obtusifolia",
  "Chlorophytum comosum",
];
const CLARA_VISIBLE_WISHES = ["Alocasia amazonica", "Ceropegia woodii", "Begonia maculata"];

async function seedWishes(ctx: Ctx, zone: Id): Promise<void> {
  await ensureWishes(
    ctx,
    WISHES.map((name) => ({ name, zone })),
  );
  const wishes = await ensureWishes(ctx, []);
  for (const name of CLARA_VISIBLE_WISHES) {
    const id = wishes.get(name);
    if (id) await ctx.api.ok(ctx.sub, "POST", `/wishes/${id}/visibility`, { visible: true });
  }
}

async function seedGear(ctx: Ctx, zone: Id): Promise<void> {
  const { api, sub } = ctx;
  const after = (path: string, body: unknown) => async (id: Id) => {
    await api.ok(sub, "POST", `/equipment/${id}/${path}`, body);
  };
  await ensureEquipment(ctx, [
    {
      type: "Lamp",
      name: "Pflanzenlampe Fensterbank",
      fields: { lightZoneId: zone },
      after: after("lamp-data", { powerW: 24, luxStatement: 12000 }),
    },
    { type: "Substrate", name: "Hoya-Erde", after: after("supply", { supply: "low" }) },
    { type: "Fertilizer", name: "Orchideendünger" },
  ]);
}

/** Care rhythm (today's watering, the log takes today only; a holiday pause, US-ACH-04) and a catalog correction. */
async function seedRhythmAndCorrection(
  ctx: Ctx,
  adults: Id[],
  monstera: Id | undefined,
): Promise<void> {
  const { api, sub } = ctx;
  await api.ok(sub, "POST", "/watering", { specimenIds: adults, timeZone: TZ });
  const rhythm = await api.ok(sub, "GET", `/achievements/rhythm?timeZone=${TZ}`);
  if (!(rhythm["pauses"] as unknown[] | undefined)?.length)
    await api.ok(sub, "POST", "/achievements/rhythm/pauses", {
      from: daysAgo(60),
      until: daysAgo(50),
    });
  // A correction proposal for the shared catalog lands in the review pile (US-BES-13).
  const mine = await api.ok(sub, "GET", "/catalog/corrections/mine");
  if (!JSON.stringify(mine).includes("Fensterblatt (Monstera)"))
    await api.ok(sub, "POST", "/catalog/corrections", {
      speciesId: monstera,
      field: "germanName",
      value: "Fensterblatt (Monstera)",
      reason: "So steht es auf den meisten Pflanzenetiketten.",
    });
}

export async function seedClara(ctx: Ctx): Promise<{ specimens: Map<string, Id> }> {
  await setUp(ctx, "Clara", "many");
  const zones = await ensureZones(ctx);
  const locations = await ensureLocations(ctx, zones, [
    { name: "Fensterbank", zone: "Lampe 3" },
    { name: "Regal", zone: "Lampe 2" },
    { name: "Stecklingsglas", zone: "Lampe 1" },
  ]);
  const latin = [...new Set([...PLANTS.map((p) => p.latin), "Monstera deliciosa"])];
  const species = await speciesByLatin(ctx, latin);
  const specimens = await ensureSpecimens(ctx, species, locations, PLANTS);
  const hoya = specimens.get("Hoya carnosa");
  if (hoya)
    await ensureMeasurements(ctx, hoya, [
      [50, 22],
      [36, 23.5],
      [22, 25],
      [8, 27],
    ]);
  const bright = zones.get("Lampe 3") ?? "";
  await seedWishes(ctx, bright);
  await seedGear(ctx, bright);
  const adults = ADULTS.map((l) => specimens.get(l)).filter((x): x is Id => !!x);
  await seedRhythmAndCorrection(ctx, adults, species.get("Monstera deliciosa"));
  await shareSpecimens(ctx, adults);
  ctx.log(`Clara: ${specimens.size} specimens, ${WISHES.length} wishes`);
  return { specimens };
}
