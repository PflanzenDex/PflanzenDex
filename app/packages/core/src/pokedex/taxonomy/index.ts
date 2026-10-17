// Public interface of the taxonomy build (US-POK-03): tree of order, family, genus and species with Wikipedia text and
// GBIF genus count, built by the job `pokedex.build_taxonomy` and replaced atomically.
export {
  TAXONOMY_JOB_TYPE,
  buildTaxonomy,
  fingerprintOf,
  orderTaxonomyBuild,
  runTaxonomyBuild,
} from "./build";
export type { TaxonomyDependencies } from "./build";
export { shortText } from "./enrich";
export { IUCN_CATEGORIES } from "./types";
export type {
  CatalogNames,
  GenusCount,
  IucnCategory,
  NatureRarity,
  Taxon,
  TaxonFailure,
  TaxonLineage,
  TaxonText,
  TaxonomyBuild,
  TaxonomyStore,
} from "./types";
