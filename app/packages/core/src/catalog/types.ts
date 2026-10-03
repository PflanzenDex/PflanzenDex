// Roles and review status of the shared catalog (TE-08, FR-BES-02, FR-BES-06, FR-BES-14, E-02).

/** Roles of an account. The operator is initially the only reviewer; further reviewers are a separate role. */
export type Role = "operator" | "reviewer";

/**
 * `proposal` and `ai_unreviewed` arise from users, `curated` from an operator batch,
 * `reviewed` and `rejected` only from a reviewer.
 */
export type ReviewStatus = "proposal" | "ai_unreviewed" | "curated" | "reviewed" | "rejected";

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
  decide(
    userId: string,
    id: string,
    status: "reviewed" | "rejected",
    reason: string | null,
  ): Promise<ReviewCase | null>;
}
