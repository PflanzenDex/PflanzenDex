import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

type Rights = "read" | "drafts" | "write";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface ConnectionRow {
  readonly id: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly rights: Rights;
  readonly requestedRights: Rights | null;
  readonly createdAt: string;
  readonly lastUse: string | null;
  readonly revokedAt: string | null;
}

const COLUMNS = `id, client_id as "clientId", client_name as "clientName", rights,
  requested_rights as "requestedRights", to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
  to_char(last_use at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "lastUse",
  to_char(revoked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "revokedAt"`;

/**
 * Adapter for the connections of AI clients (US-KI-07); every call runs as the account of the caller under the row
 * rules (P-04), so a connection of another account is never visible, changeable or revocable (KI-R6).
 */
export class ConnectionsPostgres {
  constructor(private readonly pool: Pool) {}

  async latest(userId: string, clientId: string): Promise<ConnectionRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ConnectionRow>(
        `select ${COLUMNS} from ai_connection where client_id = $1 order by created_at desc, id limit 1`,
        [clientId],
      ),
    );
    return r.rows[0] ?? null;
  }

  async create(
    userId: string,
    input: { clientId: string; clientName: string; rights: Rights },
    now: Date,
  ): Promise<ConnectionRow> {
    // A parallel first call of the same client meets the unique index: the existing active row wins.
    const r = await withAccount(this.pool, userId, async (c) => {
      await c.query(
        `insert into ai_connection (account_id, client_id, client_name, rights, created_at)
         values ($1, $2, $3, $4, $5) on conflict (account_id, client_id) where revoked_at is null do nothing`,
        [
          userId,
          input.clientId,
          input.clientName.slice(0, 100) || input.clientId.slice(0, 100),
          input.rights,
          now,
        ],
      );
      return c.query<ConnectionRow>(
        `select ${COLUMNS} from ai_connection where client_id = $1 order by created_at desc, id limit 1`,
        [input.clientId],
      );
    });
    const row = r.rows[0];
    if (!row) throw new Error("Connection could not be created");
    return row;
  }

  async touch(userId: string, id: string, now: Date, requested: Rights | null): Promise<void> {
    await withAccount(this.pool, userId, (c) =>
      c.query(
        "update ai_connection set last_use = $2, requested_rights = $3 where id = $1 and revoked_at is null",
        [id, now, requested],
      ),
    );
  }

  async list(userId: string): Promise<readonly ConnectionRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ConnectionRow>(`select ${COLUMNS} from ai_connection order by created_at desc, id`),
    );
    return r.rows;
  }

  async setRights(userId: string, id: string, rights: Rights): Promise<ConnectionRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<ConnectionRow>(
        `update ai_connection
            set rights = $2,
                requested_rights = case
                  when requested_rights is not null
                   and array_position(array['read','drafts','write'], requested_rights)
                     > array_position(array['read','drafts','write'], $2) then requested_rights end
          where id = $1 and revoked_at is null
          returning ${COLUMNS}`,
        [id, rights],
      ),
    );
    return r.rows[0] ?? null;
  }

  async revoke(userId: string, id: string, now: Date): Promise<"revoked" | "already" | "unknown"> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ revoked: boolean }>(
        `with hit as (select id, revoked_at from ai_connection where id = $1),
              done as (update ai_connection set revoked_at = $2, requested_rights = null
                        where id = $1 and revoked_at is null returning id)
         select (select count(*) from done) > 0 as revoked, (select count(*) from hit) as known from hit limit 1`,
        [id, now],
      ),
    );
    const row = r.rows[0];
    return !row ? "unknown" : row.revoked ? "revoked" : "already";
  }
}
