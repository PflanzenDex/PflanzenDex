// Public interface of the module `pokedex` (ADR 0003).
export { PokedexStatePostgres } from "./state.ts";
export { FIXTURES_POKEDEX } from "./fixtures.ts";
export { TaxonomyPostgres } from "./taxonomy.ts";
export { POKEDEX_TENANT_EXCEPTIONS } from "./tenant-exceptions.ts";
export { ActiveSpeciesPostgres } from "./active-species.ts";
export { TaxonAttributesPostgres } from "./taxon-attributes.ts";
export type { AttributeFactRecord } from "./taxon-attributes.ts";
