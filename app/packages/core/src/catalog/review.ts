import {
  defineOperation,
  appError,
  type ErrorDetail,
  failed,
  ok,
  idField,
  shape,
  choiceField,
} from "../kernel";
import { checkApprovalReadiness } from "./approval";
import { isReviewer } from "./permissions";
import type { SpeciesStore } from "./species";
import { DECISION_STATUS, REASON_MAX, OPEN, type ReviewStore } from "./types";

// The reason is optional in the schema; whether it is required depends on the status (see run).
const reasonField = (value: unknown): string | null | ErrorDetail => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string" && value.trim().length <= REASON_MAX) return value.trim() || null;
  return { field: "reason", code: "input.invalid" };
};

const reviewSchema = shape({
  id: idField("id"),
  status: choiceField("status", DECISION_STATUS),
  reason: reasonField,
});

/**
 * Approve, or reject with a reason (US-BES-10). Reviewers only (FR-BES-14); an AI connection never gets
 * the reviewer role and can therefore never approve (FR-BES-06, FR-KI-09). Approval needs complete required fields
 * and a source (`checkApprovalReadiness`); the error names every missing field.
 */
export const catalogReview = (store: ReviewStore, species: SpeciesStore) =>
  defineOperation({
    name: "catalog.review",
    schema: reviewSchema,
    authorized: isReviewer(store),
    run: async (context, input) => {
      if (input.status === "rejected" && input.reason === null) {
        return failed(appError("review.reason_missing"));
      }
      const reviewCase = await store.find(context.userId, input.id);
      if (!reviewCase) return failed(appError("review.not_found"));
      if (!OPEN.includes(reviewCase.status)) {
        return failed(appError("review.status_invalid"));
      }
      if (input.status === "reviewed" && reviewCase.objectKind === "species") {
        const content = await species.findForReview(context.userId, reviewCase.objectId);
        if (!content) return failed(appError("review.not_found"));
        const issues = checkApprovalReadiness(content);
        if (issues.length > 0) {
          return failed(
            appError("review.approval_incomplete", {
              details: issues.map((i) => ({ field: i.field, code: "input.invalid" as const })),
              data: { issues },
            }),
          );
        }
      }
      const fresh = await store.decide(context.userId, input.id, input.status, input.reason);
      return fresh ? ok(fresh) : failed(appError("review.not_found"));
    },
  });
