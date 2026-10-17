// Year in review (US-ACH-07): counted facts of one calendar year from the keeper's own data, derived on every request
// and never stored (FR-ACH-02). No percentage, no rating, no comparison with others or with an average (FR-ACH-04,
// P-08); two years are two plain sets of numbers. Etiolated growth never counts (US-WAC-04). Pure; dates are local
// calendar dates (NFR-08).
import { RECORD_LIMITS } from "./records";

export interface YearSpecimen {
  readonly id: string;
  readonly name: string;
  /** Local calendar date of the catch; `null` = unknown (US-POK-07). */
  readonly caughtOn: string | null;
  /** Local calendar date a cutting was repotted into its own plant (US-BES-04); `null` = no such event. */
  readonly cuttingRootedOn: string | null;
}

export interface YearMeasurement {
  readonly id: string;
  readonly specimenId: string;
  readonly date: string;
  /** In the unit of the growth measure (cm). */
  readonly value: number;
  readonly quality: "healthy" | "etiolated";
  readonly hasPhoto: boolean;
}

export interface YearInput {
  readonly year: number;
  readonly specimens: readonly YearSpecimen[];
  readonly measurements: readonly YearMeasurement[];
  /** Per course: the dates ticked off, `null` = open. */
  readonly treatmentCourses: readonly { readonly doneOn: readonly (string | null)[] }[];
  readonly handoverDates: readonly string[];
  readonly earned: readonly { readonly id: string; readonly earnedOn: string | null }[];
}

export interface YearPhotoPair {
  readonly specimenId: string;
  readonly name: string;
  readonly first: { readonly measurementId: string; readonly date: string };
  readonly last: { readonly measurementId: string; readonly date: string };
}

export interface YearGrowth {
  readonly specimenId: string;
  readonly name: string;
  readonly from: string;
  readonly until: string;
  readonly growth: number;
  readonly ratePerYear: number;
}

export interface YearInReview {
  readonly year: number;
  /** The counted facts; each is the number of events dated in the year (the basis is named by the UI per key). */
  readonly counts: {
    readonly speciesCaught: number;
    readonly cuttingsRooted: number;
    readonly treatmentsCompleted: number;
    readonly measurements: number;
    readonly handovers: number;
    readonly achievementsEarned: number;
  };
  /** `null` = unknown: fewer than two healthy measurements, a span below the limit or no growth (P-08). */
  readonly growth: YearGrowth | null;
  /** `null` = unknown: no specimen has two photos in the year. */
  readonly photos: YearPhotoPair | null;
  /** False when the year holds no event at all: the view then says what would fill it (P-09). */
  readonly hasData: boolean;
}

const MS_PER_DAY = 86_400_000;
const day = (d: string): number => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, dd ?? 1) / MS_PER_DAY;
};
const inYear = (date: string | null, year: number): boolean =>
  date !== null && date.startsWith(`${year}-`);
const byDate = <T extends { date: string }>(list: readonly T[]): T[] =>
  [...list].sort((a, b) => a.date.localeCompare(b.date));

/** A treatment course is completed in the year when every date is ticked off and the last tick falls in the year. */
function completedIn(course: { doneOn: readonly (string | null)[] }, year: number): boolean {
  const done = course.doneOn.filter((d): d is string => d !== null);
  if (done.length === 0 || done.length !== course.doneOn.length) return false;
  return inYear(
    done.reduce((a, b) => (a > b ? a : b)),
    year,
  );
}

/** Own yearly rate from the first to the last healthy measurement of the year; the best specimen wins. */
function bestGrowth(input: YearInput): YearGrowth | null {
  let best: YearGrowth | null = null;
  for (const s of input.specimens) {
    const list = byDate(
      input.measurements.filter(
        (m) => m.specimenId === s.id && m.quality === "healthy" && inYear(m.date, input.year),
      ),
    );
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) continue;
    const days = day(last.date) - day(first.date);
    const growth = last.value - first.value;
    if (days < RECORD_LIMITS.minSpanDays || growth <= 0) continue;
    const ratePerYear = (growth / days) * 365;
    if (best === null || ratePerYear > best.ratePerYear) {
      best = {
        specimenId: s.id,
        name: s.name,
        from: first.date,
        until: last.date,
        growth,
        ratePerYear,
      };
    }
  }
  return best;
}

/** First and last photo of the year of the specimen with the most photos in it (ties: first in the list). */
function photoPair(input: YearInput): YearPhotoPair | null {
  let best: { s: YearSpecimen; photos: YearMeasurement[] } | null = null;
  for (const s of input.specimens) {
    const photos = byDate(
      input.measurements.filter(
        (m) => m.specimenId === s.id && m.hasPhoto && inYear(m.date, input.year),
      ),
    );
    if (photos.length >= 2 && (best === null || photos.length > best.photos.length)) {
      best = { s, photos };
    }
  }
  if (!best) return null;
  const first = best.photos[0] as YearMeasurement;
  const last = best.photos[best.photos.length - 1] as YearMeasurement;
  return {
    specimenId: best.s.id,
    name: best.s.name,
    first: { measurementId: first.id, date: first.date },
    last: { measurementId: last.id, date: last.date },
  };
}

/** The year in review of one calendar year (US-ACH-07). */
export function yearInReview(input: YearInput): YearInReview {
  const { year } = input;
  const counts = {
    speciesCaught: input.specimens.filter((s) => inYear(s.caughtOn, year)).length,
    cuttingsRooted: input.specimens.filter((s) => inYear(s.cuttingRootedOn, year)).length,
    treatmentsCompleted: input.treatmentCourses.filter((c) => completedIn(c, year)).length,
    measurements: input.measurements.filter((m) => inYear(m.date, year)).length,
    handovers: input.handoverDates.filter((d) => inYear(d, year)).length,
    achievementsEarned: input.earned.filter((e) => inYear(e.earnedOn, year)).length,
  };
  return {
    year,
    counts,
    growth: bestGrowth(input),
    photos: photoPair(input),
    hasData: Object.values(counts).some((n) => n > 0),
  };
}
