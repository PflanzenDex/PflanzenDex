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
  choiceField,
} from "../kernel";
import { withDerivations } from "./read";
import { speciesDisplayName, specimenName } from "./name";
import { markerAnswersField, planMarkers } from "./markers";
import { CREATE_STATUS, SPECIMEN_LIMITS } from "./types";
import type { SpeciesSource, SpecimenStore, TargetLocationSource } from "./types";

/** What the store can refuse besides a taken name (which also reports the existing specimens). */
const REFUSED = {
  marker_taken: "specimen.marker_taken",
  location_unknown: "location.not_found",
  specimen_unknown: "specimen.not_found",
} as const;

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
  // Markers for existing specimens without one, from the 3rd specimen on (US-BES-03).
  markers: markerAnswersField,
  locationId: orNull(idField("locationId")),
  status: orNull(choiceField("status", CREATE_STATUS)),
});

/**
 * Creates a specimen (US-BES-02): the species is required. The name is fixed before saving (DM-BES-03); if it is
 * taken, nothing is written and the error names the existing specimens of the species (FR-BES-03, P-10).
 * `caught_at` is today's date in the user's time zone (FR-BES-04). The location is the chosen one, else
 * the target location from the port, else unknown (P-08). A cutting (`status: "cutting"`, US-BES-04) stands at the
 * location of the growth phase, even when the species is dormant right now; without a value the specimen is a plant.
 */
export const specimenCreate = (deps: CreateDependencies) =>
  defineOperation({
    name: "specimen.create",
    schema,
    run: async ({ userId }, input) => {
      const species = await deps.species.find(userId, input.speciesId);
      if (!species) return failed(appError("species.not_found"));
      const today = localToday(deps.clock(), input.timeZone);
      const speciesName = speciesDisplayName(species);
      const name = specimenName(speciesName, input.marker);
      const siblings = (await deps.specimens.list(userId)).filter(
        (z) => z.speciesId === species.id,
      );
      const plan = planMarkers({
        speciesName,
        marker: input.marker,
        answers: input.markers,
        siblings,
      });
      if (plan.kind === "failed") return failed(plan.error);
      const status = input.status ?? "plant";
      const locationId =
        input.locationId ??
        (status === "cutting"
          ? await deps.targetLocation.growthLocation(userId, species)
          : await deps.targetLocation.targetLocation(userId, species, today));
      const r = await deps.specimens.create(
        userId,
        { speciesId: species.id, name, marker: input.marker, locationId, caughtAt: today, status },
        plan.assignments,
      );
      if (typeof r === "object") return ok(withDerivations(r));
      if (r !== "name_taken") return failed(appError(REFUSED[r]));
      const existing = siblings.map(({ id, name: n }) => ({ id, name: n }));
      return failed(appError("specimen.name_taken", { data: { name, existing } }));
    },
  });
