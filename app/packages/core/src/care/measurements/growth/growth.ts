import type { MeasurementRow } from "../types";

/** What the course says about success: etiolated growth never counts (US-WAC-04). */
export type GrowthSignal = "etiolated" | "success";

export type Trend = "faster" | "slower" | "stable";

/** Rate and trend of a specimen's own course (US-WAC-03). `null` means "unknown", never a guess (P-08). */
export interface GrowthTrend {
  /** Number of measurements the evaluation looked at. */
  readonly count: number;
  /** Overall rate in cm/year between the first and the last measurement; `null` below two usable measurements. */
  readonly ratePerYear: number | null;
  /** Last interval rate against the mean of the previous ones; `null` below three usable measurements. */
  readonly trend: Trend | null;
  /**
   * `etiolated` if the last measurement is rated etiolated, whatever the rate; `success` only for a faster trend
   * together with a healthy last measurement; otherwise `null` (US-WAC-04).
   */
  readonly signal: GrowthSignal | null;
}

/**
 * Central defaults of the growth evaluation (FR-WAC-03). Assumption, decided by the PO: a last interval rate more than
 * 10 % above or below the mean of the previous ones is faster or slower. It is one place in the logic, not a stored or
 * per-account value; callers may pass another tolerance to `growthTrend` (tests, later tuning).
 */
export const GROWTH_DEFAULTS = { trendTolerance: 0.1 } as const;

/** An option the caller passes is used only if it is a usable non-negative number. */
const usable = (tolerance: number | undefined): number =>
  tolerance !== undefined && Number.isFinite(tolerance) && tolerance >= 0
    ? tolerance
    : GROWTH_DEFAULTS.trendTolerance;
const MS_PER_DAY = 86_400_000;

/** Whole days between two calendar dates `YYYY-MM-DD` (NFR-08: no time zone involved). */
function daysBetween(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, mo, day] = d.split("-").map(Number);
    return Date.UTC(y ?? 0, (mo ?? 1) - 1, day ?? 1);
  };
  return Math.round((ms(to) - ms(from)) / MS_PER_DAY);
}

type Point = Pick<MeasurementRow, "date" | "value"> & Partial<Pick<MeasurementRow, "quality">>;

function classify(last: number, previous: readonly number[], tolerance: number): Trend {
  const mean = previous.reduce((a, b) => a + b, 0) / previous.length;
  if (mean === 0) return "stable";
  const deviation = (last - mean) / Math.abs(mean);
  if (deviation > tolerance) return "faster";
  if (deviation < -tolerance) return "slower";
  return "stable";
}

function sortByDate(points: readonly Point[]): Point[] {
  return points
    .map((p, index) => ({ p, index }))
    .sort((a, b) => a.p.date.localeCompare(b.p.date) || a.index - b.index)
    .map((x) => x.p);
}

/** Rates per day of every interval of positive length; same-day or reversed intervals are skipped. */
function intervalRates(sorted: readonly Point[]): number[] {
  const rates: number[] = [];
  sorted.forEach((b, k) => {
    const a = sorted[k - 1];
    const days = a ? daysBetween(a.date, b.date) : 0;
    if (a && days > 0) rates.push((b.value - a.value) / days);
  });
  return rates;
}

function overallRate(first: Point, last: Point): number | null {
  const days = daysBetween(first.date, last.date);
  return days > 0 ? ((last.value - first.value) / days) * 365 : null;
}

/** The last measurement's quality overrides the trend; a missing quality counts as healthy (US-WAC-02). */
function signalOf(last: Point, trend: Trend | null): GrowthSignal | null {
  if (last.quality === "etiolated") return "etiolated";
  return trend === "faster" ? "success" : null;
}

/**
 * Derives overall rate and trend from the measurements in any order (sorted by date first). Intervals of zero or
 * negative length are skipped, so two measurements on the same day yield no rate. The last measurement's etiolation
 * rating overrides the signal (US-WAC-04). Derived on demand, never stored (P-01).
 */
export function growthTrend(
  measurements: readonly Point[],
  options: { readonly tolerance?: number } = {},
): GrowthTrend {
  const sorted = sortByDate(measurements);
  const [first, last] = [sorted[0], sorted[sorted.length - 1]];
  const count = sorted.length;
  if (!first || !last) return { count, ratePerYear: null, trend: null, signal: null };
  if (count < 2) return { count, ratePerYear: null, trend: null, signal: signalOf(last, null) };
  const rates = intervalRates(sorted);
  const latest = rates[rates.length - 1];
  const trend =
    rates.length >= 2 && latest !== undefined
      ? classify(latest, rates.slice(0, -1), usable(options.tolerance))
      : null;
  return { count, ratePerYear: overallRate(first, last), trend, signal: signalOf(last, trend) };
}
