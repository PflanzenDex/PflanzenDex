import { MS_PER_DAY } from "../../kernel";

// The legal deadline of a deletion request (US-ACC-04, GDPR Art. 12(3): one month from the request) and the warning window
// before it. Pure functions: the clock comes in as `now` (AB-1, P-01). All instants are UTC; the operator reads UTC too.

/** The warning window before a deadline (starting value, assumption, issue 1673). */
export const DEADLINE_RULES = { warningDays: 7 } as const;

/**
 * The deadline: the same time of day one calendar month later, in UTC. A shorter month ends on its last day, so a request
 * of 31 January is due on 28 February (29 February in a leap year).
 */
export function deadlineOf(requestedAt: Date): Date {
  const year = requestedAt.getUTCFullYear();
  const month = requestedAt.getUTCMonth() + 1;
  // Day 0 of the month after next (0-based index `month + 1`) is the last day of the next month.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(requestedAt.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      requestedAt.getUTCHours(),
      requestedAt.getUTCMinutes(),
      requestedAt.getUTCSeconds(),
      requestedAt.getUTCMilliseconds(),
    ),
  );
}

/** `open`: not near yet; `near`: inside the warning window; `past`: the deadline has passed (at the deadline itself too). */
export type DeadlineState = "open" | "near" | "past";

export function deadlineState(deadline: Date, now: Date): DeadlineState {
  if (now.getTime() >= deadline.getTime()) return "past";
  const warningStart = deadline.getTime() - DEADLINE_RULES.warningDays * MS_PER_DAY;
  return now.getTime() >= warningStart ? "near" : "open";
}

/** One deletion item that may need the operator: a request still waiting for its removal, or an identity still open. */
export interface DeletionItem {
  readonly requestedAt: Date;
  /** A done item (data and identity removed) never counts. */
  readonly done: boolean;
}

export type DeadlineEntry<T extends DeletionItem> = T & { readonly deadline: Date };

export interface DeadlineReport<T extends DeletionItem> {
  readonly near: readonly DeadlineEntry<T>[];
  readonly past: readonly DeadlineEntry<T>[];
}

/** Sorts the open items into the two lists, earliest deadline first. Done items are ignored (US-ACC-04). */
export function classifyDeadlines<T extends DeletionItem>(
  items: readonly T[],
  now: Date,
): DeadlineReport<T> {
  const near: DeadlineEntry<T>[] = [];
  const past: DeadlineEntry<T>[] = [];
  for (const item of items) {
    if (item.done) continue;
    const entry = { ...item, deadline: deadlineOf(item.requestedAt) };
    const state = deadlineState(entry.deadline, now);
    if (state === "past") past.push(entry);
    else if (state === "near") near.push(entry);
  }
  const byDeadline = (a: { deadline: Date }, b: { deadline: Date }) =>
    a.deadline.getTime() - b.deadline.getTime();
  return { near: near.sort(byDeadline), past: past.sort(byDeadline) };
}

/** The health state of the deadlines: a passed deadline is the worse one (`deadline_passed`, P-10). */
export type DeadlineHealth = "ok" | "near" | "deadline_passed";

export function deadlineHealth(report: {
  readonly near: readonly unknown[];
  readonly past: readonly unknown[];
}): DeadlineHealth {
  if (report.past.length > 0) return "deadline_passed";
  return report.near.length > 0 ? "near" : "ok";
}
