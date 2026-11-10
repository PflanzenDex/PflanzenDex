import {
  defineOperation,
  appError,
  type ErrorDetail,
  failed,
  ok,
  idField,
  shape,
  choiceField,
  type Result,
} from "../../kernel";
import { checkApprovalReadiness } from "./approval";
import { isReviewer } from "../permissions";
import { normalize, type SpeciesStore } from "../species";
import {
  DECISION_STATUS,
  REASON_MAX,
  OPEN,
  type ApprovedTwin,
  type ReviewCase,
  type ReviewStore,
} from "../types";

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

interface Decision {
  readonly id: string;
  readonly status: "reviewed" | "rejected";
  readonly reason: string | null;
}

/** What a decision needs besides its input: the store, the species content and the caller. */
interface Deps {
  readonly store: ReviewStore;
  readonly species: SpeciesStore;
  readonly userId: string;
}

/** The store's answer: the decided case, a refusal naming the approved twin (US-BES-10), or no such open case. */
function settle(fresh: ReviewCase | { twin: ApprovedTwin } | null): Result<ReviewCase> {
  if (fresh === null) return failed(appError("review.not_found"));
  if ("twin" in fresh) {
    return failed(appError("review.name_approved", { data: { existing: fresh.twin } }));
  }
  return ok(fresh);
}

/**
 * Decides an open case. An approval of a species first needs complete required fields and a source
 * (`checkApprovalReadiness`, FR-BES-05), then it checks the Latin name: `normalize` of the whole name, the key the
 * species names store (cultivar included). The store finds an approved twin under that key in the same step as the
 * approval (US-BES-10). A rejection and other kinds decide without that check.
 */
async function decideOpenCase(
  deps: Deps,
  input: Decision,
  reviewCase: ReviewCase,
): Promise<Result<ReviewCase>> {
  const { store, species, userId } = deps;
  if (input.status === "reviewed" && reviewCase.objectKind === "species") {
    const content = await species.findForReview(userId, reviewCase.objectId);
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
    return settle(await store.approve(userId, input.id, normalize(content.latinName)));
  }
  return settle(await store.decide(userId, input.id, input.status, input.reason));
}

/**
 * Approve, or reject with a reason (US-BES-10). Reviewers only (FR-BES-14); an AI connection never gets
 * the reviewer role and can therefore never approve (FR-BES-06, FR-KI-09). Approval needs complete required fields
 * and a source (`checkApprovalReadiness`); the error names every missing field. An approval is refused with
 * `review.name_approved` naming the approved species that already holds the Latin name; nothing is decided then.
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
      return decideOpenCase({ store, species, userId: context.userId }, input, reviewCase);
    },
  });
