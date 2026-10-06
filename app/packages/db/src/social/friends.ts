import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interface FriendStore in `core` (structurally equal; `db` does not import `core`).
export interface FriendRequestRow {
  readonly id: string;
  readonly otherName: string | null;
  readonly direction: "sent" | "received";
  readonly requestedAt: string;
}
type Outcome =
  "requested" | "unknown_code" | "code_used" | "code_expired" | "own_code" | "already_linked";
export type RedeemResult =
  | { readonly outcome: "requested"; readonly request: FriendRequestRow }
  | { readonly outcome: Exclude<Outcome, "requested"> };

/** UTC instants as ISO strings, independent of the session time zone of the connection. */
const INSTANT = (column: string) =>
  `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/**
 * Adapter for friendships (US-SOZ-01). Every call runs as the account of the caller (P-04): the friend codes are
 * reached only through two functions, the friendship rows through the normal row rule (each account sees its own side).
 */
export class FriendsPostgres {
  constructor(private readonly pool: Pool) {}

  async createCode(userId: string, v: { code: string; expiresAt: string }) {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ id: string; expiresAt: string }>(
        `select id, ${INSTANT("expires_at")} as "expiresAt" from create_friend_code($1, $2)`,
        [v.code, v.expiresAt],
      ),
    );
    return r.rows[0] as { id: string; expiresAt: string };
  }

  async requestWithCode(userId: string, code: string): Promise<RedeemResult> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{
        outcome: Outcome;
        id: string | null;
        otherName: string | null;
        requestedAt: string | null;
      }>(
        `select outcome, request_id as id, other_name as "otherName", ${INSTANT("requested_at")} as "requestedAt"
           from request_friendship($1)`,
        [code],
      ),
    );
    // The function always returns exactly one row.
    const row = r.rows[0] as NonNullable<(typeof r.rows)[number]>;
    if (row.outcome !== "requested") return { outcome: row.outcome };
    return {
      outcome: "requested",
      request: {
        id: row.id as string,
        otherName: row.otherName,
        direction: "sent",
        requestedAt: row.requestedAt as string,
      },
    };
  }

  async openRequests(userId: string): Promise<readonly FriendRequestRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<FriendRequestRow>(
        `select id, other_name as "otherName", direction, ${INSTANT("requested_at")} as "requestedAt"
           from friendship where status = 'requested' order by requested_at desc, id`,
      ),
    );
    return r.rows;
  }
}
