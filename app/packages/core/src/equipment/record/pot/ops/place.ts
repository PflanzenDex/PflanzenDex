import {
  appError,
  calendarDateField,
  defineOperation,
  failed,
  idField,
  localToday,
  ok,
  orNull,
  shape,
  timeZoneField,
  type Result,
} from "../../../../kernel";
import { isActive, type SpecimenStore } from "../../../../collection";
import { EQUIPMENT_KEEPER_SWITCH, type PlacementResult, type PotPlacementStore } from "../types";

/** The plant side of a placement: the plant must exist, be active and be a plant (a cutting is potted out first). */
type PlaceSpecimens = Pick<SpecimenStore, "find">;

/**
 * Places a plant into one of the keeper's pots (or takes it out of its pot with `potId` null) on `day` (US-BES-19,
 * DM-EQU-06). Used by `equipment.place_pot` and by the repot with a pot; the plant is checked here, the pot in the store.
 * Refusals: `specimen.not_found` (also for a foreign plant, P-04), `specimen.archived`, `equipment.not_a_plant` for a
 * cutting, `equipment.pot_not_found` and `equipment.pot_taken` (nothing is written then).
 */
export async function placePlant(
  deps: { readonly specimens: PlaceSpecimens; readonly pots: PotPlacementStore },
  userId: string,
  target: { readonly specimenId: string; readonly potId: string | null; readonly day: string },
): Promise<Result<PlacementResult>> {
  const { specimenId, potId, day } = target;
  const specimen = await deps.specimens.find(userId, specimenId);
  if (!specimen) return failed(appError("specimen.not_found", { data: { specimenId } }));
  if (!isActive(specimen)) return failed(appError("specimen.archived"));
  if (specimen.status !== PLANT_STATUS) return failed(appError("equipment.not_a_plant"));
  const r = await deps.pots.place(userId, specimenId, potId, day);
  if (typeof r === "string")
    return failed(appError(r === "pot_taken" ? "equipment.pot_taken" : "equipment.pot_not_found"));
  return ok(r);
}

/** The status of a plant that may stand in a pot (a cutting is potted out first, US-BES-04). */
const PLANT_STATUS = "plant" as const;

const schema = shape({
  specimenId: idField("specimenId"),
  potId: orNull(idField("potId")),
  timeZone: timeZoneField("timeZone"),
  date: orNull(calendarDateField("date")),
});

const FUTURE = appError("specimen.repotted_in_future", {
  details: [{ field: "date", code: "specimen.repotted_in_future" }],
});

export interface PlaceDependencies {
  readonly specimens: PlaceSpecimens;
  readonly pots: PotPlacementStore;
  /** The clock for "today" in the keeper's zone (NFR-08). */
  readonly clock: () => Date;
  /** Whether the keeper switched the equipment off (US-ONB-09): a pot is then named by no operation. */
  readonly keeperOff: (userId: string) => Promise<boolean>;
}

/**
 * "Pot placed" (US-BES-19, DM-EQU-06): puts a plant into one of the keeper's pots on the local day (`date`, not after
 * today in `timeZone`, else `specimen.repotted_in_future`; default today), or takes it out with `potId` null. The plant's
 * open placement is closed on that day and the new one opens; placing it into the pot it sits in already changes nothing.
 * While the equipment switch is off a pot is refused with `onboarding.keeper_off`; taking out stays possible.
 */
export const equipmentPlacePot = (deps: PlaceDependencies) =>
  defineOperation({
    name: "equipment.place_pot",
    schema,
    run: async ({ userId }, input) => {
      if (input.potId !== null && (await deps.keeperOff(userId)))
        return failed(appError("onboarding.keeper_off", { data: { id: EQUIPMENT_KEEPER_SWITCH } }));
      const today = localToday(deps.clock(), input.timeZone);
      if (input.date !== null && input.date > today) return failed(FUTURE);
      return placePlant(deps, userId, {
        specimenId: input.specimenId,
        potId: input.potId,
        day: input.date ?? today,
      });
    },
  });
