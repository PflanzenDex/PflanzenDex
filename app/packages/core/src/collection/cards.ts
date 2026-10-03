// Specimen cards (US-BES-06): a pure derivation from specimens, locations, zones and the ports for measurements and
// treatments (P-01: computed, never stored). What is missing stays `null` and means "unknown" (P-08).
import type { LightLocationStore, ZoneStore } from "../light";
import type {
  TreatmentSource,
  SpecimenCard,
  DueDate,
  CardMeasurementView,
  MeasurementSource,
  OpenTreatment,
} from "./cards-types";
import { cuttingLight } from "./cutting-light";
import { speciesDisplayName } from "./name";
import { isActive, type SpeciesSource, type SpecimenStore, type SpecimenRow } from "./types";

export interface CardsDependencies {
  readonly specimens: SpecimenStore;
  readonly species: SpeciesSource;
  readonly locations: LightLocationStore;
  readonly zones: ZoneStore;
  readonly measurements: MeasurementSource;
  readonly treatments: TreatmentSource;
}

/** Until WAC and BEH deliver their data, there are no measurements and no treatments (nothing is invented). */
export const NO_MEASUREMENTS: MeasurementSource = { forSpecimens: async () => new Map() };
export const NO_TREATMENTS: TreatmentSource = { open: async () => new Map() };

const TAG_MS = 86_400_000;
const dayNumber = (date: string): number => {
  const [j, m, t] = date.split("-").map(Number);
  return Date.UTC(j ?? 0, (m ?? 1) - 1, t ?? 1) / TAG_MS;
};

/**
 * Due date of a treatment as calendar days between two local dates `YYYY-MM-DD` (NFR-08): overdue since N d., due
 * today, in N d. The calculation knows no time of day and no time zone.
 */
export function dueDate(dueAt: string, today: string): DueDate {
  const diff = dayNumber(dueAt) - dayNumber(today);
  if (diff < 0) {
    return { kind: "overdue", days: -diff, text: `überfällig seit ${-diff} Tg.` };
  }
  if (diff === 0) return { kind: "today", days: 0, text: "heute fällig" };
  return { kind: "soon", days: diff, text: `in ${diff} Tg.` };
}

const afterDueDate = (a: OpenTreatment, b: OpenTreatment) =>
  a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id);

function treatmentDisplay(open: readonly OpenTreatment[], today: string) {
  const [first, ...more] = [...open].sort(afterDueDate);
  return {
    treatment: first ? { reason: first.reason, dueDate: dueDate(first.dueAt, today) } : null,
    moreTreatments: more.length,
  };
}

function measurementDisplay(measurement: CardMeasurementView | undefined) {
  return { photo: measurement?.photo ?? null, lastMeasurement: measurement?.last ?? null };
}

/**
 * The cards of all specimens of the account (US-BES-06). The ports for measurements and treatments are asked once for
 * all own specimens, never for foreign ones (P-04). `today` is the user's local date.
 */
export async function specimenCards(
  deps: CardsDependencies,
  userId: string,
  today: string,
): Promise<readonly SpecimenCard[]> {
  // Archived specimens have no card, and the ports do not learn their IDs (US-BES-07).
  const rows = (await deps.specimens.list(userId)).filter(isActive);
  const ids = rows.map((z) => z.id);
  const speciesIds = [...new Set(rows.map((z) => z.speciesId))];
  const [locations, zones, species, measurements, treatments] = await Promise.all([
    deps.locations.list(userId),
    deps.zones.list(userId),
    Promise.all(speciesIds.map((id) => deps.species.find(userId, id))),
    deps.measurements.forSpecimens(userId, ids),
    deps.treatments.open(userId, ids),
  ]);
  const speciesNames = new Map(
    speciesIds.map((id, i) => [id, species[i] ? speciesDisplayName(species[i]) : null] as const),
  );
  // A cutting stands under cutting light, wherever its location lies otherwise (US-BES-04).
  const cuttingZone = cuttingLight(zones)?.name ?? null;
  const card = (z: SpecimenRow): SpecimenCard => {
    const location = locations.find((s) => s.id === z.locationId);
    return {
      id: z.id,
      name: z.name,
      speciesName: speciesNames.get(z.speciesId) ?? null,
      status: z.status,
      location: location?.name ?? null,
      lightZone:
        z.status === "cutting"
          ? cuttingZone
          : (zones.find((l) => l.id === location?.lightZoneId)?.name ?? null),
      caughtAt: z.caughtAt,
      ...measurementDisplay(measurements.get(z.id)),
      ...treatmentDisplay(treatments.get(z.id) ?? [], today),
    };
  };
  return rows.map(card);
}
