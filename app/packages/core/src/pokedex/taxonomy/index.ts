// Public interface of the taxonomy build (US-POK-03): tree of order, family, genus and species with Wikipedia text and
// GBIF genus count, built by the job `pokedex.build_taxonomy` and replaced atomically.
export {
  TAXONOMY_JOB_TYPE,
  buildTaxonomy,
  fingerprintOf,
  normalizeNames,
  orderTaxonomyBuild,
  runTaxonomyBuild,
} from "./build";
export type { BuiltTree, TaxonomyDependencies } from "./build";
export { shortText, SUMMARY_LIMITS } from "./enrich";
export type {
  CatalogNames,
  FailureReason,
  GenusCount,
  Taxon,
  TaxonFailure,
  TaxonLineage,
  TaxonText,
  TaxonomyBuild,
  TaxonomyStore,
} from "./types";
