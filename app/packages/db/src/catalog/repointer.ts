import type { PoolClient } from "pg";

/** What a merge asks of a module that holds references to species (US-BES-10, FR-BES-11, P-10). */
export interface RepointRequest {
  /** The account that created the proposal: only its references point to the proposal. */
  readonly creatorId: string;
  readonly fromSpeciesId: string;
  readonly toSpeciesId: string;
}

/**
 * Port `SpeciesRepointer` (ADR 0003): the catalog is below the modules that reference species, so it defines the
 * port and they implement it for their own tables (`collection`: specimens, care profiles; `wishlist`: wishes, when
 * it exists). It runs in the transaction of the merge on `client`, so everything is re-pointed or nothing is. A
 * unique violation from the database means the reference cannot move (the merge reports a conflict and rolls back).
 */
export interface SpeciesRepointer {
  /** Name of the kind of reference, reported to the reviewer (`specimen`, `care_profile`, ...). */
  readonly kind: string;
  /** `moved` references now point to the target, `kept` could not move and stay (reported, never silent). */
  repoint(client: PoolClient, request: RepointRequest): Promise<{ moved: number; kept: number }>;
}
