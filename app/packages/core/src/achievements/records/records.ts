// Personal records and growth moments (US-ACH-05): a specimen is compared with its own history only, never with other
// specimens, species averages or other keepers (P-08, FR-ACH-04). Etiolated growth never counts as success (US-WAC-04,
// FR-ACH-05). Pure; the trend of the care module is passed in because this module imports nothing but the kernel.

/** Starting value (assumption): below 90 days a short interval could produce an extreme yearly rate. */
export const RECORD_LIMITS = { minSpanDays: 90 } as const;

export interface RecordPoint {
  readonly id: string;
  /** Local calendar date `YYYY-MM-DD` (NFR-08). */
  readonly date: string;
  /** In the unit of the growth measure of the species (cm). */
  readonly value: number;
  readonly quality: "healthy" | "etiolated";
}

export type GrowthMoment =
  /** Fewer than 2 measurements or a span below the limit: unknown, never a record (P-08). */
  | { readonly kind: "unknown" }
  /** Etiolated, slower or without growth: no moment, no record, no achievement. */
  | { readonly kind: "none" }
  | {
      readonly kind: "moment";
      /** The date of the first measurement ("since"). */
      readonly since: string;
      /** Growth since the first measurement, in the unit of the measure. */
      readonly growth: number;
      readonly ratePerYear: number;
      /** Set when the yearly rate beats the specimen's own earlier best. */
      readonly record: { readonly ratePerYear: number } | null;
    };

export interface GrowthMoments {
  /** The moment of the newest measurement (the measurement result). */
  readonly latest: GrowthMoment;
  /** The ids of the measurements that set a personal record (the history of the specimen). */
  readonly records: readonly string[];
}

const MS_PER_DAY = 86_400_000;
const day = (d: string): number => {
  const [y, m, dd] = d.split("-").map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, dd ?? 1) / MS_PER_DAY;
};

/** Cm per year from the first measurement to `list[k]`; `null` below the span limit. */
function rateAt(list: readonly RecordPoint[], k: number): number | null {
  const first = list[0] as RecordPoint;
  const at = list[k] as RecordPoint;
  const days = day(at.date) - day(first.date);
  return days >= RECORD_LIMITS.minSpanDays ? ((at.value - first.value) / days) * 365 : null;
}

const sortByDate = (points: readonly RecordPoint[]): RecordPoint[] =>
  points
    .map((point, i) => ({ point, i }))
    .sort((a, b) => a.point.date.localeCompare(b.point.date) || a.i - b.i)
    .map((x) => x.point);

/** The moment of `list[k]` given the earlier best rate (`null` = none yet). */
function momentAt(
  list: readonly RecordPoint[],
  k: number,
  rates: { readonly rate: number; readonly best: number | null },
  trend: string | null,
): GrowthMoment {
  const { rate, best } = rates;
  const first = list[0] as RecordPoint;
  const growth = (list[k] as RecordPoint).value - first.value;
  if ((list[k] as RecordPoint).quality !== "healthy" || growth <= 0 || trend === "slower") {
    return { kind: "none" };
  }
  const record = best !== null && rate > best ? { ratePerYear: rate } : null;
  return { kind: "moment", since: first.date, growth, ratePerYear: rate, record };
}

/**
 * The growth moment of every measurement of one specimen, in date order. A moment needs a usable rate, a healthy
 * measurement, a trend that is not "slower" (passed in as `trendOf`, evaluated on the measurements up to that point)
 * and real growth. A record needs an earlier healthy rate to beat: the first usable rate is a moment, not a record
 * (assumption, decided by the PO).
 */
export function growthMoments(
  points: readonly RecordPoint[],
  trendOf: (upTo: readonly RecordPoint[]) => string | null,
): GrowthMoments {
  const list = sortByDate(points);
  const records: string[] = [];
  let best: number | null = null;
  let latest: GrowthMoment = { kind: "unknown" };
  for (let k = 1; k < list.length; k++) {
    const rate = rateAt(list, k);
    if (rate === null) {
      latest = { kind: "unknown" };
      continue;
    }
    latest = momentAt(list, k, { rate, best }, trendOf(list.slice(0, k + 1)));
    if (latest.kind === "moment" && latest.record) records.push((list[k] as RecordPoint).id);
    if ((list[k] as RecordPoint).quality === "healthy" && (best === null || rate > best))
      best = rate;
  }
  if (list.length < 2) latest = { kind: "unknown" };
  return { latest, records };
}
