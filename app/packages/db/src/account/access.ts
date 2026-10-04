import type { Pool, PoolClient } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interface AccessStore in `core` (structurally equal; `db` does not import `core`).
type Role = "operator" | "reviewer";
type Status = "open" | "redeemed" | "expired";
interface InvitationRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly redeemedAt: string | null;
  readonly status: Status;
}
interface AccessCounts {
  readonly accounts: number;
  readonly activeAccounts: number;
  readonly invitationOnly: boolean;
  readonly invitations: readonly InvitationRecord[];
}

/** UTC instants as ISO strings, independent of the session time zone of the connection. */
const INSTANT = (column: string) =>
  `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Adapter for access control (US-ACC-05). The operator functions run under the account of the caller and check the
 * operator role in the database (P-04); the tables themselves are closed to the application role.
 */
export class AccessPostgres {
  constructor(private readonly pool: Pool) {}

  async roles(userId: string): Promise<readonly Role[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ role: Role }>("select roles_of_account() as role"),
    );
    return r.rows.map((z) => z.role);
  }

  async createInvitation(userId: string, v: { code: string; expiresAt: string }) {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ id: string; expiresAt: string }>(
        `select id, ${INSTANT("expires_at")} as "expiresAt" from create_invitation($1, $2)`,
        [v.code, v.expiresAt],
      ),
    );
    return r.rows[0] as { id: string; expiresAt: string };
  }

  async setInvitationOnly(userId: string, on: boolean): Promise<void> {
    await withAccount(this.pool, userId, (c) => c.query("select set_invitation_only($1)", [on]));
  }

  async overview(userId: string, activeWindowDays: number): Promise<AccessCounts> {
    return withAccount(this.pool, userId, async (c) => {
      const counts = await c.query<{
        accounts: number;
        active: number;
        invitationOnly: boolean;
      }>(
        `select accounts, active_accounts as active, invitation_only as "invitationOnly"
           from operator_overview($1)`,
        [activeWindowDays],
      );
      const list = await c.query<InvitationRecord>(
        `select id, ${INSTANT("created_at")} as "createdAt", ${INSTANT("expires_at")} as "expiresAt",
                ${INSTANT("redeemed_at")} as "redeemedAt", status
           from list_invitations()`,
      );
      const row = counts.rows[0] as { accounts: number; active: number; invitationOnly: boolean };
      return {
        accounts: row.accounts,
        activeAccounts: row.active,
        invitationOnly: row.invitationOnly,
        invitations: list.rows,
      };
    });
  }

  /**
   * One transaction on the registration path: account of the subject and used-up code stand or fall together. The
   * code is used up first (a conditional update, single use also under concurrency); if the subject got its account
   * from a concurrent request meanwhile, the whole transaction is rolled back and the code stays unused.
   */
  async register(subject: string, code: string): Promise<"registered" | "existing" | "invalid"> {
    if (subject.trim() === "") throw new Error("Subject missing");
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role pflanzendex_app");
      await client.query("select set_config('app.subject', $1, true)", [subject]);
      const known = await client.query("select 1 from account where subject = $1", [subject]);
      if (known.rowCount) return await finish(client, "existing");
      const used = await client.query<{ ok: boolean }>("select redeem_invitation($1) as ok", [
        code,
      ]);
      if (!used.rows[0]?.ok) return await finish(client, "invalid");
      const created = await client.query(
        "insert into account (subject) values ($1) on conflict (subject) do nothing",
        [subject],
      );
      return await finish(client, created.rowCount ? "registered" : "existing");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

/** Commits only a successful registration; every other outcome rolls back, so no code is lost by a failed attempt. */
async function finish<T extends "registered" | "existing" | "invalid">(
  client: PoolClient,
  outcome: T,
): Promise<T> {
  await client.query(outcome === "registered" ? "commit" : "rollback");
  return outcome;
}
