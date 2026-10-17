// Pauses of the care rhythm (US-ACH-04): the explicit pause of the keeper (up to 4 weeks) and the rest of all
// specimens (Dormancy). Tasks due on a pause day are neutral; the rhythm itself stays derived (FR-ACH-02).
import {
  appError,
  daysBetween,
  defineOperation,
  failed,
  ok,
  shape,
  calendarDateField,
  idField,
} from "../../kernel";
import { addDays, type RhythmPause } from "./rhythm";

/** Longest explicit pause in days, both ends included: 4 weeks (assumption, decided by the PO). */
export const MAX_PAUSE_DAYS = 28;

export interface StoredRhythmPause extends RhythmPause {
  readonly id: string;
}

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (P-04). */
export interface RhythmPauseStore {
  listPauses(userId: string): Promise<readonly StoredRhythmPause[]>;
  addPause(userId: string, pause: RhythmPause): Promise<StoredRhythmPause>;
  /** `false` when the account has no such pause. */
  removePause(userId: string, id: string): Promise<boolean>;
}

const addSchema = shape({ from: calendarDateField("from"), until: calendarDateField("until") });
const removeSchema = shape({ id: idField("id") });

/** Adds an explicit pause (US-ACH-04). A pause longer than 4 weeks or ending before it starts is refused (P-10). */
export const achievementsAddRhythmPause = (deps: { pauses: RhythmPauseStore }) =>
  defineOperation({
    name: "achievements.add_rhythm_pause",
    schema: addSchema,
    run: async ({ userId }, { from, until }) => {
      if (until < from) {
        return failed(
          appError("input.invalid", { details: [{ field: "until", code: "input.invalid" }] }),
        );
      }
      if (daysBetween(from, until) + 1 > MAX_PAUSE_DAYS) {
        return failed(appError("achievements.pause_too_long"));
      }
      return ok(await deps.pauses.addPause(userId, { from, until }));
    },
  });

/** Removes an explicit pause; its weeks count again (US-ACH-04). */
export const achievementsRemoveRhythmPause = (deps: { pauses: RhythmPauseStore }) =>
  defineOperation({
    name: "achievements.remove_rhythm_pause",
    schema: removeSchema,
    run: async ({ userId }, { id }) =>
      (await deps.pauses.removePause(userId, id))
        ? ok({ id })
        : failed(appError("achievements.pause_not_found")),
  });

/** A specimen's dormancy period as month-days `MM-DD`; `null` = the specimen has none (it is never at rest). */
export interface RestPeriod {
  readonly from: string;
  readonly until: string;
}

/** Same rule as `carePhase` of the module `care` (the period may span the turn of the year; both days belong to it). */
const inDormancy = (p: RestPeriod, tag: string): boolean =>
  p.from <= p.until ? tag >= p.from && tag <= p.until : tag >= p.from || tag <= p.until;

/**
 * Pauses for the days on which every active plant is in its dormancy (US-ACH-04: neutral weeks when all specimens
 * rest). Nothing is derived without a plant, or when one plant has no dormancy period (it needs care all year).
 * Runs day by day from `first` to `today`, joining consecutive days.
 */
export function restPauses(
  periods: readonly (RestPeriod | null)[],
  first: string,
  today: string,
): RhythmPause[] {
  if (periods.length === 0 || periods.some((p) => p === null)) return [];
  const rests = (date: string) =>
    periods.every((p) => p !== null && inDormancy(p, date.slice(5, 10)));
  const out: { from: string; until: string }[] = [];
  for (let date = first; date <= today; date = addDays(date, 1)) {
    if (!rests(date)) continue;
    const last = out[out.length - 1];
    if (last && addDays(last.until, 1) === date) last.until = date;
    else out.push({ from: date, until: date });
  }
  return out;
}
