import {
  defineOperation,
  failed,
  idField,
  shape,
  timeZoneField,
  appError,
  type Result,
} from "../kernel";
import type { SpecimenStore } from "../collection";
import type { TreatmentRow, TreatmentStore } from "./treatment-types";

export interface CompleteDependencies {
  readonly treatments: Pick<TreatmentStore, "find" | "complete">;
  readonly specimens: Pick<SpecimenStore, "find">;
  readonly clock: () => Date;
}

export interface CompleteResult {
  readonly treatment: TreatmentRow;
}

const schema = shape({ id: idField("id"), timeZone: timeZoneField("timeZone") });

/** Skeleton (red): ticks a treatment off (US-BEH-03). */
export const treatmentComplete = (deps: CompleteDependencies) =>
  defineOperation({
    name: "treatment.complete",
    schema,
    run: async (): Promise<Result<CompleteResult>> => {
      void deps;
      return failed(appError("system.unexpected", { cause: "not implemented" }));
    },
  });
