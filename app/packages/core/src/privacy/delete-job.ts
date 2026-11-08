import { ok, type Result } from "../kernel";
import type { JobHandler } from "../jobs";
import type { ObjectStore } from "../media";
import type { DeletionStore } from "./deletion";

// The background job that removes an account (US-ACC-04). Repeatable at every point: it looks at the request first, so a
// withdrawn request, a request not yet due and an account that is already gone all end without doing anything.

export interface ErasedAccount {
  /** The sign-in subject, to be removed at the identity service; `null` if the account never had one. */
  readonly subject: string | null;
}

/** Port: the database steps that read the subject, delete the account and mark the identity removal. */
export interface AccountEraser {
  /** The sign-in subject of the account, read before anything is erased; `null` if the account has none. */
  subjectOf(accountId: string): Promise<string | null>;
  /** `null` when nothing is due (no request, or the grace period has not ended). */
  erase(accountId: string, now: Date): Promise<ErasedAccount | null>;
  /** Marks that the identity was removed at the identity service (the deletion log entry of the subject). */
  identityRemoved(subject: string, now: Date): Promise<void>;
}

/**
 * Port of the identity service (Keycloak). `removed` when the user is gone, `pending` when the removal is not configured
 * (the stub `identityKept`: the subject stays in the deletion log until the operator removes the user by hand and marks
 * it, runbook `docs/guides/operations/account-deletion.md`). A failure is an error result, and the job retries.
 */
export interface IdentityRemoval {
  remove(subject: string): Promise<Result<"removed" | "pending">>;
}

export interface DeleteAccountDependencies {
  readonly deletions: Pick<DeletionStore, "find">;
  readonly eraser: AccountEraser;
  readonly photos: ObjectStore;
  readonly identity: IdentityRemoval;
}

/**
 * Order: photos, then the identity, then the database. A failure of the store or of the identity service stops the job
 * before any data is gone, so the retry still finds the request and the subject (nothing is lost, P-10). The identity
 * goes before the erase, because the erase deletes the request. The object store is emptied by account prefix, so photos
 * no row names any more go too.
 */
export const deleteAccountJob =
  (deps: DeleteAccountDependencies): JobHandler =>
  async (job, now) => {
    const accountId = job.payload["accountId"];
    if (typeof accountId !== "string") throw new Error("job without account id");
    const request = await deps.deletions.find(accountId);
    if (request === null || request.dueAt.getTime() > now.getTime()) return;
    const cleared = await deps.photos.deleteAll(accountId);
    if (!cleared.ok) throw new Error(`photos not removed: ${cleared.error.code}`);
    const subject = await deps.eraser.subjectOf(accountId);
    let removed = false;
    if (subject !== null) {
      const identity = await deps.identity.remove(subject);
      if (!identity.ok) throw new Error(`identity not removed: ${identity.error.code}`);
      removed = identity.value === "removed";
    }
    const erased = await deps.eraser.erase(accountId, now);
    if (erased === null) return;
    if (removed && erased.subject !== null) await deps.eraser.identityRemoved(erased.subject, now);
  };

export const identityKept: IdentityRemoval = {
  remove: async () => ok("pending"),
};
