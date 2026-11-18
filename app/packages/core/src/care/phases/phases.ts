import { appError, failed, localToday, isTimeZone, ok, type Result } from "../../kernel";
import {
  effectiveDormancy,
  speciesDisplayName,
  type CareProfileReader,
  type MeasurementSource,
  type SpeciesSource,
  type SpecimenStore,
} from "../../collection";
import { carePhase, nextPhaseChange, type CarePhase, type NextPhaseChange } from "./phase";
import { NO_PHASE_LOCATION, type PhaseLocationSource } from "./phase-location";
import { deviationsFirst } from "./phase-status";

/** The photo port of the list (`care`, US-WAC-06): the most recent photo per plant, read by `carePhasesList` only. */
export type PhotoSource = Pick<MeasurementSource, "forSpecimens">;

export interface PhasesDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
  /** Location per phase of the keeper (care profile, US-BES-09); until it exists nobody knows one (P-08). */
  readonly targets: PhaseLocationSource;
  /** The care profile: its dormancy period replaces the catalog's (US-BES-09, FR-BES-09). */
  readonly profiles: CareProfileReader;
  /**
   * The photos of the rows' thumbnails (US-QS-32). Only the list (`carePhasesList`) reads them; a move, the offers and
   * the sharing never do. Without it the rows have no photo and show the drawn placeholder (SG-PHOTO-02).
   */
  readonly photos?: PhotoSource;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

/** A row of the phase list (US-PHA-01). Everything here is derived, none of it is stored. */
export interface PhasesRow {
  readonly specimenId: string;
  /** The specimen's name as stored (`Species – marker`, DM-BES-03). */
  readonly name: string;
  /** The marker, the plant's own name where it has one (owner answer Q-68); `null` = none. */
  readonly marker: string | null;
  /** The species as the keeper calls it (German, else Latin); the title of a plant without its own name (SG-LIST-07). */
  readonly speciesName: string;
  readonly speciesId: string;
  readonly phase: CarePhase;
  /** ID of the specimen's location today; `null` = unknown. */
  readonly locationId: string | null;
  /**
   * Target location of today's phase, selected by the keeper in their care profile (FR-PHA-02, BES-09). `null` =
   * unknown, never invented (P-08): that is always the case until the profile exists.
   */
  readonly targetLocationId: string | null;
  /** The next phase change from today on (US-PHA-04); `null` = none in this and the next year. */
  readonly nextChange: NextPhaseChange | null;
  /** The most recent photo of the plant; `null` = none, or the list read did not ask for photos (P-08). */
  readonly photo: { readonly url: string } | null;
}

/**
 * The rows of the phase list for the local calendar date `today`: what is a plant (not cutting, not archived,
 * FR-PHA-04) and whose species has a dormancy period. Deviations first (US-PHA-02), by name inside a group. The list
 * (US-PHA-01), the confirmation of a move (US-PHA-03) and the offers (`carePhasesOf`) all use it, so they can never
 * disagree about phase and target. It reads no photo: the list adds them (`carePhasesList`).
 */
export async function phaseRows(
  deps: PhasesDependencies,
  userId: string,
  today: string,
): Promise<readonly PhasesRow[]> {
  const [active, own] = await Promise.all([
    deps.specimens.list(userId).then((all) => all.filter((z) => z.status === "plant")),
    deps.profiles.list(userId).then((list) => new Map(list.map((p) => [p.speciesId, p] as const))),
  ]);
  const speciesIds = [...new Set(active.map((z) => z.speciesId))];
  const read = await deps.species.findMany(userId, speciesIds);
  const species = new Map(speciesIds.map((id, i) => [id, read[i] ?? null] as const));
  const rows = await Promise.all(
    active.flatMap((z) => {
      const spec = species.get(z.speciesId);
      const period = spec ? effectiveDormancy(spec, own.get(z.speciesId) ?? null) : null;
      if (!spec || !period) return [];
      const phase = carePhase(period.from, period.until, today);
      return [
        deps.targets
          .phaseLocation(userId, z.speciesId, phase, own)
          .then((targetLocationId): PhasesRow => ({
            specimenId: z.id,
            name: z.name,
            marker: z.marker,
            speciesName: speciesDisplayName(spec),
            speciesId: z.speciesId,
            phase,
            locationId: z.locationId,
            targetLocationId,
            nextChange: nextPhaseChange(period.from, period.until, today),
            photo: null,
          })),
      ];
    }),
  );
  return deviationsFirst(rows.sort((a, b) => a.name.localeCompare(b.name, "de")));
}

/**
 * The most recent photo of each kept row (NFR-12): one read for the plants that stay in the list, none when no photo
 * source is wired or the list is empty. Rows without a photo keep `photo: null`.
 */
async function withPhotos(
  photos: PhotoSource | undefined,
  userId: string,
  rows: readonly PhasesRow[],
): Promise<readonly PhasesRow[]> {
  if (photos === undefined || rows.length === 0) return rows;
  const pictures = await photos.forSpecimens(
    userId,
    rows.map((r) => r.specimenId),
  );
  return rows.map((r) => {
    const picture = pictures.get(r.specimenId)?.photo;
    return picture ? { ...r, photo: { url: picture.url } } : r;
  });
}

/**
 * Phase per active specimen (US-PHA-01), with the photo of each row (US-QS-32). `today` is the date in `timeZone`
 * (NFR-08), never the UTC date.
 */
export async function carePhasesList(
  deps: PhasesDependencies,
  userId: string,
  timeZone: unknown,
): Promise<Result<readonly PhasesRow[]>> {
  if (!isTimeZone(timeZone))
    return failed(
      appError("input.invalid", { details: [{ field: "timeZone", code: "input.invalid" }] }),
    );
  const rows = await phaseRows(deps, userId, localToday(deps.clock(), timeZone));
  return ok(await withPhotos(deps.photos, userId, rows));
}

/**
 * The care phase today of the named specimens of the account, read from the same rows as the phase list, so an offer
 * and the list can never disagree. Only the phase is asked: the targets are not read, so the statements do not grow with
 * the specimens (NFR-12). Only the named specimens reach the species read, so it asks for their species and no others
 * (NFR-12, US-SOZ-09). No photo is read (the list does that). A specimen without a phase (a cutting, an archived one, a
 * species without dormancy period, a foreign one) is missing from the map, which means `null` (P-08). `timeZone` decides
 * "today" (NFR-08) and is checked by the caller.
 */
export async function carePhasesOf(
  deps: Omit<PhasesDependencies, "targets">,
  userId: string,
  specimenIds: readonly string[],
  timeZone: string,
): Promise<ReadonlyMap<string, CarePhase>> {
  if (specimenIds.length === 0) return new Map();
  const wanted = new Set(specimenIds);
  const specimens = {
    list: async (owner: string) =>
      (await deps.specimens.list(owner)).filter((z) => wanted.has(z.id)),
  };
  const rows = await phaseRows(
    { ...deps, specimens, targets: NO_PHASE_LOCATION },
    userId,
    localToday(deps.clock(), timeZone),
  );
  return new Map(rows.map((r) => [r.specimenId, r.phase] as const));
}
