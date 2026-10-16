import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface DeletionRequestRow {
  readonly requestedAt: Date;
  readonly dueAt: Date;
}

const COLUMNS = `requested_at as "requestedAt", due_at as "dueAt"`;

/** The request to delete the account (US-ACC-04); every call runs as the account of the caller (P-04). */
export class AccountDeletionPostgres {
  constructor(private readonly pool: Pool) {}

  async find(userId: string): Promise<DeletionRequestRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<DeletionRequestRow>(`select ${COLUMNS} from account_deletion`),
    );
    return r.rows[0] ?? null;
  }

  /** An existing request is kept (and its deadline with it); repeating never moves the deadline. */
  async request(userId: string, dueAt: Date): Promise<DeletionRequestRow> {
    const r = await withAccount(this.pool, userId, async (c) => {
      await c.query(
        `insert into account_deletion (account_id, due_at) values ($1, $2) on conflict (account_id) do nothing`,
        [userId, dueAt],
      );
      return c.query<DeletionRequestRow>(`select ${COLUMNS} from account_deletion`);
    });
    return r.rows[0] as DeletionRequestRow;
  }

  async cancel(userId: string): Promise<boolean> {
    const r = await withAccount(this.pool, userId, (c) => c.query("delete from account_deletion"));
    return (r.rowCount ?? 0) > 0;
  }

  /**
   * Deletes the account with everything that hangs on it, in one transaction (function `erase_account()`). `null` when
   * nothing is due: no request (withdrawn, or the account is already gone) or the grace period has not ended. The
   * answer carries the sign-in subject for the removal at the identity service.
   */
  async erase(userId: string, now: Date): Promise<{ subject: string | null } | null> {
    const due = await this.find(userId);
    if (!due || due.dueAt.getTime() > now.getTime()) return null;
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ subject: string | null }>("select subject from erase_account()"),
    );
    return r.rows[0] ?? null;
  }

  /** The operator side of the log is written with the connection of the application's owner, not as an account. */
  async identityRemoved(subject: string, now: Date): Promise<void> {
    await this.pool.query(
      `update deletion_log set subject = null, identity_removed_at = $2
        where subject = $1 and identity_removed_at is null`,
      [subject, now],
    );
  }
}
