import { daysBetween } from "../../kernel";
import type { LampMeasurementStore } from "../lamps/measurements/types";
import type { EquipmentStore } from "../store/types";

/** One device whose check is due (US-EQU-04). */
export interface CheckDue {
  readonly id: string;
  readonly name: string;
  /** The last check: the newer of the keeper's confirmation and, for a lamp, the last measurement; `null` = never. */
  readonly lastCheckedOn: string | null;
  /** Days past the due date; `null` when no date is known to count from (never checked, no start date). */
  readonly overdueDays: number | null;
}

export interface ChecksDueDependencies {
  readonly equipment: Pick<EquipmentStore, "list">;
  readonly measurements: Pick<LampMeasurementStore, "list">;
}

const later = (a: string | null, b: string | null): string | null =>
  a === null ? b : b === null ? a : a >= b ? a : b;

/**
 * The devices whose check is due on `today` (US-EQU-04), purely derived (P-01). Only a device with a check interval
 * set by the keeper can be due; without an interval there is no due date and no invented one. A check counts from the
 * newer of the keeper's confirmation and, for a lamp, the last measurement; before the first check the interval counts
 * from `In_Operation_Since`, and with neither the device counts as never checked and is due (the keeper asked for
 * checks, none happened). A defective or retired device is not reported; it needs repair or replacement
 * (US-EQU-07), not a check. `today` is the local calendar date of the keeper (NFR-08). Most overdue first.
 */
export async function equipmentChecksDue(
  deps: ChecksDueDependencies,
  userId: string,
  today: string,
): Promise<readonly CheckDue[]> {
  const [items, measured] = await Promise.all([
    deps.equipment.list(userId),
    deps.measurements.list(userId),
  ]);
  const result: CheckDue[] = [];
  for (const e of items) {
    if (e.status !== "active" || e.checkIntervalDays === null) continue;
    const lastMeasured = measured
      .filter((m) => m.equipmentId === e.id)
      .reduce<string | null>((acc, m) => later(acc, m.measuredOn), null);
    const lastCheckedOn = later(e.lastCheckedOn, lastMeasured);
    const since = lastCheckedOn ?? e.inOperationSince;
    if (since === null) {
      result.push({ id: e.id, name: e.name, lastCheckedOn, overdueDays: null });
      continue;
    }
    const overdueDays = daysBetween(since, today) - e.checkIntervalDays;
    if (overdueDays >= 0) result.push({ id: e.id, name: e.name, lastCheckedOn, overdueDays });
  }
  return result.sort(
    (a, b) =>
      (b.overdueDays ?? Number.MAX_SAFE_INTEGER) - (a.overdueDays ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name, "de") ||
      a.id.localeCompare(b.id),
  );
}
