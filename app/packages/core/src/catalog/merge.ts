import { defineOperation, appError, ok, failed, idField, shape } from "../kernel";
import { isReviewer } from "./permissions";
import { OPEN, type ReviewStore } from "./types";

const mergeSchema = shape({
  proposalId: idField("proposalId"),
  targetSpeciesId: idField("targetSpeciesId"),
});

/**
 * Merge a proposal with an existing species, re-pointing the review case to the target (US-BES-10).
 * This action:
 * - Closes the proposal by setting status to "reviewed"
 * - Points the review_case to the target species
 * - Caller: reviewers only (FR-BES-14)
 * - The database will handle re-pointing specimens, wishes, and care profiles (P-03, P-10).
 */
export const catalogMerge = (store: ReviewStore) =>
  defineOperation({
    name: "catalog.merge",
    schema: mergeSchema,
    authorized: isReviewer(store),
    run: async (context, input) => {
      if (!context.userId) return failed(appError("access.not_signed_in"));

      // Verify the user is a reviewer
      const roles = await store.roles(context.userId);
      if (!roles.includes("reviewer") && !roles.includes("operator")) {
        return failed(appError("access.denied"));
      }

      // Find the proposal
      const proposal = await store.find(context.userId, input.proposalId);
      if (!proposal) return failed(appError("review.not_found"));

      // Proposal must be open
      if (!OPEN.includes(proposal.status)) {
        return failed(appError("review.status_invalid"));
      }

      // Perform the merge via the store
      const merged = await store.merge(context.userId, input.proposalId, input.targetSpeciesId);
      return merged ? ok(merged) : failed(appError("review.not_found"));
    },
  });
