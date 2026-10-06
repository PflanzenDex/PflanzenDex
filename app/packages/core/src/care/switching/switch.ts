import {
  defineOperation,
  appError,
  failed,
  ok,
  localToday,
  shape,
  timeZoneField,
  idListField,
} from "../../kernel";
import { LOCATE_ERROR, type LocationAssignment, type SpecimenStore } from "../../collection";
import { phaseRows, type PhasesDependencies } from "../phases/phases";

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

/** Why a specimen is not in the phase list: unknown or foreign, archived, or simply without a phase (FR-PHA-04). */
async function notListed(deps: SwitchDependencies, userId: string, specimenId: string) {
  const z = await deps.specimens.find(userId, specimenId);
  const code =
    z === null ? "specimen.not_found" : z.status === "archived" ? "specimen.archived" : null;
  return appError(code ?? "care.no_phase", { data: { specimenId } });
}

/**
 * "Jetzt umgestellt" (US-PHA-03): sets the location of each given specimen to the target location of its care phase
 * today (the local calendar date, NFR-08). The target comes from the keeper's own choice (port `PhaseLocationSource`),
 * never from the input (FR-PHA-03) and is never invented (P-08). All or nothing: if one specimen cannot be switched
 * (foreign, archived, cutting, no dormancy period, no known target) the call names it and writes nothing. A specimen
 * that already stands at the target stays as it is and reports `changed: false`, so a repeat or a double tap is
 * harmless (US-QS-03). Phase and target are the ones of the phase list, so list and confirmation agree.
 */
export const phaseSwitchConfirm = (deps: SwitchDependencies) =>
  defineOperation({
    name: "care.confirm_switch",
    schema,
    run: async ({ userId }, input) => {
      const rows = await phaseRows(deps, userId, localToday(deps.clock(), input.timeZone));
      const byId = new Map(rows.map((r) => [r.specimenId, r] as const));
      const plan: LocationAssignment[] = [];
      for (const specimenId of input.specimenIds) {
        const target = byId.get(specimenId)?.targetLocationId;
        if (target === undefined) return failed(await notListed(deps, userId, specimenId));
        if (target === null)
          return failed(appError("care.target_unknown", { data: { specimenId } }));
        plan.push({ specimenId, locationId: target });
      }
      const done = await deps.specimens.setLocations(userId, plan);
      if (typeof done === "string") return failed(appError(LOCATE_ERROR[done]));
      return ok<SwitchResult>({
        specimens: plan.map((p) => ({
          ...p,
          changed: byId.get(p.specimenId)?.locationId !== p.locationId,
        })),
      });
    },
  });
