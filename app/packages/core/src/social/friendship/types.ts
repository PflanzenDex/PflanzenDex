/** Validity of a friend code in days (US-SOZ-01: single-use, expires after 7 days). */
export const FRIEND_CODE_VALIDITY_DAYS = 7;

/** A friendship request as one side sees it. Before acceptance only the display name is known (US-SOZ-02). */
export interface FriendRequest {
  readonly id: string;
  /** Display name of the other side as stored at the time of the request; `null` = it has none (P-08). */
  readonly otherName: string | null;
  /** `sent`: I redeemed a code of the other side; `received`: the other side redeemed my code. */
  readonly direction: "sent" | "received";
  /** UTC instant (ISO 8601). */
  readonly requestedAt: string;
}

export type RedeemResult =
  | { readonly outcome: "requested"; readonly request: FriendRequest }
  | {
      readonly outcome:
        "unknown_code" | "code_used" | "code_expired" | "own_code" | "already_linked";
    };

/** Port for persistence; the adapter lives in `db` and runs as the account of the caller (AB-1, P-04). */
export interface FriendStore {
  /** Stores the hash of the code (the adapter hashes) for the caller's account. */
  createCode(
    userId: string,
    code: { code: string; expiresAt: string },
  ): Promise<{ id: string; expiresAt: string }>;
  /**
   * Redeems a code as `userId` and creates the request on both sides in one transaction. A refused redemption
   * (own code, request or friendship exists) does not use the code up; the same account redeeming the same code
   * again gets the existing request.
   */
  requestWithCode(userId: string, code: string): Promise<RedeemResult>;
  /** Open (not yet answered) requests of the account, newest first. */
  openRequests(userId: string): Promise<readonly FriendRequest[]>;
}
