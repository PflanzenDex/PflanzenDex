// Watering without a sensor (US-MON-05): the pure rule when a specimen is due and the validating operation that logs
// "watered". The interval is the keeper's own entry per species and phase (care profile, US-BES-09); nothing is
// invented (P-08). `monitoring` does not know the care phases (`care` depends on it), so the caller passes the phase
// of today as a plain value, computed by the same function as the phase list (FR-MON-03).
import {
  appError,
  daysBetween,
  defineOperation,
  failed,
  idListField,
  localToday,
  ok,
  shape,
  timeZoneField,
} from "../../kernel";
import type { SpecimenStore } from "../../collection";
import type { Occasion, WateringStore } from "../types";

/** Most specimens one "watered" takes (assumption, starting value; the same as for the phase switch). */
export const MAX_WATERED = 100;

/** An active plant with what is needed to judge it; `null` = unknown. */
export interface WateringCandidate {
  readonly specimenId: string;
  readonly name: string;
  /** Interval of the phase of today in whole days; `null` = the keeper set none for this phase. */
  readonly intervalDays: number | null;
  /** Local date of the latest watering; `null` = never logged. */
  readonly lastWateredOn: string | null;
  /** Local date the specimen was caught; counts as the start while there is no entry. */
  readonly since: string | null;
}

/** A specimen that is due to be watered today. */
export interface WateringDue {
  readonly specimenId: string;
  readonly name: string;
  readonly intervalDays: number;
  readonly lastWateredOn: string | null;
  /** Whole days since the start (last entry, else the catch date). */
  readonly daysSince: number;
}

/**
 * Trigger of US-MON-05: last entry + interval of the current phase ≤ today. Without a log entry the catch date is the
 * start; without any known date or without an interval the specimen is not reported (P-08). The most overdue first.
 */
export function wateringDue(
  candidates: readonly WateringCandidate[],
  today: string,
): WateringDue[] {
  return candidates
    .flatMap((c): WateringDue[] => {
      const start = c.lastWateredOn ?? c.since;
      if (c.intervalDays === null || start === null) return [];
      const daysSince = daysBetween(start, today);
      return daysSince >= c.intervalDays
        ? [
            {
              specimenId: c.specimenId,
              name: c.name,
              intervalDays: c.intervalDays,
              lastWateredOn: c.lastWateredOn,
              daysSince,
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        b.daysSince - b.intervalDays - (a.daysSince - a.intervalDays) ||
        a.name.localeCompare(b.name, "de"),
    );
}

/** The reminder occasions (id `watering:<specimen>`, same cause, same id on every day, FR-MON-02). */
export const wateringOccasions = (due: readonly WateringDue[]): Occasion[] =>
  due.map((d) => ({
    id: `watering:${d.specimenId}`,
    occasion: "watering",
    text:
      d.lastWateredOn === null
        ? `„${d.name}“ ist noch nie als gegossen eingetragen (Intervall: alle ${d.intervalDays} Tage).`
        : `„${d.name}“ wurde zuletzt vor ${d.daysSince} Tagen gegossen (Intervall: alle ${d.intervalDays} Tage).`,
    nextAction: "Gieße das Exemplar und trage es als gegossen ein.",
  }));

export interface WateredDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly watering: WateringStore;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

const schema = shape({
  specimenIds: idListField("specimenIds", MAX_WATERED),
  timeZone: timeZoneField("timeZone"),
});

/**
 * "Gegossen" (US-MON-05): logs a manual watering for each given specimen on today's local date in `timeZone` (NFR-08),
 * in the app or in a message; several specimens in one step. All or nothing: an unknown or foreign specimen
 * (`specimen.not_found`) or an archived one (`specimen.archived`) stops the whole step and names it. The same specimen
 * twice, or the same call repeated, writes one entry per day (US-QS-03). The date is always today: a past watering is
 * not an entry the app accepts yet.
 */
export const monitoringWater = (deps: WateredDependencies) =>
  defineOperation({
    name: "monitoring.water",
    schema,
    run: async ({ userId }, input) => {
      const known = new Map((await deps.specimens.list(userId)).map((s) => [s.id, s] as const));
      const ids = [...new Set(input.specimenIds)];
      for (const id of ids) {
        const s = known.get(id);
        if (!s) return failed(appError("specimen.not_found", { data: { specimenId: id } }));
        if (s.status === "archived")
          return failed(appError("specimen.archived", { data: { specimenId: id } }));
      }
      const date = localToday(deps.clock(), input.timeZone);
      const { created } = await deps.watering.record(
        userId,
        ids.map((specimenId) => ({ specimenId, date })),
      );
      return ok({ date, specimens: ids, created });
    },
  });
