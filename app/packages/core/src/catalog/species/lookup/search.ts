import { isId } from "../../../kernel";
import { normalize } from "../naming/name";
import type { Species, SpeciesSearch, SpeciesStore } from "../types";

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

/** `null` if the species does not exist or is not visible to the user (both look the same, P-04). */
export async function speciesLoad(
  store: SpeciesStore,
  userId: string,
  id: string,
): Promise<Species | null> {
  return isId(id) ? store.find(userId, id.toLowerCase()) : null;
}
