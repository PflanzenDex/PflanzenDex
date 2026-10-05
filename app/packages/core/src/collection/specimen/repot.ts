import { defineOperation, appError, failed, idField, shape, ok } from "../../kernel";
import type { SpecimenStore } from "../shared/types";

export interface RepotDependencies {
  readonly specimens: SpecimenStore;
}

const schema = shape({ specimenId: idField("specimenId") });

const ERROR = {
  not_found: "specimen.not_found",
  not_a_cutting: "specimen.not_a_cutting",
} as const;

/**
 * "Repotted" (US-BES-04): a cutting becomes a plant. The status is the only stored part of the cutting assignment;
 * the light zone is derived (`cuttingLight`), so from now on the zone of the location or species applies again
 * without an override to delete. Anything else (plant, archived) stays unchanged and reports
 * `specimen.not_a_cutting`; a foreign or unknown specimen looks the same: 404 (P-04).
 */
export const specimenRepot = (deps: RepotDependencies) =>
  defineOperation({
    name: "specimen.repot",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.specimens.repot(userId, input.specimenId);
      return typeof r === "string" ? failed(appError(ERROR[r])) : ok(r);
    },
  });
