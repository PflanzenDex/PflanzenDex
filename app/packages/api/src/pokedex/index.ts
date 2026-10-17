// Public interface of the `pokedex` module (ADR 0003): routes of the ownership derivation (US-POK-06) and the
// background jobs of the taxonomy build (US-POK-03).
export { POKEDEX_PATHS, pokedexRoutes } from "./pokedex-routes";
export { checkTaxonomy, pokedexJobHandlers, scheduleChecks } from "./taxonomy-job";
