import { localToday } from "@pflanzendex/core";
import { list, object, text, type Api, type Body } from "./query-count-api-test-helpers";

// US-QG-07: the seed writes through the routes the app uses (validating operations, P-03). Every write goes through
// `ok`, which throws on a rejected write (NFR-12), so a count is never taken from a half-seeded account.
export const TZ = "Europe/Berlin";
const DAY_MS = 86_400_000;
const ALPHABET = 26;
const FIRST_LETTER = "a".charCodeAt(0);
// The shape of the seed (starting values, assumption): small enough to run in seconds, large enough to show an N+1.
export const EVERY_SECOND = 2;
const EVERY_THIRD = 3;
const EVERY_FOURTH = 4;
const SPECIMENS_PER_LAMP = 5;
const CATCH_DAYS_AGO = 200;
const TREATMENT_DAYS_AGO = 2;
const MEASUREMENTS = [
  { daysAgo: 13, value: 10 },
  { daysAgo: 2, value: 12 },
] as const;

/** The account being seeded for one run: its API and id, and the tag that keeps its names apart (catalog names are unique). */
export type Seat = { api: Api; sub: string; run: string; tag: string };
/** The species and specimen ids of one account, in seed order. */
export type Grown = { specimens: string[]; species: string[] };
/** The ids that the endpoint paths take (see endpoints.ts). */
export type SeedIds = { specimen: string; species: string; friend: string };

/** A calendar date `days` before today in the keeper's time zone (NFR-08). The app runs on the real clock: the friend
 * code expiry is checked against the database clock (migration 0026), so a fixed app clock would refuse invitations. */
export const dayOffset = (days: number): string =>
  localToday(new Date(Date.now() - days * DAY_MS), TZ);

/** Two letters per index: catalog names are letters only, and the names of one run stay distinct. */
export const letters = (i: number): string =>
  String.fromCharCode(FIRST_LETTER + (i % ALPHABET)) +
  String.fromCharCode(FIRST_LETTER + (Math.floor(i / ALPHABET) % ALPHABET));

/** A catalog species of the run; `tag` tells the accounts apart. */
export function speciesBody(run: string, tag: string, i: number): Body {
  return {
    latinName: `Qcgen${run}${tag}${letters(i)} test`,
    germanName: `Qc name ${run}${tag}${letters(i)}`,
    difficulty: 2,
    standardLevel: 3,
    lightDemandLux: 40000,
    growthMeasure: "rosette_diameter",
    etiolationSigns: "Rosette stretches out.",
    successCriteria: "Dense, flat rosette.",
    source: "Test data of the query-count gate (US-QG-07)",
  };
}

export const profile = (displayName: string): Body => ({
  displayName,
  timeZone: TZ,
  everythingPrivate: false,
  noRecommendations: false,
  notifications: {},
});

/** One equipment item of the account; returns its id. A lamp needs its light zone, every other type none. */
export async function equipmentOf(
  seat: Seat,
  type: string,
  name: string,
  lightZoneId?: string,
): Promise<string> {
  const made = await seat.api.ok(seat.sub, "POST", "/equipment", {
    type,
    name,
    ...(lightZoneId === undefined ? {} : { lightZoneId }),
  });
  return text(object(made, "equipment"), "id");
}

async function seedSpecimen(
  seat: Seat,
  i: number,
  zoneId: string,
): Promise<{ species: string; specimen: string }> {
  const { api, sub, run, tag } = seat;
  const species = await api.ok(sub, "POST", "/species", {
    ...speciesBody(run, tag, i),
    dormancyFrom: "11-01",
    dormancyUntil: "02-28",
  });
  const location = await api.ok(sub, "POST", "/locations", {
    name: `Shelf ${run} ${letters(i)}`,
    kind: "indoor",
    lightZoneId: zoneId,
  });
  const specimen = await api.ok(sub, "POST", "/specimens", {
    speciesId: text(species, "id"),
    locationId: text(location, "id"),
    marker: `pot ${letters(i)}`,
    timeZone: TZ,
    catchDate: dayOffset(CATCH_DAYS_AGO + i),
  });
  const specimenId = text(specimen, "id");
  for (const { daysAgo, value } of MEASUREMENTS)
    await api.ok(sub, "POST", `/specimens/${specimenId}/measurements`, {
      timeZone: TZ,
      value,
      date: dayOffset(daysAgo),
    });
  await api.ok(sub, "POST", "/treatments", {
    specimenIds: [specimenId],
    reason: "Mealybugs",
    date: dayOffset(TREATMENT_DAYS_AGO),
  });
  return { species: text(species, "id"), specimen: specimenId };
}

