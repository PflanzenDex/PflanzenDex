import {
  defineOperation,
  appError,
  failed,
  shape,
  timeZoneField,
  idListField,
  type Result,
} from "../kernel";
import type { SpecimenStore } from "../collection";
import type { PhasesDependencies } from "./phases";

export interface SwitchDependencies extends PhasesDependencies {
  readonly specimens: Pick<SpecimenStore, "list" | "find" | "setLocations">;
}

/** What a confirmed specimen looks like afterwards; `changed` is false if it already stood at the target. */
export interface SwitchedSpecimen {
  readonly specimenId: string;
  readonly locationId: string;
  readonly changed: boolean;
}

export interface SwitchResult {
  readonly specimens: readonly SwitchedSpecimen[];
}

/** Most specimens one confirmation takes (assumption, starting value). */
export const MAX_SWITCH = 100;

const schema = shape({
  specimenIds: idListField("specimenIds", MAX_SWITCH),
  timeZone: timeZoneField("timeZone"),
});

/** Skeleton: red tests first (US-PHA-03). */
export const phaseSwitchConfirm = (deps: SwitchDependencies) =>
  defineOperation({
    name: "care.confirm_switch",
    schema,
    run: async (): Promise<Result<SwitchResult>> => {
      void deps;
      return failed(appError("system.unexpected"));
    },
  });
