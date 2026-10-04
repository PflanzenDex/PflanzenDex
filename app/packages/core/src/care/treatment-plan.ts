import {
  defineOperation,
  appError,
  failed,
  idListField,
  integerField,
  orNull,
  shape,
  textField,
} from "../kernel";
import type { SpecimenStore } from "../collection";
import { dateField } from "./fields";
import { TREATMENT_LIMITS, type TreatmentRow, type TreatmentStore } from "./treatment-types";

export interface PlanDependencies {
  readonly treatments: TreatmentStore;
  readonly specimens: Pick<SpecimenStore, "find">;
  /** Ids of courses come from outside, so that tests are deterministic. */
  readonly newId: () => string;
}

export interface PlanResult {
  readonly treatments: readonly TreatmentRow[];
}

const schema = shape({
  specimenIds: idListField("specimenIds", TREATMENT_LIMITS.specimens),
  reason: textField("reason", TREATMENT_LIMITS.reason),
  agent: orNull(textField("agent", TREATMENT_LIMITS.agent)),
  date: dateField("date"),
  count: orNull(integerField("count", TREATMENT_LIMITS.courseCount)),
  intervalDays: orNull(integerField("intervalDays", TREATMENT_LIMITS.courseInterval)),
});

/** Placeholder: implemented after the red tests. */
export const treatmentPlan = (deps: PlanDependencies) =>
  defineOperation({
    name: "treatment.plan",
    schema,
    run: async () => {
      void deps;
      return failed(appError("system.unexpected"));
    },
  });
