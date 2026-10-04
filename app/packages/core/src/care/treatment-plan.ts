import {
  defineOperation,
  appError,
  failed,
  idListField,
  integerField,
  ok,
  type Schema,
  orNull,
  shape,
  textField,
} from "../kernel";
import type { SpecimenStore } from "../collection";
import { dateField } from "./fields";
import { addDays } from "./treatment-dates";
import {
  COURSE_DEFAULTS,
  TREATMENT_LIMITS,
  type TreatmentRow,
  type TreatmentStore,
} from "./treatment-types";

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

type Input = typeof schema extends Schema<infer T> ? T : never;

/** Every date of the plan for one specimen: one for a single treatment, N at T days for a course (US-BEH-01). */
function dates(input: Input): readonly string[] {
  const isCourse = input.count !== null || input.intervalDays !== null;
  if (!isCourse) return [input.date];
  const count = input.count ?? COURSE_DEFAULTS.count;
  const interval = input.intervalDays ?? COURSE_DEFAULTS.intervalDays;
  return Array.from({ length: count }, (_, i) => addDays(input.date, i * interval));
}

/** The first specimen of the list that cannot be treated, with the reason; `null` if all can (P-04). */
async function refusal(deps: PlanDependencies, userId: string, ids: readonly string[]) {
  for (const specimenId of ids) {
    const z = await deps.specimens.find(userId, specimenId);
    if (!z) return appError("specimen.not_found");
    if (z.status === "archived") return appError("specimen.archived", { data: { specimenId } });
  }
  return null;
}

/**
 * Plans treatment dates (US-BEH-01): one reason, an optional agent and a date for one or several specimens. With
 * `count` and/or `intervalDays` it is a course ("Kur planen", default 3 dates at 7 days): N individual treatments
 * per specimen at T-day steps, all sharing one course id per specimen (DM-BEH-01). The dates are local calendar dates
 * (NFR-08); nothing in the past is refused (a missed treatment can be written down). All or nothing: a foreign,
 * unknown or archived specimen refuses the whole call and writes nothing (P-04, P-10). A foreign specimen looks the
 * same as an unknown one. The same Idempotency-Key writes once (US-QS-03).
 */
export const treatmentPlan = (deps: PlanDependencies) =>
  defineOperation({
    name: "treatment.plan",
    schema,
    run: async ({ userId }, input) => {
      const refused = await refusal(deps, userId, input.specimenIds);
      if (refused) return failed(refused);
      const isCourse = input.count !== null || input.intervalDays !== null;
      const values = input.specimenIds.flatMap((specimenId) => {
        const courseId = isCourse ? deps.newId() : null;
        return dates(input).map((dueAt) => ({
          specimenId,
          reason: input.reason,
          agent: input.agent,
          dueAt,
          courseId,
        }));
      });
      const created = await deps.treatments.createMany(userId, values);
      if (created === "specimen_unknown") return failed(appError("specimen.not_found"));
      return ok<PlanResult>({ treatments: created });
    },
  });
