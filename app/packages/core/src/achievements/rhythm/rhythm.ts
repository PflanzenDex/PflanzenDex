// Care rhythm instead of a streak (US-ACH-04): a run of consecutive calendar weeks in which every due care task was
// done on time. Gentler than a streak: weeks without a due task and weeks of a pause are neutral, a missed week only
// restarts the current run while the longest run stays, and nothing is shown as "lost" (FR-ACH-06). Only tasks that
// exist because of the plants' needs count; doing a task earlier than due earns nothing more (FR-ACH-05). Derived, not
// stored (FR-ACH-02); pure, dates are local calendar dates (NFR-08).
import { daysBetween } from "../../kernel";

/** Starting values (assumptions): 1 day of grace, 12 weeks shown. */
export const RHYTHM_LIMITS = { graceDays: 1, weeks: 12 } as const;

/** A task that exists because of a plant's need, with the date it was due and the date it was done (`null` = open). */
export interface RhythmTask {
  readonly dueOn: string;
  readonly doneOn: string | null;
}

/** A pause: both days included (holiday, or a phase in which nothing is due, assumption). */
export interface RhythmPause {
  readonly from: string;
  readonly until: string;
}

export type RhythmWeekState =
  /** Every task due in the week was done on time. */
  | "on_time"
  /** A task due in the week was done late or is still open. */
  | "open"
  /** Tasks are due in the week but none is decided yet (inside the grace day or later this week). */
  | "pending"
  /** No task due, or a pause: neutral. */
  | "none";

export interface RhythmWeek {
  /** The Monday of the week, local calendar date. */
  readonly start: string;
  readonly state: RhythmWeekState;
}

export interface CareRhythm {
  /** The last weeks, oldest first, the current week last. */
  readonly weeks: readonly RhythmWeek[];
  /** Weeks on time since the last week with an open task; neutral weeks neither extend nor break it. */
  readonly currentRun: number;
  /** The best run so far (personal record). */
  readonly longestRun: number;
  /** Tasks that are due and not done (outside pauses): named as open tasks, not as a loss (P-09). */
  readonly openTasks: number;
  /** Whether any task has been due yet; without one the rhythm is unknown (P-08). */
  readonly hasTasks: boolean;
}

const MS_PER_DAY = 86_400_000;
const two = (n: number): string => String(n).padStart(2, "0");

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY);
  return `${t.getUTCFullYear()}-${two(t.getUTCMonth() + 1)}-${two(t.getUTCDate())}`;
}

/** The Monday of the week (Monday to Sunday) that contains `date`. */
function mondayOf(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return addDays(date, -((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7));
}

type Verdict = "on_time" | "late" | "undecided";

function verdict(t: RhythmTask, today: string): Verdict {
  const limit = addDays(t.dueOn, RHYTHM_LIMITS.graceDays);
  if (t.doneOn !== null) return t.doneOn <= limit ? "on_time" : "late";
  return today > limit ? "late" : "undecided";
}

function weekState(verdicts: readonly Verdict[]): RhythmWeekState {
  if (verdicts.length === 0) return "none";
  if (verdicts.includes("late")) return "open";
  return verdicts.includes("undecided") ? "pending" : "on_time";
}

/**
 * The care rhythm on `today` from the due and done dates of the tasks (US-ACH-04). A task belongs to the week of its
 * due date; tasks due after `today` are ignored, tasks due inside a pause do not count.
 */
export function careRhythm(
  tasks: readonly RhythmTask[],
  today: string,
  pauses: readonly RhythmPause[] = [],
): CareRhythm {
  const counted = tasks.filter(
    (t) => t.dueOn <= today && !pauses.some((p) => p.from <= t.dueOn && t.dueOn <= p.until),
  );
  const byWeek = new Map<string, Verdict[]>();
  for (const t of counted) {
    const week = mondayOf(t.dueOn);
    byWeek.set(week, [...(byWeek.get(week) ?? []), verdict(t, today)]);
  }
  const current = mondayOf(today);
  const first = [...byWeek.keys()].sort()[0] ?? current;
  const total = Math.max(daysBetween(first, current) / 7 + 1, RHYTHM_LIMITS.weeks);
  const all: RhythmWeek[] = Array.from({ length: total }, (_, i) => {
    const start = addDays(current, -7 * (total - 1 - i));
    return { start, state: weekState(byWeek.get(start) ?? []) };
  });
  let run = 0;
  let longest = 0;
  for (const w of all) {
    if (w.state === "on_time") longest = Math.max(longest, ++run);
    else if (w.state === "open") run = 0;
  }
  return {
    weeks: all.slice(-RHYTHM_LIMITS.weeks),
    currentRun: run,
    longestRun: longest,
    openTasks: counted.filter((t) => t.doneOn === null).length,
    hasTasks: counted.length > 0,
  };
}
