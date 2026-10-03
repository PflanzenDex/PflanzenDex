import {
  defineOperation,
  appError,
  failed,
  localToday,
  idField,
  shape,
  ok,
  orNull,
  textField,
  timeZoneField,
} from "../kernel";
import { withDerivations } from "./read";
import { speciesDisplayName, specimenName } from "./name";
import { SPECIMEN_LIMITS } from "./types";
import type { SpeciesSource, SpecimenStore, TargetLocationSource } from "./types";

export interface CreateDependencies {
  readonly specimens: SpecimenStore;
  readonly species: SpeciesSource;
  readonly targetLocation: TargetLocationSource;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

// For now the device sends the time zone (the profile has none yet, US-ACC-02); it determines "today".
const schema = shape({
  speciesId: idField("speciesId"),
  timeZone: timeZoneField("timeZone"),
  marker: orNull(textField("marker", SPECIMEN_LIMITS.marker)),
  locationId: orNull(idField("locationId")),
});

/**
 * Creates a specimen (US-BES-02): the species is required. The name is fixed before saving (DM-BES-03); if it is
 * taken, nothing is written and the error names the existing specimens of the species (FR-BES-03, P-10).
 * `caught_at` is today's date in the user's time zone (FR-BES-04). The location is the chosen one, else
 * the target location from the port, else unknown (P-08).
 */
export const specimenCreate = (deps: CreateDependencies) =>
  defineOperation({
    name: "specimen.create",
    schema,
    run: async ({ userId }, input) => {
      const species = await deps.species.find(userId, input.speciesId);
      if (!species) return failed(appError("species.not_found"));
      const today = localToday(deps.clock(), input.timeZone);
      const name = specimenName(speciesDisplayName(species), input.marker);
      const locationId =
        input.locationId ?? (await deps.targetLocation.targetLocation(userId, species, today));
      const r = await deps.specimens.create(userId, {
        speciesId: species.id,
        name,
        marker: input.marker,
        locationId,
        caughtAt: today,
      });
      if (r === "location_unknown") return failed(appError("location.not_found"));
      if (r !== "name_taken") return ok(withDerivations(r));
      const existing = (await deps.specimens.list(userId))
        .filter((z) => z.speciesId === species.id)
        .map(({ id, name: n }) => ({ id, name: n }));
      return failed(appError("specimen.name_taken", { data: { name, existing } }));
    },
  });
