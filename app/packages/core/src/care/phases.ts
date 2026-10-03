import { appError, failed, localToday, isTimeZone, ok, type Result } from "../kernel";
import type { SpeciesSource, SpecimenStore } from "../collection";
import { carePhase, type CarePhase } from "./phase";

export interface PhasesDependencies {
  readonly specimens: Pick<SpecimenStore, "list">;
  readonly species: SpeciesSource;
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
   * Target location of the phase. It belongs to the care profile of the keeper (FR-PHA-02, BES-09), which does not
   * exist yet: until then always `null` = unknown, never invented (P-08).
   */
  readonly targetLocationId: string | null;
}

/**
 * Phase per active specimen (US-PHA-01): listed is what is a plant (not cutting, not archived, FR-PHA-04) and whose
 * species has a dormancy period. `today` is the date in `timeZone`. Sorted by name.
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
  const today = localToday(deps.clock(), timeZone);
  const active = (await deps.specimens.list(userId)).filter((z) => z.status === "plant");
  const speciesIds = [...new Set(active.map((z) => z.speciesId))];
  const species = new Map(
    await Promise.all(
      speciesIds.map(async (id) => [id, await deps.species.find(userId, id)] as const),
    ),
  );
  const rows: PhasesRow[] = [];
  for (const z of active) {
    const spec = species.get(z.speciesId);
    if (!spec?.dormancyFrom || !spec.dormancyUntil) continue;
    rows.push({
      specimenId: z.id,
      name: z.name,
      speciesId: z.speciesId,
      phase: carePhase(spec.dormancyFrom, spec.dormancyUntil, today),
      locationId: z.locationId,
      targetLocationId: null,
    });
  }
  return ok(rows.sort((a, b) => a.name.localeCompare(b.name, "de")));
}
