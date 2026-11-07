// The repot plan of one plant (US-BES-19, FR-BES-27): pure, derived on every request and never stored (P-01). The inputs
// are plain data that the caller reads from the store, the care phase and the equipment; this module reads nothing.
import type { RepotSign } from "../repot/types";

/** Starting value, assumption (owner decision, 2026-11-07): a repot is due after 24 months without a cited interval. */
export const REPOT_INTERVAL_STARTING_MONTHS = 24;
/** The source a hint names when no cited source gives an interval (FR-BES-27, P-08). */
export const GENERAL_STARTING_VALUE = "general_starting_value";

const MONTHS_PER_YEAR = 12;
/** The care phase that calls for repotting in spring (`care/phases`, US-PHA-01); a name, compared as a value. */
const DORMANCY = "dormancy" satisfies PlanPhase;

/** A free pot as the plan lists it: the size is `null` when unknown (P-08). */
export interface PlanPot {
  readonly id: string;
  readonly name: string;
  readonly diameterCm: number | null;
}

/** The phase of the plant today; `null` when the phase is unknown (P-08). */
export type PlanPhase = "growth" | "dormancy" | null;

export interface RepotPlanInput {
  /** The keeper's local calendar day (NFR-08). */
  readonly today: string;
  /** A cutting is potted out (US-BES-04), not repotted: it gets no hint at all. */
  readonly cutting: boolean;
  /** The latest repot day; `null` = unknown (P-08), no time hint then. */
  readonly lastRepot: string | null;
  /** The observations ticked and not cleared yet (DM-BES-09). */
  readonly openSigns: readonly { readonly sign: RepotSign; readonly tickedOn: string }[];
  readonly phase: PlanPhase;
  /** The pot the plant sits in; `null` = no pot recorded, its size is unknown (P-08). */
  readonly currentPot: { readonly diameterCm: number | null } | null;
  readonly freePots: readonly PlanPot[];
  /** A repot interval a reviewer cited for the species, with its source; `null` = none cited (no catalog field yet). */
  readonly citedInterval: { readonly months: number; readonly source: string } | null;
}

export interface IntervalHint {
  readonly reason: "interval";
  /** Whole calendar months since the last repot (NFR-08). */
  readonly monthsAgo: number;
  /** `general_starting_value`, or the cited source of the interval. */
  readonly source: string;
}

export interface SignHint {
  readonly reason: RepotSign;
  readonly tickedOn: string;
  /** The keeper saw the observation; no catalog source stands behind it. */
  readonly source: "keeper_observation";
}

export type RepotHint = IntervalHint | SignHint;

export interface RepotPlan {
  readonly hints: readonly RepotHint[];
  readonly lastRepot: string | null;
  readonly phase: PlanPhase;
  /** Set only with hints: `spring` in dormancy, `phase_unknown` while the phase is unknown, none in growth. */
  readonly seasonAdvice: "spring" | "phase_unknown" | null;
  /** The current pot, as far as its size is known (the list of free pots is sorted by it). */
  readonly currentPot: { readonly diameterCm: number | null } | null;
  readonly freePots: readonly PlanPot[];
}

const splitDay = (day: string): number[] => day.split("-").map(Number);

/**
 * Whole calendar months from `from` to `to` (both `YYYY-MM-DD`): a month counts once its day of the month is reached.
 * Calendar arithmetic only, so no daylight-saving change or UTC date can shift it (NFR-08).
 */
export function wholeMonthsBetween(from: string, to: string): number {
  const [fromYear = 0, fromMonth = 0, fromDay = 0] = splitDay(from);
  const [toYear = 0, toMonth = 0, toDay = 0] = splitDay(to);
  const months = (toYear - fromYear) * MONTHS_PER_YEAR + (toMonth - fromMonth);
  return toDay < fromDay ? months - 1 : months;
}

const byName = (a: PlanPot, b: PlanPot) => a.name.localeCompare(b.name, "de");

/**
 * The free pots in the order of use (US-BES-19): with a known size of the current pot, the larger ones first, ascending
 * (the next size up), then the smaller ones, largest first; pots with an unknown size last. Without a known size of the
 * current pot every pot is listed by name, because the sizes cannot be compared (P-08).
 */
export function orderFreePots(pots: readonly PlanPot[], current: number | null): PlanPot[] {
  if (current === null) return [...pots].sort(byName);
  const sized = pots.filter((p): p is PlanPot & { diameterCm: number } => p.diameterCm !== null);
  const unknown = pots.filter((p) => p.diameterCm === null).sort(byName);
  const larger = sized
    .filter((p) => p.diameterCm > current)
    .sort((a, b) => a.diameterCm - b.diameterCm || byName(a, b));
  const smaller = sized
    .filter((p) => p.diameterCm <= current)
    .sort((a, b) => b.diameterCm - a.diameterCm || byName(a, b));
  return [...larger, ...smaller, ...unknown];
}

/** The season advice of a plant with hints: spring in dormancy, "phase unknown" without a phase, none in growth. */
function seasonOf(phase: PlanPhase): RepotPlan["seasonAdvice"] {
  if (phase === null) return "phase_unknown";
  return phase === DORMANCY ? "spring" : null;
}

/** The time hint: due after the interval without a repot (FR-BES-27); a cutting and an unknown day get none. */
function intervalHint(input: RepotPlanInput): IntervalHint | null {
  if (input.cutting || input.lastRepot === null) return null;
  const monthsAgo = wholeMonthsBetween(input.lastRepot, input.today);
  const interval = input.citedInterval ?? {
    months: REPOT_INTERVAL_STARTING_MONTHS,
    source: GENERAL_STARTING_VALUE,
  };
  return monthsAgo >= interval.months
    ? { reason: "interval", monthsAgo, source: interval.source }
    : null;
}

/**
 * The repot plan of one plant (US-BES-19, FR-BES-27). Hints name their reason and their source: an observation names
 * itself, the time hint names the cited source or says that it uses the general starting value. There is no hint for a
 * pot size: no cited rule exists for it yet (P-08), so growth against the pot is not judged.
 */
export function repotPlan(input: RepotPlanInput): RepotPlan {
  const signHints: SignHint[] = input.cutting
    ? []
    : input.openSigns.map((s): SignHint => ({
        reason: s.sign,
        tickedOn: s.tickedOn,
        source: "keeper_observation",
      }));
  const time = intervalHint(input);
  const hints: RepotHint[] = [...(time ? [time] : []), ...signHints];
  const seasonAdvice = hints.length === 0 ? null : seasonOf(input.phase);
  return {
    hints,
    lastRepot: input.lastRepot,
    phase: input.phase,
    seasonAdvice,
    currentPot: input.currentPot,
    freePots: orderFreePots(input.freePots, input.currentPot?.diameterCm ?? null),
  };
}
