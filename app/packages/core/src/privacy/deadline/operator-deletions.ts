import { appError, defineOperation, failed, idField, ok, shape, type Result } from "../../kernel";

import {
  classifyDeadlines,
  deadlineOf,
  DEADLINE_RULES,
  type DeadlineEntry,
} from "./deletion-deadline";

/** The roles of an account; the adapter is the access store of the account module (the database checks them again, P-04). */
export interface RoleReader {
  roles(userId: string): Promise<readonly string[]>;
}

/** Only the operator, not a reviewer (US-ACC-05): the same rule as the account module's operator check. */
const isOperator = (access: RoleReader) => async (context: { readonly userId: string }) =>
  (await access.roles(context.userId)).includes("operator");

// The operator's view of open deletions (US-ACC-04, card "Fristen"): near and passed deadlines, and the identity removals
// still open. The operator reads dates, the deletion log entry and the sign-in subject, never an account (P-05).

/**
 * One open item as the database reads it: a request still waiting for the job (`request`), or a finished deletion whose
 * identity is still open (`identity`). No account id: the operator reads no account.
 */
export interface DeletionQueueRow {
  readonly kind: "request" | "identity";
  /** The deletion log entry of an identity removal; `null` for a request. */
  readonly entryId: string | null;
  readonly requestedAt: Date;
  /** The sign-in subject of an identity removal; `null` for a request. */
  readonly subject: string | null;
  /** When the deletion was finished; `null` for a request. */
  readonly completedAt: Date | null;
}

/** Port: the operator's reads and the one write of the operator, both checked again in the database (P-04). */
export interface DeletionQueueStore {
  queue(userId: string): Promise<readonly DeletionQueueRow[]>;
  /** `marked`: the entry was open and is closed now; `already`: it was closed before; `unknown`: no such entry. */
  markIdentityRemoved(userId: string, entryId: string): Promise<"marked" | "already" | "unknown">;
}

export type DeletionQueueItem = DeadlineEntry<DeletionQueueRow & { readonly done: boolean }>;

export interface OperatorDeletions {
  readonly warningDays: number;
  /** Requests and identity removals inside the warning window, earliest deadline first. */
  readonly near: readonly DeletionQueueItem[];
  /** Requests and identity removals whose deadline has passed: an incident (P-10). */
  readonly past: readonly DeletionQueueItem[];
  /** Every open identity removal, oldest completion first; the deadline state is in `near` and `past` only. */
  readonly identityRemovals: readonly (DeletionQueueRow & { readonly deadline: Date })[];
}

/** Read for the operator only (a plant keeper or a reviewer gets `access.denied`); the database checks the role again. */
export async function operatorDeletions(
  deps: { access: RoleReader; queue: DeletionQueueStore },
  userId: string,
  now: Date,
): Promise<Result<OperatorDeletions>> {
  if (!(await isOperator(deps.access)({ userId }))) return failed(appError("access.denied"));
  const rows = await deps.queue.queue(userId);
  const report = classifyDeadlines(
    rows.map((row) => ({ ...row, done: false })),
    now,
  );
  const identityRemovals = rows
    .filter((row) => row.kind === "identity")
    .map((row) => ({ ...row, deadline: deadlineOf(row.requestedAt) }))
    .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0));
  return ok({
    warningDays: DEADLINE_RULES.warningDays,
    near: report.near,
    past: report.past,
    identityRemovals,
  });
}

const markSchema = shape({ entryId: idField("entryId") });

/**
 * The operator closes an identity removal that was done by hand (the identity service is not configured, or the user was
 * removed outside the application). Operator only; repeating it changes nothing and answers success (idempotent). The
 * database checks the role again. The entry keeps no subject afterwards.
 */
export const privacyMarkIdentityRemoved = (deps: {
  access: RoleReader;
  queue: DeletionQueueStore;
}) =>
  defineOperation({
    name: "privacy.mark_identity_removed",
    schema: markSchema,
    authorized: isOperator(deps.access),
    run: async ({ userId }, input) => {
      const outcome = await deps.queue.markIdentityRemoved(userId, input.entryId);
      if (outcome === "unknown") return failed(appError("privacy.entry_not_found"));
      return ok({ entryId: input.entryId, outcome });
    },
  });
