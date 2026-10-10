import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface DraftRow {
  readonly id: string;
  readonly connectionId: string;
  readonly clientName: string;
  readonly type: string;
  readonly reference: string | null;
  readonly content: unknown;
  readonly source: string;
  readonly status: "open" | "adopted" | "discarded" | "expired";
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
/** An open draft older than 14 days counts as expired (DM-KI-03, assumption); nothing is deleted. */
const COLUMNS = (
  now: string,
) => `d.id, d.connection_id as "connectionId", k.client_name as "clientName", d.type,
  d.reference, d.content, d.source,
  case when d.status = 'open' and d.created_at < ${now}::timestamptz - interval '14 days' then 'expired' else d.status end as status,
  to_char(d.created_at at time zone 'UTC', ${ISO}) as "createdAt",
  to_char(d.decided_at at time zone 'UTC', ${ISO}) as "decidedAt"`;
const FROM = `from ai_draft d join ai_connection k on k.id = d.connection_id and k.account_id = d.account_id`;

/** Adapter for the drafts of AI clients (US-KI-09); every call runs as the account of the caller (P-04). */
export class DraftsPostgres {
  constructor(private readonly pool: Pool) {}

  async create(
    userId: string,
    d: {
      connectionId: string;
      type: string;
      reference: string | null;
      content: unknown;
      contentKey: string;
      source: string;
    },
    now: Date,
  ): Promise<{ draft: DraftRow; created: boolean }> {
    return withAccount(this.pool, userId, async (c) => {
      const ins = await c.query<{ id: string }>(
        `insert into ai_draft (account_id, connection_id, type, reference, content, content_key, source, created_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)
         on conflict (account_id, type, md5(content_key)) where status = 'open' do nothing returning id`,
        [
          userId,
          d.connectionId,
          d.type,
          d.reference,
          JSON.stringify(d.content),
          d.contentKey,
          d.source,
          now,
        ],
      );
      const id =
        ins.rows[0]?.id ??
        (
          await c.query<{ id: string }>(
            "select id from ai_draft where type = $1 and md5(content_key) = md5($2) and status = 'open'",
            [d.type, d.contentKey],
          )
        ).rows[0]?.id;
      const r = await c.query<DraftRow>(`select ${COLUMNS("$2")} ${FROM} where d.id = $1`, [
        id,
        now,
      ]);
      const draft = r.rows[0];
      if (!draft) throw new Error("Draft could not be stored");
      return { draft, created: ins.rows[0] !== undefined };
    });
  }

  async list(userId: string, now: Date): Promise<readonly DraftRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<DraftRow>(`select ${COLUMNS("$1")} ${FROM} order by d.created_at desc, d.id desc`, [
        now,
      ]),
    );
    return r.rows;
  }

  async find(userId: string, id: string, now: Date): Promise<DraftRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<DraftRow>(`select ${COLUMNS("$2")} ${FROM} where d.id = $1`, [id, now]),
    );
    return r.rows[0] ?? null;
  }

  async decide(
    userId: string,
    id: string,
    status: "adopted" | "discarded" | "open",
    now: Date,
  ): Promise<boolean> {
    const from = status === "open" ? "adopted" : "open";
    const fresh = status === "open" ? "" : "and created_at >= $3::timestamptz - interval '14 days'";
    const r = await withAccount(this.pool, userId, (c) =>
      c.query(
        `update ai_draft set status = $2::text, decided_at = case when $2::text = 'open' then null else $3::timestamptz end
          where id = $1 and status = '${from}' ${fresh}`,
        [id, status, now],
      ),
    );
    return (r.rowCount ?? 0) > 0;
  }
}
