import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

// Same shape as `DeletionQueueRow` in `core` (structurally equal; `db` does not import `core`).
export interface DeletionQueueRecord {
  readonly kind: "request" | "identity";
  /** The deletion log entry of an identity removal; `null` for a request. */
  readonly entryId: string | null;
  readonly requestedAt: Date;
  /** The sign-in subject of an identity removal; `null` for a request. */
  readonly subject: string | null;
  /** When the deletion was finished; `null` for a request. */
  readonly completedAt: Date | null;
}

const COLUMNS = `kind, entry_id as "entryId", requested_at as "requestedAt", subject, completed_at as "completedAt"`;

/**
 * The open deletions (US-ACC-04, card "Fristen", issue 1673). The health details read every open item through the owner
 * connection (`deletion_deadline_rows()`, worker only, like `reminder_accounts()`); the operator reads them as the operator
 * account (`operator_deletion_queue()`, checked again in the database) and closes an identity removal the same way.
 */
export class DeletionQueuePostgres {
  constructor(private readonly pool: Pool) {}

  /** Every open item, for the deadline check; needs the owner pool, no account is set. */
  async openItems(): Promise<DeletionQueueRecord[]> {
    const r = await this.pool.query<DeletionQueueRecord>(
      `select ${COLUMNS} from deletion_deadline_rows()`,
    );
    return r.rows;
  }

  /** The operator's read; the database refuses anyone but the operator. */
  async queue(userId: string): Promise<DeletionQueueRecord[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<DeletionQueueRecord>(`select ${COLUMNS} from operator_deletion_queue()`),
    );
    return r.rows;
  }

  /** `marked`, `already` (a repeat) or `unknown`; the database refuses anyone but the operator. */
  async markIdentityRemoved(
    userId: string,
    entryId: string,
  ): Promise<"marked" | "already" | "unknown"> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ outcome: "marked" | "already" | "unknown" }>(
        "select operator_mark_identity_removed($1) as outcome",
        [entryId],
      ),
    );
    return r.rows[0]?.outcome ?? "unknown";
  }
}
