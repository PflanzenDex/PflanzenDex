import { appError, evaluateAchievements, localToday, yearInReview } from "@pflanzendex/core";
import { errorBody, type Ctx } from "../../kernel";
import { readAchievementFacts, type FactSources } from "../facts";
import type { Keeper } from "../news";

/** The first year the view offers (assumption); the keeper's data cannot be older than the app. */
export const YEAR_RANGE = { min: 2000 } as const;

/** Parses `?year=`; absent = the running year in the keeper's time zone, a future or implausible year = `null`. */
export function parseYear(raw: string | undefined, today: string): number | null {
  const current = Number(today.slice(0, 4));
  if (raw === undefined) return current;
  if (!/^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return year >= YEAR_RANGE.min && year <= current ? year : null;
}

const photoUrl = (specimenId: string, measurementId: string) =>
  `/specimens/${specimenId}/measurements/${measurementId}/photo`;

/**
 * The year in review of the keeper (US-ACH-07): counted facts of one calendar year, derived on every request from the
 * own data (FR-ACH-02, P-04) and private by default (P-05). Nothing is stored and nothing is compared (FR-ACH-04).
 * One request per specimen for the measurement values (starting value, small collections).
 */
export async function achievementsYear(src: FactSources, who: Keeper, year: number) {
  const { userId, timeZone, now } = who;
  const { facts } = await readAchievementFacts(src, userId, timeZone);
  const earned = evaluateAchievements(facts, localToday(now, timeZone));
  const measurements = (
    await Promise.all(
      facts.specimens.map(async (s) =>
        (await src.measurements.list(userId, s.id)).map((m) => ({
          id: m.id,
          specimenId: s.id,
          date: m.date,
          value: m.value,
          quality: m.quality,
          hasPhoto: m.photo !== null,
        })),
      ),
    )
  ).flat();
  const review = yearInReview({
    year,
    specimens: facts.specimens,
    measurements,
    treatmentCourses: facts.treatmentCourses.map((c) => ({ doneOn: c.dates.map((d) => d.doneOn) })),
    handoverDates: facts.handovers.map((h) => h.date),
    earned: earned.filter((s) => s.earned),
  });
  const withUrl = (p: {
    specimenId: string;
    first: { measurementId: string };
    last: { measurementId: string };
  }) => ({
    first: photoUrl(p.specimenId, p.first.measurementId),
    last: photoUrl(p.specimenId, p.last.measurementId),
  });
  return {
    calmMode: false as const,
    ...review,
    photos: review.photos ? { ...review.photos, urls: withUrl(review.photos) } : null,
  };
}

/** The route handler of `GET /achievements/year`: a future or malformed `year` is `400 input.invalid` (P-03 style input check). */
export async function achievementsYearRoute(src: FactSources, who: Keeper, c: Ctx) {
  const year = parseYear(c.req.query("year"), localToday(who.now, who.timeZone));
  if (year === null) {
    const details = [{ field: "year", code: "input.invalid" as const }];
    return c.json(errorBody(appError("input.invalid", { details })), 400);
  }
  return achievementsYear(src, who, year);
}
