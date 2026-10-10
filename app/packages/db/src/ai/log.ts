import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface AiLogRow {
  readonly id: string;
  readonly connectionId: string;
  readonly clientName: string;
  readonly operation: string;
  readonly effect: string;
  readonly createdAt: string;
  readonly undoneAt: string | null;
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/** Adapter for the log of AI actions (US-KI-10, DM-KI-04); every call runs as the account of the caller (P-04). */
export class AiLogPostgres {
  constructor(private readonly pool: Pool) {}

  async record(
    userId: string,
    entry: { connectionId: string; operation: string; effect: string },
    now: Date,
  ): Promise<void> {
    await withAccount(this.pool, userId, (c) =>
      c.query(
        `insert into ai_log (account_id, connection_id, operation, effect, created_at)
         values ($1, $2, $3, $4, $5)`,
        [userId, entry.connectionId, entry.operation, entry.effect.slice(0, 500), now],
      ),
    );
  }

  /** Newest first. */
  async list(userId: string, limit: number): Promise<readonly AiLogRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<AiLogRow>(
        `select l.id, l.connection_id as "connectionId", k.client_name as "clientName", l.operation, l.effect,
                to_char(l.created_at at time zone 'UTC', ${ISO}) as "createdAt",
                to_char(l.undone_at at time zone 'UTC', ${ISO}) as "undoneAt"
           from ai_log l join ai_connection k on k.id = l.connection_id and k.account_id = l.account_id
          order by l.created_at desc, l.id desc limit $1`,
        [limit],
      ),
    );
    return r.rows;
  }
}
