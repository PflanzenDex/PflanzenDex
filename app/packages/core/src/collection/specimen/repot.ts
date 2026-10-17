import {
  defineOperation,
  appError,
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
// older client records no date (unknown, P-08).
const schema = shape({
  specimenId: idField("specimenId"),
  timeZone: orNull(timeZoneField("timeZone")),
});

const ERROR = {
  not_found: "specimen.not_found",
  not_a_cutting: "specimen.not_a_cutting",
} as const;

/**
 * "Repotted" (US-BES-04): a cutting becomes a plant. The status is the only stored part of the cutting assignment;
 * the light zone is derived (`cuttingLight`), so from now on the zone of the location or species applies again
 * without an override to delete. Anything else (plant, archived) stays unchanged and reports
 * `specimen.not_a_cutting`; the local day of the repot is recorded for the feed "Potted" (US-SOZ-05); a foreign or unknown specimen looks the same: 404 (P-04).
 */
export const specimenRepot = (deps: RepotDependencies) =>
  defineOperation({
    name: "specimen.repot",
    schema,
    run: async ({ userId }, input) => {
      const date = input.timeZone && deps.clock ? localToday(deps.clock(), input.timeZone) : null;
      const r = await deps.specimens.repot(userId, input.specimenId, date);
      return typeof r === "string" ? failed(appError(ERROR[r])) : ok(r);
    },
  });
