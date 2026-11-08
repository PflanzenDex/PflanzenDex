import {
  operatorDeletions,
  privacyMarkIdentityRemoved,
  type DeletionQueueRow,
  type OperatorDeletions,
} from "@pflanzendex/core";
import { AccessPostgres, DeletionQueuePostgres, IdempotencyPostgres } from "@pflanzendex/db";
import { Hono } from "hono";
import type { Pool } from "pg";
import { errorBody, statusFor, write, type AuthEnv } from "../../kernel";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const item = (i: DeletionQueueRow & { readonly deadline: Date }) => ({
  kind: i.kind,
  entryId: i.entryId,
  requestedAt: iso(i.requestedAt),
  deadline: iso(i.deadline),
  subject: i.subject,
  completedAt: iso(i.completedAt),
});

/** Dates in UTC, the identities as the log holds them; never an account (P-05). */
const view = (r: OperatorDeletions) => ({
  warningDays: r.warningDays,
  near: r.near.map(item),
  past: r.past.map(item),
  identityRemovals: r.identityRemovals.map(item),
});

/**
 * The operator's view of the open deletions (US-ACC-04, card "Fristen", issue 1673), for the operator only (the database
 * checks the role again):
 * - GET /operator/deletions: the requests and identity removals inside the warning window (`near`) and past their
 *   deadline (`past`), and every open identity removal (`identityRemovals`, the subject and its completion time)
 * - POST /operator/deletion-log/:id/identity-removed: marks one identity removal done by hand (`Idempotency-Key`);
 *   repeating it answers success, an unknown entry 404 `privacy.entry_not_found`
 */
export function operatorDeletionRoutes(
  pool: Pool,
  clock: () => Date = () => new Date(),
): Hono<AuthEnv> {
  const access = new AccessPostgres(pool);
  const queue = new DeletionQueuePostgres(pool);
  const deps = { idempotency: new IdempotencyPostgres(pool) };
  const mark = privacyMarkIdentityRemoved({ access, queue });
  const routes = new Hono<AuthEnv>();
  routes.get("/operator/deletions", async (c) => {
    const r = await operatorDeletions({ access, queue }, c.get("account").id, clock());
    return r.ok ? c.json(view(r.value)) : c.json(errorBody(r.error), statusFor(r.error));
  });
  routes.post("/operator/deletion-log/:id/identity-removed", async (c) =>
    write(c, deps, mark, { input: { entryId: c.req.param("id") } }),
  );
  return routes;
}
