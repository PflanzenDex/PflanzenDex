import {
  defineOperation,
  appError,
  calendarDateField,
  failed,
  idField,
  localToday,
  orNull,
  shape,
  ok,
  timeZoneField,
} from "../../kernel";
import type { SpecimenStore } from "../shared/types";

export interface RepotDependencies {
  /** Only the repot is needed here: a repot with a pot runs it inside its own unit of work (`equipment`, US-BES-19). */
  readonly specimens: Pick<SpecimenStore, "repot">;
  /** The clock for the repot date (NFR-08); without it no date is recorded. */
  readonly clock?: () => Date;
}

// The time zone (profile zone, device as fallback) makes the repot date a local calendar date (NFR-08); optional, an
// older client records no date (unknown, P-08). The keeper may name the day of the repot (`date`, `YYYY-MM-DD`, from
// 1900 on, not after today in that zone); without it the repot is recorded for today (issue 1028).
const schema = shape({
  specimenId: idField("specimenId"),
  timeZone: orNull(timeZoneField("timeZone")),
  date: orNull(calendarDateField("date")),
});

const REPOTTED_IN_FUTURE = appError("specimen.repotted_in_future", {
  details: [{ field: "date", code: "specimen.repotted_in_future" }],
});

/** The refusals of the store; a day before the catch date names the field `date` (issue 1103). */
const REFUSED = {
  not_found: appError("specimen.not_found"),
  archived: appError("specimen.archived"),
  before_caught: appError("specimen.repotted_before_caught", {
    details: [{ field: "date", code: "specimen.repotted_before_caught" }],
  }),
  // A plant has no repot day without a time zone: the keeper's day is needed for the repot history (P-08).
  day_unknown: appError("input.invalid", {
    details: [{ field: "timeZone", code: "input.invalid" }],
  }),
} as const;

/**
 * "Repotted" (US-BES-04, US-BES-19): a cutting becomes a plant, a plant stays a plant. The repot is recorded in the
 * history with its local day (the feed "Potted", US-SOZ-05, and the repot hint, US-BES-19), and every open repot
 * observation of the plant is cleared on that day. A cutting keeps the first repot day as its potting out (`repottedAt`);
 * a plant keeps it too. The day is the chosen `date` (not after today in the keeper's zone, else
 * `specimen.repotted_in_future`; a chosen date needs a time zone to be checked, else `input.invalid`; not before the catch
 * date, else `specimen.repotted_before_caught` on the field `date`, issue 1103, a specimen without a catch date accepts any
 * day, P-08) or today. A plant without a time zone has no day and is refused (`input.invalid` on `timeZone`); a cutting
 * without one is recorded as before, with no day (P-08). An archived specimen answers `specimen.archived` and nothing is
 * written. A foreign or unknown specimen looks the same: 404 (P-04). The pot is not part of the repot (DM-EQU-06).
 */
export const specimenRepot = (deps: RepotDependencies) =>
  defineOperation({
    name: "specimen.repot",
    schema,
    run: async ({ userId }, input) => {
      const today = input.timeZone && deps.clock ? localToday(deps.clock(), input.timeZone) : null;
      if (input.date !== null) {
        if (today === null)
          return failed(
            appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
          );
        if (input.date > today) return failed(REPOTTED_IN_FUTURE);
      }
      const r = await deps.specimens.repot(
        userId,
        input.specimenId,
        input.date ?? today,
        input.date,
      );
      return typeof r === "string" ? failed(REFUSED[r]) : ok(r);
    },
  });
