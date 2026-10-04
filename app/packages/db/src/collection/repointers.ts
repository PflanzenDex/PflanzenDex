import { asAccount } from "../kernel/index.ts";
import type { SpeciesRepointer } from "../catalog/index.ts";

/** Specimens of the creator follow the merged proposal to the existing species (US-BES-10, FR-BES-11). */
const SPECIMENS: SpeciesRepointer = {
  kind: "specimen",
  repoint: (client, r) =>
    asAccount(client, r.creatorId, async () => {
      // The marker rule (`specimen_marker_per_species`) may refuse the move: the merge then reports a conflict.
      const moved = await client.query(
        "update specimen set species_id = $1 where species_id = $2 and account_id = $3",
        [r.toSpeciesId, r.fromSpeciesId, r.creatorId],
      );
      return { moved: Number(moved.rowCount), kept: 0 };
    }),
};

/**
 * The care profile is one row per account and species. If the creator already has a profile for the target, that one
 * stays and the profile of the proposal is kept where it is (counted as `kept`, never dropped silently, P-10).
 */
const CARE_PROFILES: SpeciesRepointer = {
  kind: "care_profile",
  repoint: (client, r) =>
    asAccount(client, r.creatorId, async () => {
      const moved = await client.query(
        `update care_profile p set species_id = $1, updated_at = now()
          where p.species_id = $2 and p.account_id = $3
            and not exists (select from care_profile t where t.account_id = $3 and t.species_id = $1)`,
        [r.toSpeciesId, r.fromSpeciesId, r.creatorId],
      );
      const kept = await client.query<{ n: number }>(
        "select count(*)::int as n from care_profile where species_id = $1 and account_id = $2",
        [r.fromSpeciesId, r.creatorId],
      );
      return { moved: Number(moved.rowCount), kept: (kept.rows[0] as { n: number }).n };
    }),
};

/** Ports of the `collection` module for the merge of catalog proposals; the API composes them (ADR 0003). */
export const COLLECTION_REPOINTERS: readonly SpeciesRepointer[] = [SPECIMENS, CARE_PROFILES];
