// Fertilizing (US-MON-09): a log of its own, like watering (US-MON-05), logged on the page a scanned pot label opens
// (US-BES-17). It is not a treatment: treatments are planned dates that get ticked off (US-BEH-01), and this log has no
// planned date, interval or reminder. Only the keeper's own plants are read or written (P-04, P-05).
import {
  appError,
  defineOperation,
  failed,
  idField,
  isId,
  localToday,
  ok,
  shape,
  timeZoneField,
  type Result,
} from "../../kernel";
import { isActive, type SpecimenStore } from "../../collection";
import type { FertilizingStore, FertilizingView } from "../types";

export interface FertilizedDependencies {
  readonly specimens: Pick<SpecimenStore, "find">;
  readonly fertilizing: FertilizingStore;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

const schema = shape({
  specimenId: idField("specimenId"),
  timeZone: timeZoneField("timeZone"),
});

/**
 * "Gedüngt" (US-MON-09): logs fertilizing for one specimen on today's local date in `timeZone` (NFR-08). An unknown or
 * foreign specimen is `specimen.not_found` (the same answer for both, P-05), an archived one `specimen.archived`; nothing
 * is written then. The same specimen on the same day, or the same call repeated, writes one entry (US-QS-03). The date is
 * always today: a past day is not an entry the app accepts yet.
 */
export const monitoringFertilize = (deps: FertilizedDependencies) =>
  defineOperation({
    name: "monitoring.fertilize",
    schema,
    run: async ({ userId }, input) => {
      const specimen = await deps.specimens.find(userId, input.specimenId);
      if (!specimen)
        return failed(appError("specimen.not_found", { data: { specimenId: input.specimenId } }));
      if (!isActive(specimen))
        return failed(appError("specimen.archived", { data: { specimenId: input.specimenId } }));
      const date = localToday(deps.clock(), input.timeZone);
      const { created } = await deps.fertilizing.record(userId, [
        { specimenId: specimen.id, date },
      ]);
      return ok({ date, specimenId: specimen.id, created });
    },
  });

/**
 * What the label page shows of a plant (US-MON-09): the date of its latest fertilizing, `null` when none is logged (P-08).
 * A foreign or unknown id, and anything that is not an id, is `specimen.not_found`, exactly like a missing plant (P-05).
 * An archived plant is still read; the page shows no action for it.
 */
export async function fertilizingOf(
  deps: Pick<FertilizedDependencies, "specimens" | "fertilizing">,
  userId: string,
  specimenId: string,
): Promise<Result<FertilizingView>> {
  if (!isId(specimenId)) return failed(appError("specimen.not_found", { data: { specimenId } }));
  const specimen = await deps.specimens.find(userId, specimenId);
  if (!specimen) return failed(appError("specimen.not_found", { data: { specimenId } }));
  const last = await deps.fertilizing.lastFertilized(userId, [specimen.id]);
  return ok({ lastFertilizedOn: last.get(specimen.id) ?? null });
}
