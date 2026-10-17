// Public interface of the external sources adapter (TE-09): clients for Wikipedia, Wikidata, GBIF and OpenTree.
export { createSourceClient } from "./client";
export type { SourceClientDeps } from "./client";
export { createMemorySourceCache } from "./cache";
export { sourceUrl, wikipediaSummary, wikidataEntity, gbifMatch, openTreeMatch } from "./endpoints";
