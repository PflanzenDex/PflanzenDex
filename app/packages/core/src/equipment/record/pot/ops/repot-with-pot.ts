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
import { specimenRepot, type SpecimenRow } from "../../../../collection";
import { EQUIPMENT_KEEPER_SWITCH, type PlacementResult, type PotRepotUnit } from "../types";
import { placePlant } from "./place";

export interface RepotWithPotDependencies {
  readonly unit: PotRepotUnit;
  readonly clock: () => Date;
  readonly keeperOff: (userId: string) => Promise<boolean>;
}

const schema = shape({
  specimenId: idField("specimenId"),
  timeZone: orNull(timeZoneField("timeZone")),
  date: orNull(calendarDateField("date")),
  potId: orNull(idField("potId")),
});

/** The answer of a repot with a pot: the plant after the repot and where it sits now. */
export interface RepotWithPotResult {
  readonly specimen: SpecimenRow;
  readonly pot: PlacementResult | null;
}

/**
 * The repot of a plant that also names its pot (US-BES-04, US-BES-19, DM-EQU-06), one unit of work: the repot runs
 * first with its own checks (archived, day, catch date); then the placement on the same day closes the old placement and
 * opens the new one, or takes the plant out of its pot when no pot is named. A refused step rolls back the other one, so
 * a plant is never repotted without its pot or the other way round. A plant without a day cannot name a pot: `input.invalid`
 * on `timeZone`. With the equipment switch off a pot is refused with `onboarding.keeper_off`.
 */
export const specimenRepotWithPot = (deps: RepotWithPotDependencies) =>
  defineOperation({
    name: "specimen.repot_with_pot",
    schema,
    run: async ({ userId }, input): Promise<Result<RepotWithPotResult>> => {
      if (input.potId !== null && (await deps.keeperOff(userId)))
        return failed(appError("onboarding.keeper_off", { data: { id: EQUIPMENT_KEEPER_SWITCH } }));
      const day = input.date ?? (input.timeZone ? localToday(deps.clock(), input.timeZone) : null);
      return deps.unit.run(
        userId,
        async (steps): Promise<{ commit: boolean; value: Result<RepotWithPotResult> }> => {
          const repot = await specimenRepot({ specimens: steps.specimens, clock: deps.clock }).run(
            { userId },
            input,
          );
          if (!repot.ok) return { commit: false, value: failed(repot.error) };
          if (day === null) {
            if (input.potId !== null)
              return {
                commit: false,
                value: failed(
                  appError("input.invalid", {
                    details: [{ field: "timeZone", code: "input.invalid" }],
                  }),
                ),
              };
            return { commit: true, value: ok({ specimen: repot.value, pot: null }) };
          }
          const placed = await placePlant(
            { specimens: steps.specimens, pots: steps.pots },
            userId,
            {
              specimenId: input.specimenId,
              potId: input.potId,
              day,
            },
          );
          if (!placed.ok) return { commit: false, value: failed(placed.error) };
          return { commit: true, value: ok({ specimen: repot.value, pot: placed.value }) };
        },
      );
    },
  });
