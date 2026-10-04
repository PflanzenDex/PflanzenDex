import { appError, failed, type Result } from "../kernel";
import type { SpecimenStore } from "../collection";
import type { TreatmentRow, TreatmentStore } from "./treatment-types";

export interface HistoryDependencies {
  readonly treatments: Pick<TreatmentStore, "done">;
  readonly specimens: Pick<SpecimenStore, "find">;
}

/** Skeleton (red): the done treatments of one specimen (US-BEH-03). */
export async function treatmentHistory(
  deps: HistoryDependencies,
  userId: string,
  specimenId: unknown,
): Promise<Result<readonly TreatmentRow[]>> {
  void [deps, userId, specimenId];
  return failed(appError("system.unexpected", { cause: "not implemented" }));
}
