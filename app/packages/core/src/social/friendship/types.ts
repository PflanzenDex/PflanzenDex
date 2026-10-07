/** Validity of a friend code in days (US-SOZ-01: single-use, expires after 7 days). */
export const FRIEND_CODE_VALIDITY_DAYS = 7;

/** A friendship request as one side sees it. Before acceptance only the display name is known (US-SOZ-02). */
export interface FriendRequest {
  readonly id: string;
  /** Display name of the other side as stored at the time of the request; `null` = it has none (P-08). */
  readonly otherName: string | null;
  /** `sent`: I redeemed a code of the other side; `received`: the other side redeemed my code. */
  readonly direction: "sent" | "received";
  /** `declined`: the other side did not accept; shown to the sender as "not accepted", nothing more (US-SOZ-02). */
  readonly status: "requested" | "declined";
  /** UTC instant (ISO 8601). */
  readonly requestedAt: string;
}

/** A confirmed friend: the display name as stored and since when (US-SOZ-02). No collection data (US-SOZ-04). */
export interface Friend {
  readonly id: string;
  readonly name: string | null;
  /** UTC instant (ISO 8601). */
  readonly since: string;
  /**
   * How many of the species this friend shares with me I have caught too (US-SOZ-03, US-SOZ-04); `null` = unknown
   * (the friend shares nothing, P-08). A plain number, never a comparison or a ranking (FR-SOZ-11).
   */
  readonly sharedSpecies: number | null;
}

/** A friend as the store knows it: with the account id, which never leaves the server (P-05). */
export interface FriendRecord extends Omit<Friend, "sharedSpecies"> {
  readonly accountId: string;
}

export type AnswerOutcome = "accepted" | "declined" | "not_found" | "not_open";

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
  /** Open (not yet answered) requests of the account, newest first, plus the declined ones the account sent. */
  openRequests(userId: string): Promise<readonly FriendRequest[]>;
  /**
   * Accepts or declines a request the account received, on both sides in one transaction. Answering the same way
   * again writes nothing; an id that is unknown, foreign or of a request the account sent is `not_found`.
   */
  answer(userId: string, requestId: string, accept: boolean): Promise<AnswerOutcome>;
  /**
   * Ends a confirmed friendship on both sides in one transaction. Ending twice writes nothing; an id that is unknown,
   * foreign or not a friendship (yet) is `not_found`.
   */
  end(userId: string, friendId: string): Promise<"ended" | "not_found">;
  /** Confirmed friends of the account, by name. */
  friends(userId: string): Promise<readonly FriendRecord[]>;
}
