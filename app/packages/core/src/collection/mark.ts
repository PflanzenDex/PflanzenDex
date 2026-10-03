import { defineOperation, appError, failed, idField, shape, textField } from "../kernel";
import type { Result } from "../kernel";
import { SPECIMEN_LIMITS } from "./types";
import type { Specimen, SpeciesSource, SpecimenStore } from "./types";

export interface MarkDependencies {
  readonly specimens: SpecimenStore;
  readonly species: SpeciesSource;
}

const schema = shape({
  specimenId: idField("specimenId"),
  marker: textField("marker", SPECIMEN_LIMITS.marker),
});

/** Skeleton for the red run (US-BES-03): no behavior yet. */
export const specimenMark = (deps: MarkDependencies) =>
  defineOperation({
    name: "specimen.mark",
    schema,
    run: async (): Promise<Result<Specimen>> => {
      void deps;
      return failed(appError("system.unexpected"));
    },
  });
