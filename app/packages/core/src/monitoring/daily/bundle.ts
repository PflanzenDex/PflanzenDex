// The pure part of the reminders (FR-MON-01): which occasions go into the one message of a day, when the message is due and
// which measurements are overdue. No channel, no clock, no store.
import { daysBetween } from "../../kernel";
import type { Occasion, ReminderOccasion, ReminderSettings } from "../types";

/** A pause is "until <date>", inclusive: on that day the occasion is still silent (US-MON-08). */
export function isPaused(
  settings: ReminderSettings,
  occasion: ReminderOccasion,
  today: string,
): boolean {
  const until = settings.paused[occasion];
  return until !== undefined && until >= today;
}

/**
 * The occasions of the one bundled message (US-MON-01): paused occasions are left out (the Today list still shows them,
 * FR-MON-03), every occasion once (same id twice is one), in the order given. `null` when nothing is left: then nothing is
 * sent, no "all ok" message.
 */
export function bundleOf(
  occasions: readonly Occasion[],
  settings: ReminderSettings,
  today: string,
): readonly Occasion[] | null {
  const seen = new Set<string>();
  const items = occasions.filter((o) => {
    if (isPaused(settings, o.occasion, today) || seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  return items.length === 0 ? null : items;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Whether `time` (`HH:MM`) lies in the quiet hours `[from, to)`; a window with `from > to` reaches over midnight. */
export function inQuietHours(settings: ReminderSettings, time: string): boolean {
  if (settings.quietFrom === null || settings.quietTo === null) return false;
  const [from, to, at] = [minutes(settings.quietFrom), minutes(settings.quietTo), minutes(time)];
  if (from === to) return false;
  return from < to ? at >= from && at < to : at >= from || at < to;
}

/**
 * The local time at which the message of the day goes out: the chosen time, or the end of the quiet hours when the
 * chosen time falls into them (US-MON-08). The message is never dropped for it (P-10).
 */
export function deliveryTime(settings: ReminderSettings): string {
  return inQuietHours(settings, settings.sendTime) && settings.quietTo !== null
    ? settings.quietTo
    : settings.sendTime;
}

/** A specimen as the measurement check sees it. */
export interface MeasuredSpecimen {
  readonly id: string;
  readonly name: string;
  /** Local date of the last measurement; `null` = none yet. */
  readonly lastMeasuredOn: string | null;
  /** Local date the specimen was caught; counts as the start while there is no measurement. `null` = unknown. */
  readonly since: string | null;
}

/**
 * US-MON-04: the specimens whose last measurement is older than `days` (or that never had one and were caught longer
 * ago than that). A specimen without any known date is not reported: nothing is invented (P-08). Cuttings and archived
 * specimens are left out by the caller (FR-WAC-08 is open, E-11).
 */
export function measurementOverdue(
  specimens: readonly MeasuredSpecimen[],
  today: string,
  days: number,
): Occasion[] {
  return specimens.flatMap((s): Occasion[] => {
    const start = s.lastMeasuredOn ?? s.since;
    if (start === null || daysBetween(start, today) <= days) return [];
    return [
      {
        id: `measurement:${s.id}`,
        occasion: "measurement",
        text:
          s.lastMeasuredOn === null
            ? `„${s.name}“ wurde noch nie gemessen (seit mehr als ${days} Tagen).`
            : `„${s.name}“ wurde seit mehr als ${days} Tagen nicht gemessen.`,
        nextAction: "Miss das Exemplar und trage die Messung ein.",
      },
    ];
  });
}
