import { defineOperation, appError, failed, idField, shape, ok } from "../kernel";
import type { SpecimenRow, SpecimenStore } from "./types";

export interface LocateDependencies {
  readonly specimens: Pick<SpecimenStore, "setLocations">;
}

const schema = shape({ specimenId: idField("specimenId"), locationId: idField("locationId") });

/** Store answers that mean the call was refused, with the code the user sees. */
export const LOCATE_ERROR = {
  specimen_unknown: "specimen.not_found",
  archived: "specimen.archived",
  location_unknown: "location.not_found",
} as const;

/**
 * Sets the location of a specimen to one of the account's locations (US-PHA-03, the action behind the BES-08 hint
 * "location missing"). The location is selected by ID, never typed (FR-PHA-03); the foreign key of the database ties it
 * to the own account (P-04). Setting the location the specimen already has changes nothing, so a repeat is harmless
 * (US-QS-03). An archived specimen stays unchanged (US-BES-07); a foreign or unknown one looks the same: not found.
 */
export const specimenSetLocation = (deps: LocateDependencies) =>
  defineOperation({
    name: "specimen.set_location",
    schema,
    run: async ({ userId }, input) => {
      const r = await deps.specimens.setLocations(userId, [
        { specimenId: input.specimenId, locationId: input.locationId },
      ]);
      return typeof r === "string" ? failed(appError(LOCATE_ERROR[r])) : ok(r[0] as SpecimenRow);
    },
  });
