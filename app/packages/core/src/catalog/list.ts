import { defineOperation, appError, ok, failed, shape } from "../kernel";
import { isReviewer } from "./permissions";
import type { ReviewStore } from "./types";

const listSchema = shape({});

/**
 * List all open proposals for review (US-BES-10). Reviewers and operators only.
 * Returns proposals with status "proposal" or "ai_unreviewed" (FR-BES-14).
 */
export const catalogList = (store: ReviewStore) =>
  defineOperation({
    name: "catalog.list",
    schema: listSchema,
    authorized: isReviewer(store),
    run: async (context) => {
      if (!context.userId) return failed(appError("access.not_signed_in"));

      // Get all roles for the user
      const roles = await store.roles(context.userId);
      const isReviewerOrOperator = roles.includes("reviewer") || roles.includes("operator");

      if (!isReviewerOrOperator) {
        return failed(appError("access.denied"));
      }

      // List all open proposals (proposal or ai_unreviewed status)
      const proposals = await store.listOpen(context.userId);
      return ok(proposals);
    },
  });
