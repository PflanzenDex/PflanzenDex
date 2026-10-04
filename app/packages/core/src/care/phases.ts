import { appError, failed, localToday, isTimeZone, ok, type Result } from "../kernel";
import type { SpeciesSource, SpecimenStore } from "../collection";
import { carePhase, type CarePhase } from "./phase";
import type { PhaseLocationSource } from "./phase-location";

export interface PhasesDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
  /** Location per phase of the keeper (care profile, US-BES-09); until it exists nobody knows one (P-08). */
  readonly targets: PhaseLocationSource;
  /** The clock comes from outside so that "today" is testable (NFR-08). */
  readonly clock: () => Date;
}

/** A row of the phase list (US-PHA-01). Everything here is derived, none of it is stored. */
export interface PhasesRow {
  readonly specimenId: string;
  readonly name: string;
  readonly speciesId: string;
  readonly phase: CarePhase;
  /** Kennung des heutigen Standorts des Exemplars; `null` = unbekannt. */
  readonly locationId: string | null;
  /**
   * Target location of today's phase, selected by the keeper in their care profile (FR-PHA-02, BES-09). `null` =
   * unknown, never invented (P-08): that is always the case until the profile exists.
   */
  readonly targetLocationId: string | null;
}

/**
 * The rows of the phase list for the local calendar date `today`: what is a plant (not cutting, not archived,
 * FR-PHA-04) and whose species has a dormancy period. Sorted by name. The list (US-PHA-01) and the confirmation of a
 * move (US-PHA-03) both use it, so they can never disagree about phase and target.
 */
export async function phaseRows(
  deps: PhasesDependencies,
  userId: string,
  today: string,
): Promise<readonly PhasesRow[]> {
  const active = (await deps.specimens.list(userId)).filter((z) => z.status === "plant");
  const speciesIds = [...new Set(active.map((z) => z.speciesId))];
  const species = new Map(
    await Promise.all(
      speciesIds.map(async (id) => [id, await deps.species.find(userId, id)] as const),
    ),
  );
  const rows = await Promise.all(
    active.flatMap((z) => {
      const spec = species.get(z.speciesId);
      if (!spec?.dormancyFrom || !spec.dormancyUntil) return [];
      const phase = carePhase(spec.dormancyFrom, spec.dormancyUntil, today);
      return [
        deps.targets
          .phaseLocation(userId, z.speciesId, phase)
          .then((targetLocationId): PhasesRow => ({
            specimenId: z.id,
            name: z.name,
            speciesId: z.speciesId,
            phase,
            locationId: z.locationId,
            targetLocationId,
          })),
      ];
    }),
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/**
 * Phase per active specimen (US-PHA-01). `today` is the date in `timeZone` (NFR-08), never the UTC date.
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
  return ok(await phaseRows(deps, userId, localToday(deps.clock(), timeZone)));
}
