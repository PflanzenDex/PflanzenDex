import type { SignedInContext } from "../kernel";

/** Roles are assigned administratively, never through the application (TE-08, FR-BES-14). */
export type AccessRole = "operator" | "reviewer";

/** The states an invitation can be in; derived from the database clock, never stored. */
export type InvitationStatus = "open" | "redeemed" | "expired";

/** What the operator sees of an invitation: never the code (only its hash is stored) and never who redeemed it. */
export interface InvitationRecord {
  readonly id: string;
  /** UTC instants (ISO 8601). */
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly redeemedAt: string | null;
  readonly status: InvitationStatus;
}

/** Counts, the registration mode and the invitation states: no account, no plant data (P-05, US-ACC-05). */
export interface AccessCounts {
  readonly accounts: number;
  readonly activeAccounts: number;
  readonly invitationOnly: boolean;
  readonly invitations: readonly InvitationRecord[];
}

export type RegisterOutcome = "registered" | "existing" | "invalid";

/**
 * Port for access control; the adapter lives in `db` (AB-1). Every call that takes `userId` runs as that account; the
 * database enforces the operator role again, so a wrong check here is not enough to get through (P-04).
 * `code` is always the normalized code (24 characters); only its SHA-256 hash is stored.
 */
export interface AccessStore {
  roles(userId: string): Promise<readonly AccessRole[]>;
  createInvitation(
    userId: string,
    v: { code: string; expiresAt: string },
  ): Promise<{ id: string; expiresAt: string }>;
  setInvitationOnly(userId: string, on: boolean): Promise<void>;
  overview(userId: string, activeWindowDays: number): Promise<AccessCounts>;
  /**
   * Creates the account of the subject and uses up the code in one transaction (single use, also under concurrency).
   * `existing`: the subject already has an account, the code stays unused. `invalid` covers unknown, used and
   * expired codes alike.
   */
  register(subject: string, code: string): Promise<RegisterOutcome>;
}

/** Only the operator, not a reviewer, may set up invitations and see the overview (US-ACC-05). */
export const isOperator =
  (store: AccessStore) =>
  async (context: SignedInContext): Promise<boolean> =>
    (await store.roles(context.userId)).includes("operator");