/**
 * The keeper's own rows: profile, zones, and per specimen its own species (with dormancy dates), a location, the
 * specimen with two measurements and an open treatment. These feed the Today list, cards, achievements and growth.
 */
export async function seedKeeper(seat: Seat, n: number): Promise<Grown> {
  const { api, sub, run, tag } = seat;
  await api.ok(sub, "PUT", "/account/profile", profile(`Keeper ${run}${tag}`));
  await api.ok(sub, "PUT", "/onboarding/style", { style: "many", timeZone: TZ });
  await api.ok(sub, "POST", "/light-zones/defaults");
  const zones = list(await api.ok(sub, "GET", "/light-zones"), "zones").map((z) => text(z, "id"));
  const grown: Grown = { specimens: [], species: [] };
  for (let i = 0; i < n; i++) {
    const made = await seedSpecimen(seat, i, zones[i % zones.length] as string);
    grown.species.push(made.species);
    grown.specimens.push(made.specimen);
  }
  return grown;
}

/**
 * Sharing, offers, care profiles, completed treatments, watering and a rhythm pause on the keeper's specimens. Every
 * second specimen is shared with friends, every fourth is offered (the treatment is open, so the keeper confirms it).
 */
export async function seedCare(seat: Seat, g: Grown): Promise<void> {
  const { api, sub } = seat;
  for (const [i, specimenId] of g.specimens.entries()) {
    if (i % EVERY_SECOND === 0) {
      await api.ok(sub, "PUT", `/sharing/specimens/${specimenId}`, { share: "friends" });
      await api.ok(sub, "PUT", `/care-profiles/${g.species[i]}`, {
        dormancyFrom: "12-01",
        dormancyUntil: "03-01",
      });
    }
    if (i % EVERY_FOURTH === 0)
      await api.ok(sub, "POST", "/offers", {
        specimenId,
        type: "cutting",
        mode: "swap",
        confirmTreatment: true,
        note: "Cutting for a swap.",
      });
  }
  const open = list(await api.ok(sub, "GET", `/treatments?timeZone=${TZ}`), "treatments");
  for (const [i, treatment] of open.entries())
    if (i % EVERY_THIRD === 0)
      await api.ok(sub, "POST", `/treatments/${text(treatment, "id")}/complete`, { timeZone: TZ });
  await api.ok(sub, "POST", "/watering", { specimenIds: g.specimens, timeZone: TZ });
  await api.ok(sub, "POST", "/achievements/rhythm/pauses", {
    from: dayOffset(60),
    until: dayOffset(50),
  });
}

/** Equipment of every kind: one lamp per five specimens, the timer shared with friends. */
export async function seedGear(seat: Seat, n: number): Promise<void> {
  const { api, sub, run } = seat;
  const zones = list(await api.ok(sub, "GET", "/light-zones"), "zones").map((z) => text(z, "id"));
  const zone = zones[0];
  if (zone === undefined) throw new Error("seed: the keeper has no light zone for its lamps");
  for (let i = 0; i < Math.max(1, Math.floor(n / SPECIMENS_PER_LAMP)); i++) {
    const lamp = await equipmentOf(seat, "Lamp", `Lamp ${run} ${letters(i)}`, zone);
    await api.ok(sub, "POST", `/equipment/${lamp}/lamp-data`, { powerW: 30, luxStatement: 20000 });
  }
  const timer = await equipmentOf(seat, "Timer", `Timer ${run}`);
  await api.ok(sub, "PUT", `/equipment/${timer}/sharing`, { share: "friends" });
  await equipmentOf(seat, "Sensor", `Sensor ${run}`);
  const agent = await equipmentOf(seat, "Plant agent", `Agent ${run}`);
  await api.ok(sub, "POST", `/equipment/${agent}/agent-link`, { agentLink: "Neem oil" });
  const substrate = await equipmentOf(seat, "Substrate", `Substrate ${run}`);
  await api.ok(sub, "POST", `/equipment/${substrate}/supply`, { supply: "low" });
}

/** Wishes by name; the first one is visible to friends (the match deck and the wish lists read them). */
export async function seedWishes(seat: Seat, names: readonly string[]): Promise<void> {
  const { api, sub } = seat;
  for (const [i, name] of names.entries()) {
    const wish = object(await api.ok(sub, "POST", "/wishes", { name }), "wish");
    if (i === 0)
      await api.ok(sub, "POST", `/wishes/${text(wish, "id")}/visibility`, { visible: true });
  }
}
