import { isId } from "../../kernel";
import { isActive, type Specimen, type SpecimenStore, type SpecimenRow } from "./types";

/**
 * Attaches the derived lists (P-01: computed, never stored). Measurements (WAC) and treatment list (BEH)
 * do not exist yet, so both are empty; once those modules supply data, they arrive here via their ports.
 */
export const withDerivations = (row: SpecimenRow): Specimen => ({
  ...row,
  measurements: [],
  treatments: [],
});

/** The list of active specimens; archived ones are in the archive (US-BES-07), not here. */
export async function specimenList(
  store: SpecimenStore,
  userId: string,
): Promise<readonly Specimen[]> {
  return (await store.list(userId)).filter(isActive).map(withDerivations);
}

/** An archived specimen also stays loadable with its history (US-BES-07). `null` if the specimen does not exist or belongs to another account (both look the same, P-04). */
export async function specimenLoad(
  store: SpecimenStore,
  userId: string,
  id: string,
): Promise<Specimen | null> {
  if (!isId(id)) return null;
  const row = await store.find(userId, id.toLowerCase());
  return row ? withDerivations(row) : null;
}
