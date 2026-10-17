import {
  defineOperation,
  appError,
  failed,
  localToday,
  idField,
  shape,
  ok,
  textField,
  timeZoneField,
} from "../../kernel";
import { SPECIMEN_LIMITS } from "../shared/types";
import type { SpecimenStore } from "../shared/types";

export interface ArchiveDependencies {
  readonly specimens: SpecimenStore;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

// The time zone comes from the profile (US-ACC-02), with the device zone as fallback; it determines "today".
const schema = shape({
  specimenId: idField("specimenId"),
  timeZone: timeZoneField("timeZone"),
  reason: textField("reason", SPECIMEN_LIMITS.archivedReason),
});

const schemaRestore = shape({ specimenId: idField("specimenId") });

const ERROR = {
  not_found: "specimen.not_found",
  already_archived: "specimen.already_archived",
  not_archived: "specimen.not_archived",
} as const;

/**
 * Archives a specimen (US-BES-07): status `archived`, date (local calendar date in the user's time zone, NFR-08) and
 * reason, in one statement. The history stays, the specimen is only missing from lists and evaluations. An already
 * archived specimen keeps the date and reason of the first archiving (P-10); a foreign or unknown one looks the same:
 * `specimen.not_found` (P-04).
 */
export const specimenArchive = (deps: ArchiveDependencies) =>
  defineOperation({
    name: "specimen.archive",
    schema,
    run: async ({ userId }, input) => {
      const today = localToday(deps.clock(), input.timeZone);
      const r = await deps.specimens.archive(userId, input.specimenId, input.reason, today);
      return typeof r === "string" ? failed(appError(ERROR[r])) : ok(r);
    },
  });

/**
 * Restores an archived specimen (US-BES-07): afterwards it has the status from before the archiving, date and reason
 * are deleted. Its name was taken all along, so it can never collide with a new one.
 */
export const specimenRestore = (deps: Pick<ArchiveDependencies, "specimens">) =>
  defineOperation({
    name: "specimen.restore",
    schema: schemaRestore,
    run: async ({ userId }, input) => {
      const r = await deps.specimens.restore(userId, input.specimenId);
      return typeof r === "string" ? failed(appError(ERROR[r])) : ok(r);
    },
  });
