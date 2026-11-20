// Test double of the reads the Pokédex page makes (issue 1625): the caught species, all of them seen so that no "Neu
// gefangen" banner shows, the taxonomy tree not built yet (P-08) and the lock states with nothing announced (US-ONB-05).
// A path this double does not answer gives `undefined`, so the caller decides what that answer is.

/** The body of one read of the Pokédex page for these caught species, or `undefined` for another path. */
export function pokedexReadAnswer(path: string, caught: readonly { species: string }[]): unknown {
  if (path === "/pokedex/ownership") return { ownership: { caught, unidentified: [] } };
  if (path === "/pokedex/seen") return { seen: caught.map((c) => c.species) };
  if (path === "/pokedex/tree") return { tree: null };
  if (path === "/onboarding/unlocks") return { functions: [] };
  return undefined;
}
