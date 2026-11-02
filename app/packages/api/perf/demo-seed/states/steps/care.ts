import {
  daysAgo,
  ensureSpecimens,
  speciesByLatin,
  TZ,
  type Ctx,
  type Id,
} from "../../accounts/common/shared.ts";
import { locationsOf, specimenOf } from "../helpers.ts";

// Measurements, treatments, catch dates and locations beyond the base seed (US-WAC-01 to US-WAC-05, US-BEH-02,
// US-BES-08, US-BES-11, US-LIC-05, US-ACH-06). Each step looks at the current state first.

type Measurement = { date: string; value: number; quality: string };

const seriesOf = async (ctx: Ctx, specimen: Id): Promise<Measurement[]> =>
  ((await ctx.api.ok(ctx.sub, "GET", `/specimens/${specimen}/measurements?timeZone=${TZ}`))[
    "measurements"
  ] ?? []) as Measurement[];

const record = (ctx: Ctx, specimen: Id, body: Record<string, unknown>) =>
  ctx.api.ok(ctx.sub, "POST", `/specimens/${specimen}/measurements`, { timeZone: TZ, ...body });

/** Ben's Ficus lyrata is etiolated today: "Vergeilt" on Heute, the hollow mark in the history (US-WAC-02). */
export async function etiolatedToday(ben: Ctx): Promise<void> {
  const ficus = await specimenOf(ben, "Ficus lyrata");
  const last = (await seriesOf(ben, ficus))[0];
  if (last?.date === daysAgo(0) && last.quality === "etiolated") return;
  await record(ben, ficus, {
    date: daysAgo(0),
    value: 22,
    quality: "etiolated",
    note: "Lange Triebe, helle Blätter mit großem Abstand.",
  });
}

/** Clara's Hoya: two older measurements, so the series spans more than 90 days (growth moment, US-ACH-05). */
export async function longSeries(clara: Ctx): Promise<void> {
  const hoya = await specimenOf(clara, "Hoya carnosa");
  const have = (await seriesOf(clara, hoya)).map((m) => m.date);
  for (const [days, value] of [
    [120, 16],
    [96, 18],
  ] as const)
    if (!have.includes(daysAgo(days))) await record(clara, hoya, { date: daysAgo(days), value });
}

/** A running treatment that is due today (US-BEH-02): "Heute fällig". Skipped when the reason is open already. */
export async function treatmentDueToday(ben: Ctx): Promise<void> {
  const open = JSON.stringify(await ben.api.ok(ben.sub, "GET", `/treatments?timeZone=${TZ}`));
  if (open.includes("Spinnmilben")) return;
  await ben.api.ok(ben.sub, "POST", "/treatments", {
    specimenIds: [await specimenOf(ben, "Syngonium podophyllum")],
    reason: "Spinnmilben",
    agent: "Neemöl",
    date: daysAgo(0),
    count: 2,
    intervalDays: 7,
  });
}

/**
 * Ben's Aloe vera "Zweite" was caught a year ago: the anniversary entry "ist 1 Jahr bei dir" shows on that day
 * (US-ACH-06). The catch date is corrected through the operation of US-BES-11.
 */
export async function anniversary(ben: Ctx): Promise<void> {
  const aloe = await specimenOf(ben, "Aloe vera", "Zweite");
  await ben.api.ok(ben.sub, "POST", `/specimens/${aloe}/catch-date`, {
    catchDate: daysAgo(365),
    timeZone: TZ,
  });
}

/**
 * Locations without a light zone (US-LIC-05, FR-LIC-...): "Dachboden" has none, and a Sansevieria stands there, so the
 * group "Zone unbekannt" shows in "Nach Standort" and the hint lists the location.
 */
export async function locationWithoutZone(ben: Ctx): Promise<void> {
  if (!(await locationsOf(ben)).has("Dachboden"))
    await ben.api.ok(ben.sub, "POST", "/locations", { name: "Dachboden", kind: "indoor" });
  const attic = (await locationsOf(ben)).get("Dachboden");
  const sansevieria = await specimenOf(ben, "Sansevieria trifasciata", "Klein");
  await ben.api.ok(ben.sub, "POST", `/specimens/${sansevieria}/location`, { locationId: attic });
}

/** A received-like specimen without any location: "Angaben fehlen" on Heute (US-BES-08). */
export async function specimenWithoutLocation(clara: Ctx): Promise<void> {
  const latin = "Yucca elephantipes";
  await ensureSpecimens(clara, await speciesByLatin(clara, [latin]), await locationsOf(clara), [
    { latin, caughtDaysAgo: 2 },
  ]);
}
