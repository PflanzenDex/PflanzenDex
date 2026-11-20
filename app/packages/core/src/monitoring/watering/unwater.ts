// The undo of "Gegossen" (US-QS-32): removes today's manual watering entries again. It is a validating operation like the
// write it reverts (P-03); the rules of the write (own specimens, not archived, local date, limit) apply to it too.
import {
  appError,
  calendarDateField,
  daysBetween,
  defineOperation,
  failed,
  idListField,
  localToday,
  ok,
  orNull,
  shape,
  timeZoneField,
} from "../../kernel";
import { isActive, type SpecimenStore } from "../../collection";
import type { WateringStore } from "../types";
import { MAX_WATERED } from "./watering";

export interface UnwateredDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly watering: Pick<WateringStore, "unrecord">;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

export interface UnwaterResult {
  /** The local calendar date whose entries were looked at (NFR-08). */
  readonly date: string;
  readonly specimens: readonly string[];
  /** How many entries were removed; 0 when there was nothing to remove. */
  readonly removed: number;
}

const schema = shape({
  specimenIds: idListField("specimenIds", MAX_WATERED),
  timeZone: timeZoneField("timeZone"),
  // The date of the write the undo takes back (US-QS-32); without it today.
  date: orNull(calendarDateField("date")),
});

/**
 * Undo of "Gegossen" (US-QS-32): removes the manual entries of the given specimens for today's local date in `timeZone`
 * (NFR-08). Entries of other days stay. A foreign or unknown specimen is `specimen.not_found` and an archived one
 * `specimen.archived`, as for the write; all or nothing. Idempotent: a repeat, or a specimen without an entry for today,
 * removes nothing and is not an error.
 */
export const monitoringUnwater = (deps: UnwateredDependencies) =>
  defineOperation({
    name: "monitoring.unwater",
    schema,
    run: async ({ userId }, input) => {
      const known = new Map((await deps.specimens.list(userId)).map((s) => [s.id, s] as const));
      const ids = [...new Set(input.specimenIds)];
      for (const id of ids) {
        const s = known.get(id);
        if (!s) return failed(appError("specimen.not_found", { data: { specimenId: id } }));
        if (!isActive(s))
          return failed(appError("specimen.archived", { data: { specimenId: id } }));
      }
      const today = localToday(deps.clock(), input.timeZone);
      // Today, or yesterday when the write came before midnight; any other date is invalid input (US-QS-32).
      if (input.date !== null && ![0, 1].includes(daysBetween(input.date, today)))
        return failed(
          appError("input.invalid", { details: [{ field: "date", code: "input.invalid" }] }),
        );
      const date = input.date ?? today;
      const { removed } = await deps.watering.unrecord(
        userId,
        ids.map((specimenId) => ({ specimenId, date })),
      );
      return ok<UnwaterResult>({ date, specimens: ids, removed });
    },
  });
