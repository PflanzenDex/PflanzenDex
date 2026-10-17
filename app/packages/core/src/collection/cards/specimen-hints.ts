// Hints about incomplete specimens (US-BES-08): a pure derivation, never stored (P-01). A specimen without a readable
// species, without a location or in a location without light zone drops out of evaluations such as the light
// distribution; here it is named instead, with the action that fixes it (P-09, P-10).
import type { LightLocation, LightLocationStore } from "../../light";
import type { SpeciesSource, SpecimenRow, SpecimenStore } from "../shared/types";
import { isActive } from "../shared/types";

export interface SpecimenHint {
  readonly kind: "species_missing" | "location_missing" | "location_without_zone";
  readonly specimenId: string;
  readonly specimenName: string;
  /** The location the hint is about; `null` if the specimen has none. */
  readonly locationId: string | null;
  readonly text: string;
  /** P-09: every view says what to do next. */
  readonly nextAction: string;
}

/** Reading ports; every call applies to the account only (P-04). */
export interface HintsDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
  readonly locations: LightLocationStore;
}

const hint = (
  kind: SpecimenHint["kind"],
  z: SpecimenRow,
  text: string,
  nextAction: string,
): SpecimenHint => ({
  kind,
  specimenId: z.id,
  specimenName: z.name,
  locationId: z.locationId,
  text,
  nextAction,
});

function locationHint(z: SpecimenRow, locations: ReadonlyMap<string, LightLocation>) {
  const location = z.locationId === null ? undefined : locations.get(z.locationId);
  if (!location)
    return hint(
      "location_missing",
      z,
      `„${z.name}“ hat noch keinen Standort.`,
      "Weise dem Exemplar einen Standort zu.",
    );
  if (location.lightZoneId !== null) return null;
  return hint(
    "location_without_zone",
    z,
    `„${z.name}“ steht am Standort „${location.name}“, der noch keine Lichtzone hat.`,
    `Weise dem Standort „${location.name}“ eine Lichtzone zu.`,
  );
}

/**
 * Hints for the active specimens of the account (archived ones are no longer part of the collection, US-BES-07),
 * sorted by name. A species the account cannot read counts as missing; the database forbids a specimen without a
 * species, so this guards a species that vanished from view.
 */
export async function specimenHints(
  deps: HintsDependencies,
  userId: string,
): Promise<readonly SpecimenHint[]> {
  const [rows, locationList] = await Promise.all([
    deps.specimens.list(userId),
    deps.locations.list(userId),
  ]);
  const active = rows.filter(isActive);
  const locations = new Map(locationList.map((s) => [s.id, s] as const));
  const speciesIds = [...new Set(active.map((z) => z.speciesId))];
  const found = await deps.species.findMany(userId, speciesIds);
  const readable = new Set(speciesIds.filter((_, i) => found[i]));
  const hints = active.flatMap((z) => [
    ...(readable.has(z.speciesId)
      ? []
      : [
          hint(
            "species_missing",
            z,
            `Die Art von „${z.name}“ ist nicht lesbar.`,
            "Wähle für das Exemplar eine Art aus dem Katalog.",
          ),
        ]),
    ...[locationHint(z, locations)].filter((h) => h !== null),
  ]);
  return hints.sort((a, b) => a.specimenName.localeCompare(b.specimenName, "de"));
}
