import { defineOperation, appError, ok, failed, idField, shape } from "../kernel";
import { isReviewer } from "./permissions";
import type { SpeciesStore } from "./species";
import { OPEN, type ReviewStore } from "./types";

const mergeSchema = shape({
  proposalId: idField("proposalId"),
  targetSpeciesId: idField("targetSpeciesId"),
});

/** An approved species (visible to everybody) that is not the proposal itself. */
async function validTarget(
  species: SpeciesStore,
  userId: string,
  proposalSpeciesId: string,
  targetId: string,
): Promise<boolean> {
  const target = await species.find(userId, targetId);
  const approved = target?.reviewStatus === "curated" || target?.reviewStatus === "reviewed";
  return approved && targetId !== proposalSpeciesId;
}

/**
 * Merge a proposal with an existing species (US-BES-10, FR-BES-11, P-10). The creator's specimens and care profiles
 * are re-pointed to the target and the proposal is closed as `merged`, atomically in the store (the references live
 * in other modules and are re-pointed through ports there, ADR 0003). Reviewers only. The target must be an approved
 * species and not the proposal itself; the answer tells how much was moved and what was kept.
 */
export const catalogMerge = (store: ReviewStore, species: SpeciesStore) =>
  defineOperation({
    name: "catalog.merge",
    schema: mergeSchema,
    authorized: isReviewer(store),
    run: async (context, input) => {
      const proposal = await store.find(context.userId, input.proposalId);
      if (!proposal || proposal.objectKind !== "species") {
        return failed(appError("review.not_found"));
      }
      if (!OPEN.includes(proposal.status)) return failed(appError("review.status_invalid"));
      if (!(await validTarget(species, context.userId, proposal.objectId, input.targetSpeciesId))) {
        return failed(appError("review.merge_target_invalid"));
      }
      const merged = await store.merge(context.userId, proposal.id, input.targetSpeciesId);
      if (merged === "conflict") return failed(appError("review.merge_conflict"));
      if (merged === "lock_failed") return failed(appError("review.merge_lock_failed"));
      return merged ? ok(merged) : failed(appError("review.status_invalid"));
    },
  });
