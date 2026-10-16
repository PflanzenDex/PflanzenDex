import {
  DELETE_ACCOUNT_JOB,
  deleteAccountJob,
  identityKept,
  privacyCancelDeletion,
  privacyRequestDeletion,
  type JobHandlers,
  type ObjectStore,
} from "@pflanzendex/core";
import { AccountDeletionPostgres, IdempotencyPostgres, JobsPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { body, write, type AuthEnv } from "../../kernel";

const view = (r: { requestedAt: Date; dueAt: Date }) => ({
  requested: true as const,
  requestedAt: r.requestedAt.toISOString(),
  dueAt: r.dueAt.toISOString(),
});

/**
 * Deleting the own account (US-ACC-04): `GET /account/deletion` says whether a deletion is requested and when it
 * happens; `POST /account/deletion` with `{ "confirm": true }` requests it (the data stays until the deadline, 7 days);
 * `DELETE /account/deletion` withdraws it. Writes go through operations (P-03, with `Idempotency-Key`) for the account
 * of the caller (P-04), whatever function groups are switched on.
 */
export function deletionRoutes(pool: Pool, clock: () => Date = () => new Date()): Hono<AuthEnv> {
  const store = new AccountDeletionPostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const request = privacyRequestDeletion({ store, queue: new JobsPostgres(pool), now: clock });
  const cancel = privacyCancelDeletion({ store });
  const routes = new Hono<AuthEnv>();
  routes.get("/deletion", async (c) => {
    const found = await store.find(c.get("account").id);
    return c.json(found ? view(found) : { requested: false });
  });
  routes.post("/deletion", async (c) =>
    write(c, deps, request, { input: await body(c), wrapper: view }),
  );
  routes.delete("/deletion", async (c) =>
    write(c, deps, cancel, { input: {}, wrapper: () => ({ requested: false }) }),
  );
  return routes;
}

/**
 * The background job that removes an account when its grace period has ended. Without an object store the job fails and
 * retries (photos could not be removed), it never skips them silently (P-10). The identity service is a stub: the
 * subject stays in the deletion log until the operator removed the user (runbook `account-deletion`).
 */
export function deleteAccountHandlers(pool: Pool, photos: ObjectStore): JobHandlers {
  const deletions = new AccountDeletionPostgres(pool);
  return {
    [DELETE_ACCOUNT_JOB]: deleteAccountJob({
      deletions,
      eraser: deletions,
      photos,
      identity: identityKept,
    }),
  };
}
