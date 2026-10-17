import { appError, failed, isId, ok, type Result } from "../../kernel";
import type { SpecimenStore } from "../../collection";
import type { TreatmentRow, TreatmentStore } from "../treatment-data/treatment-types";

export interface HistoryDependencies {
  readonly treatments: Pick<TreatmentStore, "done">;
  readonly specimens: Pick<SpecimenStore, "find">;
}

/**
 * The done treatments of one specimen, latest done date first (US-BEH-03: completed entries remain as history). Read
 * only. The history of an archived specimen stays readable (nothing disappears silently, P-10); a foreign or unknown
 * specimen looks the same, `specimen.not_found` (P-04).
 */
export async function treatmentHistory(
  deps: HistoryDependencies,
  userId: string,
  specimenId: unknown,
): Promise<Result<readonly TreatmentRow[]>> {
  if (!isId(specimenId))
    return failed(
      appError("input.invalid", { details: [{ field: "specimenId", code: "input.invalid" }] }),
    );
  if (!(await deps.specimens.find(userId, specimenId)))
    return failed(appError("specimen.not_found"));
  return ok(await deps.treatments.done(userId, specimenId));
}
