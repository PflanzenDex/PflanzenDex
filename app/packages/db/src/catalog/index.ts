// Public interface of the `catalog` module (ADR 0003).
export { SpeciesPostgres } from "./species.ts";
export { ReviewPostgres } from "./review.ts";
export { FIXTURES_CATALOG } from "./fixtures.ts";
export type { SpeciesRepointer, RepointRequest } from "./references/repointer.ts";
export { CATALOG_TENANT_EXCEPTIONS } from "./tenant-exceptions.ts";
export { CONTRIBUTED_TABLES, contributedRows } from "./references/contribution.ts";
export { CatalogFillPostgres } from "./fill/fill-store.ts";
export { CatalogSourceClaims } from "./fill/source-claims.ts";
export type { SourceClaimRecord } from "./fill/source-claims.ts";
export { CatalogGapsPostgres } from "./gaps/index.ts";
export { CorrectionPostgres } from "./corrections/index.ts";
