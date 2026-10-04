import { appError, failed, ok, type Result } from "../kernel";
import { isOperator, type AccessStore, type InvitationRecord } from "./access";

/** An account counts as active if it was seen in this window (assumption, starting value; no source for a better one). */
export const ACTIVE_WINDOW_DAYS = 30;

/** What the operator sees (US-ACC-05, P-05): counts and states, never content of an account. */
export interface OperatorOverview {
  readonly accounts: number;
  readonly activeAccounts: number;
  readonly activeWindowDays: number;
  /** Always unknown (`null`) until the cost measurement exists (NFR-16, P-08): no invented number. */
  readonly costPerUser: number | null;
  readonly invitationOnly: boolean;
  readonly invitations: readonly InvitationRecord[];
}

/** Read for the operator only (a reviewer is not an operator); the database checks the role again. */
export async function operatorOverview(
  deps: { access: AccessStore },
  userId: string,
): Promise<Result<OperatorOverview>> {
  if (!(await isOperator(deps.access)({ userId }))) return failed(appError("access.denied"));
  const counts = await deps.access.overview(userId, ACTIVE_WINDOW_DAYS);
  return ok({ ...counts, activeWindowDays: ACTIVE_WINDOW_DAYS, costPerUser: null });
}
