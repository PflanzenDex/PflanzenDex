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

/** Port: the one database step that deletes the account and everything that hangs on it, in one transaction. */
export interface AccountEraser {
  /** `null` when nothing is due (no request, or the grace period has not ended). */
  erase(accountId: string, now: Date): Promise<ErasedAccount | null>;
  /** Marks that the operator-side identity was removed at the identity service. */
  identityRemoved(subject: string, now: Date): Promise<void>;
}

/**
 * Port of the identity service (Keycloak). The real removal needs an action in the realm that this application does not
 * do on its own yet: the stub answers `pending` and the subject stays in the deletion log until the operator has removed
 * the user and marked it (runbook `account-deletion`). `removed` marks it done at once.
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
 * Order: photos first, then the database. A failure of the store stops the job before any data is gone (the job retries);
 * a failure after the database step cannot lose the subject, because the database wrote it to the deletion log. The
 * object store is emptied by account prefix, so photos no row names any more go too.
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
    const erased = await deps.eraser.erase(accountId, now);
    if (erased?.subject == null) return;
    const identity = await deps.identity.remove(erased.subject);
    if (!identity.ok) throw new Error(`identity not removed: ${identity.error.code}`);
    if (identity.value === "removed") await deps.eraser.identityRemoved(erased.subject, now);
  };

export const identityKept: IdentityRemoval = {
  remove: async () => ok("pending"),
};
