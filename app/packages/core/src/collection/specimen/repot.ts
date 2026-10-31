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
  readonly specimens: SpecimenStore;
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

const ERROR = {
  not_found: "specimen.not_found",
  not_a_cutting: "specimen.not_a_cutting",
} as const;

const REPOTTED_IN_FUTURE = appError("specimen.repotted_in_future", {
  details: [{ field: "date", code: "specimen.repotted_in_future" }],
});

/**
 * "Repotted" (US-BES-04): a cutting becomes a plant. The status is the only stored part of the cutting assignment;
 * the light zone is derived (`cuttingLight`), so from now on the zone of the location or species applies again
 * without an override to delete. Anything else (plant, archived) stays unchanged and reports
 * `specimen.not_a_cutting`; the local day of the repot is recorded for the feed "Potted" (US-SOZ-05): the chosen `date`
 * (not after today in the keeper's zone, else `specimen.repotted_in_future`; a chosen date needs a time zone to be
 * checked, else `input.invalid`) or today. A foreign or unknown specimen looks the same: 404 (P-04).
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
      const r = await deps.specimens.repot(userId, input.specimenId, input.date ?? today);
      return typeof r === "string" ? failed(appError(ERROR[r])) : ok(r);
    },
  });
