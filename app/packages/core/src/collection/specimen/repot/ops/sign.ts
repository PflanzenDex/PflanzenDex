import {
  appError,
  defineOperation,
  failed,
  idField,
  localToday,
  ok,
  shape,
  timeZoneField,
  choiceField,
} from "../../../../kernel";
import {
  REPOT_PLANNER_KEEPER_SWITCH,
  REPOT_SIGNS,
  type RepotStore,
  type SignRefusal,
} from "../types";

export interface SignDependencies {
  readonly repots: RepotStore;
  /** Whether the keeper has switched the repot planner off (US-ONB-09); then nothing is written (P-12). */
  readonly keeperOff: (userId: string) => Promise<boolean>;
  /** The clock for the local day of the tick (NFR-08); injected so that "today" is testable. */
  readonly clock: () => Date;
}

const schema = shape({
  specimenId: idField("specimenId"),
  sign: choiceField("sign", REPOT_SIGNS),
  timeZone: timeZoneField("timeZone"),
});

/** A plant that is gone, archived or a cutting: the same refusal codes for both sign operations (US-BES-19, P-04). */
const REFUSED: Record<SignRefusal, ReturnType<typeof appError>> = {
  not_found: appError("specimen.not_found"),
  archived: appError("specimen.archived"),
  not_a_plant: appError("specimen.not_a_plant"),
};

/**
 * "Ticked" on one repot observation (US-BES-19): records that the keeper saw "Wurzeln aus dem Topf", "Erde trocknet zu
 * schnell" or "Pflanze kippt" on the local day in `timeZone` (NFR-08). Only an active plant can be ticked; a cutting is
 * potted out (US-BES-04) and not repotted, an archived plant is read only (US-BES-07). The same observation ticked again
 * while it is open writes nothing (US-QS-03). Answers the open observations of the plant after the write.
 */
export const specimenTickRepotSign = (deps: SignDependencies) =>
  defineOperation({
    name: "specimen.tick_repot_sign",
    schema,
    run: async ({ userId }, input) => {
      if (await deps.keeperOff(userId))
        return failed(
          appError("onboarding.keeper_off", { data: { id: REPOT_PLANNER_KEEPER_SWITCH } }),
        );
      const day = localToday(deps.clock(), input.timeZone);
      const r = await deps.repots.tickSign(userId, input.specimenId, input.sign, day);
      return typeof r === "string"
        ? failed(REFUSED[r])
        : ok({ specimenId: input.specimenId, signs: r });
    },
  });

/**
 * Clears one repot observation again (US-BES-19): the keeper saw it wrong or it is gone. The tick and the clearing day
 * both stay in the history (P-10); an observation that is not open writes nothing. The same refusals as the tick.
 */
export const specimenUntickRepotSign = (deps: SignDependencies) =>
  defineOperation({
    name: "specimen.untick_repot_sign",
    schema,
    run: async ({ userId }, input) => {
      if (await deps.keeperOff(userId))
        return failed(
          appError("onboarding.keeper_off", { data: { id: REPOT_PLANNER_KEEPER_SWITCH } }),
        );
      const day = localToday(deps.clock(), input.timeZone);
      const r = await deps.repots.untickSign(userId, input.specimenId, input.sign, day);
      return typeof r === "string"
        ? failed(REFUSED[r])
        : ok({ specimenId: input.specimenId, signs: r });
    },
  });
