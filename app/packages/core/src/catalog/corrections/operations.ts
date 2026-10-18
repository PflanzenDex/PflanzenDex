import {
  appError,
  choiceField,
  defineOperation,
  failed,
  idField,
  integerField,
  ok,
  orNull,
  shape,
  textField,
} from "../../kernel";
import { isReviewer } from "../permissions";
import type { ReviewStore } from "../types";
import {
  CORRECTION_FIELDS,
  CORRECTION_LIMITS,
  REASON_MAX,
  SOURCE_MAX,
  type CorrectionStore,
} from "./types";

const proposeSchema = shape({
  speciesId: idField("speciesId"),
  field: choiceField("field", CORRECTION_FIELDS),
  value: textField("value", { min: 1, max: 1000 }),
  reason: textField("reason", { min: 1, max: REASON_MAX }),
  source: orNull(textField("source", { min: 1, max: SOURCE_MAX })),
});

/**
 * A keeper proposes another value for one field of an approved species (US-BES-14 cut, FR-BES-19). It is stored open
 * and changes nothing in the catalog until a reviewer accepts it. None of the three fields needs a source (FR-BES-14
 * names light demand, dormancy, temperature, humidity, toxicity); a given source is kept. The same open proposal is
 * pointed to, not duplicated.
 */
export const catalogCorrect = (store: CorrectionStore) =>
  defineOperation({
    name: "catalog.correct",
    schema: proposeSchema,
    run: async (context, input) => {
      if (input.value.length > CORRECTION_LIMITS[input.field]) {
        return failed(
          appError("input.invalid", { details: [{ field: "value", code: "input.invalid" }] }),
        );
      }
      const current = await store.speciesValue(context.userId, input.speciesId, input.field);
      if (!current) return failed(appError("species.not_found"));
      if (current.value === input.value) return failed(appError("correction.no_change"));
      const created = await store.create(context.userId, {
        speciesId: input.speciesId,
        field: input.field,
        proposedValue: input.value,
        reason: input.reason,
        source: input.source,
      });
      if ("duplicate" in created) {
        return failed(appError("correction.duplicate_open", { data: { id: created.duplicate } }));
      }
      return ok(created);
    },
  });

const idSchema = shape({ id: idField("id") });

/**
 * Accept: the field takes the proposed value, the species gets a new catalog version and the provenance records
 * origin `community`, the citation and the reviewer (US-BES-16). Reviewers only; an AI connection never has the role
 * (FR-BES-06, FR-KI-09). The old value stays in the history (P-10).
 */
export const catalogCorrectionAccept = (store: CorrectionStore, review: ReviewStore) =>
  defineOperation({
    name: "catalog.correction_accept",
    schema: idSchema,
    authorized: isReviewer(review),
    run: async (context, input) => {
      const r = await store.accept(context.userId, input.id);
      if (r === "not_found") return failed(appError("correction.not_found"));
      if (r === "decided") return failed(appError("correction.decided"));
      return ok({ id: input.id, status: "accepted" as const, version: r.version });
    },
  });

const rejectSchema = shape({
  id: idField("id"),
  reason: (value: unknown) =>
    value === undefined || value === null || value === ""
      ? null
      : textField("reason", { min: 1, max: REASON_MAX })(value),
});

/** Reject with a reason the creator sees; the catalog stays unchanged (US-BES-16). Reviewers only. */
export const catalogCorrectionReject = (store: CorrectionStore, review: ReviewStore) =>
  defineOperation({
    name: "catalog.correction_reject",
    schema: rejectSchema,
    authorized: isReviewer(review),
    run: async (context, input) => {
      if (input.reason === null) return failed(appError("review.reason_missing"));
      const r = await store.reject(context.userId, input.id, input.reason);
      if (r === "not_found") return failed(appError("correction.not_found"));
      if (r === "decided") return failed(appError("correction.decided"));
      return ok({ id: input.id, status: "rejected" as const });
    },
  });

const revertSchema = shape({
  speciesId: idField("speciesId"),
  field: choiceField("field", CORRECTION_FIELDS),
  version: integerField("version", { min: 1, max: 1_000_000 }),
});

/**
 * Revert a field to an earlier version: that value with its source comes back as a NEW version, nothing is deleted
 * from the history (US-BES-16, P-10). Reviewers only.
 */
export const catalogFieldRevert = (store: CorrectionStore, review: ReviewStore) =>
  defineOperation({
    name: "catalog.field_revert",
    schema: revertSchema,
    authorized: isReviewer(review),
    run: async (context, input) => {
      const r = await store.revert(context.userId, input.speciesId, input.field, input.version);
      if (r === "not_found") return failed(appError("correction.version_not_found"));
      if (r === "unchanged") return failed(appError("correction.unchanged"));
      return ok({ speciesId: input.speciesId, field: input.field, version: r.version });
    },
  });

const voteSchema = shape({
  id: idField("id"),
  vote: choiceField("vote", ["confirm", "dispute", "none"] as const),
});

/**
 * "Stimmt" / "Stimmt nicht" on an open correction, stored once per account and correction; choosing again changes it,
 * "none" withdraws it (US-BES-15). The vote is a signal for the reviewers and changes nothing in the catalog by itself
 * (E-26, FR-BES-19); there is no ranking of people. The creator does not vote on their own proposal, and more than
 * VOTES_PER_HOUR corrections per hour are refused (assumption).
 */
export const catalogCorrectionVote = (store: CorrectionStore) =>
  defineOperation({
    name: "catalog.correction_vote",
    schema: voteSchema,
    run: async (context, input) => {
      const r = await store.vote(
        context.userId,
        input.id,
        input.vote === "none" ? null : input.vote,
      );
      if (r === "not_found") return failed(appError("correction.not_found"));
      if (r === "decided") return failed(appError("correction.decided"));
      if (r === "own") return failed(appError("correction.own_vote"));
      if (r === "rate_limited") return failed(appError("correction.vote_rate_limited"));
      return ok({ id: input.id, vote: input.vote });
    },
  });
