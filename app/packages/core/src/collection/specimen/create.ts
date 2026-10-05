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
  calendarDateField,
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
  species_unknown: "species.not_found",
} as const;

/** A back-dated catch date must not lie after the keeper's local today (FR-BES-04). */
const isFuture = (catchDate: string | null, today: string) =>
  catchDate !== null && catchDate > today;
const CAUGHT_IN_FUTURE = appError("specimen.caught_in_future", {
  details: [{ field: "catchDate", code: "specimen.caught_in_future" }],
});

export interface CreateDependencies {
  readonly specimens: SpecimenStore;
  readonly species: SpeciesSource;
  readonly targetLocation: TargetLocationSource;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

// The client sends the keeper's time zone (profile zone, device as fallback, US-ACC-02); it determines "today".
const schema = shape({
  speciesId: idField("speciesId"),
  timeZone: timeZoneField("timeZone"),
  marker: orNull(textField("marker", SPECIMEN_LIMITS.marker)),
  // Markers for existing specimens without one, from the 3rd specimen on (US-BES-03).
  markers: markerAnswersField,
  locationId: orNull(idField("locationId")),
  status: orNull(choiceField("status", CREATE_STATUS)),
  // Back-dating (FR-BES-04): a calendar date `YYYY-MM-DD`, not after the keeper's local today.
  catchDate: orNull(calendarDateField("catchDate")),
});

/**
 * Creates a specimen (US-BES-02): the species is required. The name is fixed before saving (DM-BES-03); if it is
 * taken, nothing is written and the error names the existing specimens of the species (FR-BES-03, P-10). A further
 * specimen needs a marker, and from the third active one on the active specimens without a marker need one too
 * (`markers`); `planMarkers` decides, the store writes everything or nothing (US-BES-03).
 * `caught_at` is the given `catchDate` (back-dating, never after the keeper's local today, else
 * `specimen.caught_in_future`) or today's date in the user's time zone (FR-BES-04). The location is the chosen one, else
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
      if (isFuture(input.catchDate, today)) return failed(CAUGHT_IN_FUTURE);
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
        {
          speciesId: species.id,
          name,
          marker: input.marker,
          locationId,
          caughtAt: input.catchDate ?? today,
          status,
        },
        plan.assignments,
      );
      if (typeof r === "object") return ok(withDerivations(r));
      if (r !== "name_taken") return failed(appError(REFUSED[r]));
      const existing = siblings.map(({ id, name: n }) => ({ id, name: n }));
      return failed(appError("specimen.name_taken", { data: { name, existing } }));
    },
  });
