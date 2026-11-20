// The undo of "Erledigt" (US-QS-32): a treatment ticked off today can be opened again. It is a validating operation like
// the tick-off it reverts (P-03), next to `treatment.complete`.
import {
  appError,
  defineOperation,
  failed,
  idField,
  localToday,
  ok,
  shape,
  timeZoneField,
} from "../../kernel";
import { isActive, type SpecimenStore } from "../../collection";
import type { TreatmentStore } from "../treatment-data/treatment-types";
import type { CompleteResult } from "../treatments/treatment-complete";

export interface ReopenDependencies {
  readonly treatments: Pick<TreatmentStore, "find" | "reopen">;
  readonly specimens: Pick<SpecimenStore, "find">;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

const schema = shape({ id: idField("id"), timeZone: timeZoneField("timeZone") });

/**
 * Opens a ticked-off treatment again (US-QS-32, the undo of "Erledigt"). Only a treatment whose done date is today in
 * `timeZone` (NFR-08) can be reopened: one ticked off on an earlier day is `treatment.not_reopenable` and stays done,
 * so an old record is never changed by a tap. An open treatment answers with its row (idempotent). A foreign or unknown
 * ID is `treatment.not_found` (P-04); a treatment of an archived specimen is refused (`specimen.archived`, P-10).
 */
export const treatmentReopen = (deps: ReopenDependencies) =>
  defineOperation({
    name: "treatment.reopen",
    schema,
    run: async ({ userId }, input) => {
      const found = await deps.treatments.find(userId, input.id);
      if (!found) return failed(appError("treatment.not_found"));
      const specimen = await deps.specimens.find(userId, found.specimenId);
      if (!specimen) return failed(appError("treatment.not_found"));
      if (!isActive(specimen))
        return failed(appError("specimen.archived", { data: { specimenId: specimen.id } }));
      const today = localToday(deps.clock(), input.timeZone);
      if (!found.done) return ok<CompleteResult>({ treatment: found, changed: false });
      if (found.doneAt !== today)
        return failed(appError("treatment.not_reopenable", { data: { treatmentId: found.id } }));
      // The store clears the row only while its done date is still today, so a change in between is not overwritten.
      const reopened = await deps.treatments.reopen(userId, input.id, today);
      if (reopened === "unknown") return failed(appError("treatment.not_found"));
      if (reopened === "not_reopenable")
        return failed(appError("treatment.not_reopenable", { data: { treatmentId: found.id } }));
      return ok<CompleteResult>({ treatment: reopened, changed: true });
    },
  });
