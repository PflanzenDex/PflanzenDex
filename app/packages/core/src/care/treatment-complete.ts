import {
  appError,
  defineOperation,
  failed,
  idField,
  localToday,
  ok,
  shape,
  timeZoneField,
} from "../kernel";
import type { SpecimenStore } from "../collection";
import type { TreatmentRow, TreatmentStore } from "./treatment-types";

export interface CompleteDependencies {
  readonly treatments: Pick<TreatmentStore, "find" | "complete">;
  readonly specimens: Pick<SpecimenStore, "find">;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

export interface CompleteResult {
  readonly treatment: TreatmentRow;
}

// The client sends the time zone (the one of the profile, else the device's, US-ACC-02); it decides which date "today" is.
const schema = shape({ id: idField("id"), timeZone: timeZoneField("timeZone") });

/**
 * Ticks a treatment off (US-BEH-03): `done` and the done date, the local calendar date in the user's time zone
 * (NFR-08, FR-BEH-03). The treatment is addressed by its ID, never by its position (FR-BEH-02). Idempotent: an already
 * done treatment answers with its stored row and keeps the first done date, so a second tap or a second device changes
 * nothing. A foreign or unknown ID looks the same, `treatment.not_found` (P-04); a treatment of an archived specimen
 * is refused (`specimen.archived`, P-10). The open list and the cards derive from the store, so the treatment leaves
 * them and the next date moves up without any further write (P-01).
 */
export const treatmentComplete = (deps: CompleteDependencies) =>
  defineOperation({
    name: "treatment.complete",
    schema,
    run: async ({ userId }, input) => {
      const found = await deps.treatments.find(userId, input.id);
      if (!found) return failed(appError("treatment.not_found"));
      const specimen = await deps.specimens.find(userId, found.specimenId);
      if (!specimen) return failed(appError("treatment.not_found"));
      if (specimen.status === "archived")
        return failed(appError("specimen.archived", { data: { specimenId: specimen.id } }));
      const done = await deps.treatments.complete(
        userId,
        input.id,
        localToday(deps.clock(), input.timeZone),
      );
      return done === "unknown"
        ? failed(appError("treatment.not_found"))
        : ok<CompleteResult>({ treatment: done });
    },
  });
