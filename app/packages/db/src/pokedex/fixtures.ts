import type { Fixtures } from "../kernel/index.ts";

// Tables of the module `pokedex` (FR-QG-07). The seen state may stay empty.
export const FIXTURES_POKEDEX: Fixtures = {
  pokedex_state: () => ({ seen_species: ["Aloe vera"] }),
};
