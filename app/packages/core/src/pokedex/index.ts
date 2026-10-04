// Public interface of the `pokedex` module (ADR 0003): ownership of species derived from the specimens (US-POK-06).
export { speciesKey } from "./species-key";
export { pokedexOwnership } from "./ownership";
export type {
  CaughtSpecies,
  Ownership,
  OwnershipDependencies,
  SpeciesKey,
  UnidentifiedSpecimen,
} from "./types";
