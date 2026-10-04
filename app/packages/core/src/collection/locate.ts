import { defineOperation, appError, failed, idField, shape } from "../kernel";
import type { SpecimenStore } from "./types";

export interface LocateDependencies {
  readonly specimens: SpecimenStore;
}

const schema = shape({ specimenId: idField("specimenId"), locationId: idField("locationId") });

/** Skeleton: red tests first (US-PHA-03). */
export const specimenSetLocation = (deps: LocateDependencies) =>
  defineOperation({
    name: "specimen.set_location",
    schema,
    run: async () => {
      void deps;
      return failed(appError("system.unexpected"));
    },
  });
