import { isId } from "../../../kernel";
import { normalize } from "../naming/name";
import type { Species, SpeciesHit, SpeciesSearch, SpeciesStore } from "../types";

/**
 * Searches by Latin, German, English name or synonym (a partial word suffices, case and
 * accents ignored). An empty search text lists all visible species. What is seen is what the user may see. The answer
 * shows at most the cap and says whether more species match (FR-BES-24).
 */
export function speciesSearch(
  store: SpeciesStore,
  userId: string,
  text: string,
): Promise<SpeciesSearch> {
  return store.search(userId, normalize(text) || null);
}

/**
 * The visible species whose name equals `text` as a whole (case and accents ignored), without the cap of
 * `speciesSearch` (FR-BES-24). Empty for an empty text.
 */
export async function speciesExact(
  store: SpeciesStore,
  userId: string,
  text: string,
): Promise<readonly SpeciesHit[]> {
  const norm = normalize(text);
  return norm === "" ? [] : store.exact(userId, norm);
}

/**
 * The hits of a name lookup with the cap of `speciesSearch` lifted for an exact match (FR-BES-24): the shown hits;
 * when more species match, the exact matches are added. A shown hit of the same name does not end the lookup: it may be
 * the proposal itself, and a second species of that name may lie beyond the cap. So a duplicate check or a name
 * reference finds an existing species even when 50 others match first in name order.
 */
export async function withExactBeyondCap<T extends { readonly id: string }>(
  shown: { readonly species: readonly T[]; readonly more: boolean },
  exact: () => Promise<readonly T[]>,
): Promise<readonly T[]> {
  if (!shown.more) return shown.species;
  const beyond = (await exact()).filter((h) => !shown.species.some((s) => s.id === h.id));
  return [...shown.species, ...beyond];
}

/** `null` if the species does not exist or is not visible to the user (both look the same, P-04). */
export async function speciesLoad(
  store: SpeciesStore,
  userId: string,
  id: string,
): Promise<Species | null> {
  return isId(id) ? store.find(userId, id.toLowerCase()) : null;
}
