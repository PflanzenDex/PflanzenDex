import { appError, defineOperation, failed, ok, shape, type ErrorDetail } from "../kernel";
import { enqueueJob, JOB_LIMITS, type JobQueue } from "../jobs";

// Deleting the own account with a grace period (US-ACC-04, P-04, P-10). The keeper asks and confirms; nothing is removed
// at once. The data stays untouched until `dueAt`, the keeper can withdraw the request until then, and a background job
// (`DELETE_ACCOUNT_JOB`) does the removal afterwards. Every step can be repeated without harm.

/** 7 days of grace (assumption, decided by the PO deputy: long enough to change one's mind, short enough for the GDPR deadline of one month). */
export const DELETION_LIMITS = { graceDays: 7 } as const;

export const DELETE_ACCOUNT_JOB = "privacy.delete_account";

/** The removal retries for about a day if the object store is down (`JOB_LIMITS.backoff`, doubled each time up to the cap). */
const JOB_ATTEMPTS = 12;

export interface DeletionRequest {
  readonly requestedAt: Date;
  /** From this moment the job may remove the data. */
  readonly dueAt: Date;
}

/** Port for the request of the account; the adapter lives in `db` and runs as the account of the caller (P-04). */
export interface DeletionStore {
  /** `null` while no deletion is requested. */
  find(userId: string): Promise<DeletionRequest | null>;
  /** Stores the request; an existing request is kept as it is and returned (repeating changes nothing). */
  request(userId: string, dueAt: Date): Promise<DeletionRequest>;
  /** `false` when there was nothing to withdraw. */
  cancel(userId: string): Promise<boolean>;
}

export interface DeletionDependencies {
  readonly store: DeletionStore;
  readonly queue: JobQueue;
  readonly now: () => Date;
}

const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 24 * 60 * 60 * 1000);

/** The job runs when the grace period ends. The key contains the due date, so a request after a withdrawal gets its own job. */
const jobKey = (userId: string, dueAt: Date) => `${userId}:${dueAt.toISOString()}`;

const confirmation = shape({
  // The keeper confirmed in the screen that names what is removed; anything but an explicit `true` is refused.
  confirm: (value: unknown): true | ErrorDetail =>
    value === true ? true : { field: "confirm", code: "input.invalid" },
});

/**
 * Requests the deletion of the account (US-ACC-04). Needs `confirm: true`. The request is stored first and the job is
 * ordered afterwards; if ordering fails the request stays and repeating the call orders the job again (the order is
 * merged with an open one). Nothing is removed before `dueAt`.
 */
export const privacyRequestDeletion = (deps: DeletionDependencies) =>
  defineOperation({
    name: "privacy.request_deletion",
    schema: confirmation,
    run: async ({ userId }) => {
      const request = await deps.store.request(
        userId,
        addDays(deps.now(), DELETION_LIMITS.graceDays),
      );
      const ordered = await enqueueJob(deps, {
        type: DELETE_ACCOUNT_JOB,
        dedupeKey: jobKey(userId, request.dueAt),
        payload: { accountId: userId },
        runAt: request.dueAt,
        maxAttempts: Math.min(JOB_ATTEMPTS, JOB_LIMITS.maxAttempts.max),
      });
      if (!ordered.ok) return failed(appError("system.unexpected", { cause: ordered.error }));
      return ok(request);
    },
  });

const noInput = shape({});

/** Withdraws the request. Nothing was removed yet, so nothing is lost; withdrawing again is harmless. */
export const privacyCancelDeletion = (deps: Pick<DeletionDependencies, "store">) =>
  defineOperation({
    name: "privacy.cancel_deletion",
    schema: noInput,
    run: async ({ userId }) => {
      await deps.store.cancel(userId);
      return ok({ canceled: true as const });
    },
  });
