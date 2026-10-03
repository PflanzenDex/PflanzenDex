import { isId } from "../kernel";
import type { Specimen, SpecimenStore, SpecimenRow } from "./types";

/**
 * Attaches the derived lists (P-01: computed, never stored). Measurements (WAC) and treatment list (BEH)
 * do not exist yet, so both are empty; once those modules supply data, they arrive here via their ports.
 */
export const withDerivations = (row: SpecimenRow): Specimen => ({
  ...row,
  measurements: [],
  treatments: [],
});

export async function specimenList(
  store: SpecimenStore,
  userId: string,
): Promise<readonly Specimen[]> {
  return (await store.list(userId)).map(withDerivations);
}

/** `null` if the specimen does not exist or belongs to another account (both look the same, P-04). */
export async function specimenLoad(
  store: SpecimenStore,
  userId: string,
  id: string,
): Promise<Specimen | null> {
  if (!isId(id)) return null;
  const row = await store.find(userId, id.toLowerCase());
  return row ? withDerivations(row) : null;
}
