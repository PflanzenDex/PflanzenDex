// Roles and review status of the shared catalog (TE-08, FR-BES-02, FR-BES-06, FR-BES-14, E-02).

/** Roles of an account. The operator is initially the only reviewer; further reviewers are a separate role. */
export type Role = "operator" | "reviewer";

/**
 * `proposal` and `ai_unreviewed` arise from users, `curated` from an operator batch,
 * `reviewed`, `rejected` and `merged` (duplicate of an existing species) only from a reviewer.
 */
export type ReviewStatus =
  "proposal" | "ai_unreviewed" | "curated" | "reviewed" | "rejected" | "merged";

export const PROPOSAL_STATUS = ["proposal", "ai_unreviewed"] as const;
export const DECISION_STATUS = ["reviewed", "rejected"] as const;
/** Open cases: only they can be decided. */
export const OPEN: readonly ReviewStatus[] = ["proposal", "ai_unreviewed"];
export const REASON_MAX = 500;

export interface ReviewCase {
  readonly id: string;
  /** Account of the creator; only this account sees the content as long as it is not approved (FR-BES-11). */
  readonly creatorId: string;
  /** Kind of the catalog object, e.g. `species` (arises with BES-01); the mechanism does not know its content. */
  readonly objectKind: string;
  readonly objectId: string;
  readonly status: ReviewStatus;
  readonly reason: string | null;
  readonly reviewedBy: string | null;
  /** ISO timestamp (UTC) of the creation; the age of an open proposal is derived from it (US-BES-10). */
  readonly createdAt: string;
  /** The existing species a merged proposal was folded into. */
  readonly mergedInto: string | null;
}

/** What a merge did to the references of one kind (P-10: nothing is lost silently). */
export interface MergeMoved {
  /** E.g. `specimen`, `care_profile`. */
  readonly kind: string;
  readonly moved: number;
  /** Left where they are because the target already has an entry of the creator (e.g. a care profile). */
  readonly kept: number;
}

export interface MergeOutcome {
  readonly reviewCase: ReviewCase;
  readonly moved: readonly MergeMoved[];
}

/** Persistence port (adapter in `db`). The adapter additionally enforces the rights via row rule and trigger. */
export interface ReviewStore {
  /** Roles of the signed-in account (empty = plant keeper). */
  roles(userId: string): Promise<readonly Role[]>;
  /** `present` if a case already exists for the object. */
  create(
    userId: string,
    reviewCase: { objectKind: string; objectId: string; status: ReviewStatus },
  ): Promise<ReviewCase | "present">;
  /** Reviewers find cases of all accounts (metadata only, never content, P-04), others only their own. */
  find(userId: string, id: string): Promise<ReviewCase | null>;
  /** Open cases (all) and the latest operator batches, for reviewers only (the adapter enforces it, P-04). */
  listForReview(userId: string): Promise<readonly ReviewCase[]>;
  decide(
    userId: string,
    id: string,
    status: "reviewed" | "rejected",
    reason: string | null,
  ): Promise<ReviewCase | null>;
  /**
   * Folds an open proposal into an existing approved species: re-points the creator's references to the target
   * and marks the case `merged`, all in one transaction (all or nothing, FR-BES-11, P-10). `null`: the case is
   * not open. `conflict`: a reference cannot be re-pointed (e.g. same marker on the target); nothing was changed.
   */
  merge(
    userId: string,
    proposalId: string,
    targetSpeciesId: string,
  ): Promise<MergeOutcome | "conflict" | null>;
}
