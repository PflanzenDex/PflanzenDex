import { defineOperation, appError, failed, idField, ok, shape, textField } from "../kernel";
import { markerTaken } from "./markers";
import { speciesDisplayName, specimenName } from "./name";
import { withDerivations } from "./read";
import { SPECIMEN_LIMITS } from "./types";
import type { SpeciesSource, SpecimenStore } from "./types";

export interface MarkDependencies {
  readonly specimens: SpecimenStore;
  readonly species: SpeciesSource;
}

const schema = shape({
  specimenId: idField("specimenId"),
  marker: textField("marker", SPECIMEN_LIMITS.marker),
});

const ERROR = {
  not_found: "specimen.not_found",
  archived: "specimen.archived",
  name_taken: "specimen.name_taken",
  marker_taken: "specimen.marker_taken",
} as const;

/**
 * Gives a specimen a marker or changes it (US-BES-03): the marker is required and unique per species,
 * case-insensitive (its own current marker may change case). The name follows the naming rule (DM-BES-03). The name
 * is display text: the ID, and with it every reference, stays (renaming changes no references). An archived specimen is
 * not renamed (its name stays taken, US-BES-07); a foreign or unknown one looks the same: `specimen.not_found` (P-04).
 */
export const specimenMark = (deps: MarkDependencies) =>
  defineOperation({
    name: "specimen.mark",
    schema,
    run: async ({ userId }, input) => {
      const row = await deps.specimens.find(userId, input.specimenId);
      if (!row) return failed(appError(ERROR.not_found));
      if (row.status === "archived") return failed(appError(ERROR.archived));
      const species = await deps.species.find(userId, row.speciesId);
      if (!species) return failed(appError("species.not_found"));
      const others = (await deps.specimens.list(userId)).filter(
        (z) => z.speciesId === row.speciesId && z.id !== row.id,
      );
      if (markerTaken(others, input.marker)) return failed(appError(ERROR.marker_taken));
      const name = specimenName(speciesDisplayName(species), input.marker);
      const r = await deps.specimens.mark(userId, row.id, { name, marker: input.marker });
      return typeof r === "string" ? failed(appError(ERROR[r])) : ok(withDerivations(r));
    },
  });
