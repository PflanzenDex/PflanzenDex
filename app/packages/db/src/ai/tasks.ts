import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shape as the interface in `core` (structurally equal; `db` does not import `core`).
export interface TaskRow {
  readonly id: string;
  readonly type: "species_profile" | "wish_candidates" | "photo_assessment";
  readonly reference: string;
  readonly label: string;
  readonly status: "open" | "in_progress" | "done" | "declined" | "expired";
  readonly connectionId: string | null;
  readonly clientName: string | null;
  readonly draftId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
/** An open or in-progress task older than 14 days counts as expired (US-KI-08, assumption); nothing is deleted. */
const COLUMNS = (
  now: string,
) => `t.id, t.type, t.reference, t.label, t.connection_id as "connectionId", k.client_name as "clientName",
  t.draft_id as "draftId",
  case when t.status in ('open', 'in_progress') and t.created_at < ${now}::timestamptz - interval '14 days' then 'expired' else t.status end as status,
  to_char(t.created_at at time zone 'UTC', ${ISO}) as "createdAt",
  to_char(t.updated_at at time zone 'UTC', ${ISO}) as "updatedAt"`;
const FROM = `from ai_task t left join ai_connection k on k.id = t.connection_id and k.account_id = t.account_id`;

/** Adapter for the tasks to the AI client (US-KI-08); every call runs as the account of the caller (P-04). */
export class TasksPostgres {
  constructor(private readonly pool: Pool) {}

  async create(
    userId: string,
    t: { type: string; reference: string; label: string },
    now: Date,
  ): Promise<{ task: TaskRow; created: boolean }> {
    return withAccount(this.pool, userId, async (c) => {
      // An expired task no longer blocks a new one: store the expiry first, then the unique index decides.
      await c.query(
        `update ai_task set status = 'expired', updated_at = $4
          where type = $1 and reference = $2 and status in ('open', 'in_progress')
            and created_at < $3::timestamptz - interval '14 days'`,
        [t.type, t.reference, now, now],
      );
      const ins = await c.query<{ id: string }>(
        `insert into ai_task (account_id, type, reference, label, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $5)
         on conflict (account_id, type, md5(reference)) where status in ('open', 'in_progress') do nothing returning id`,
        [userId, t.type, t.reference, t.label, now],
      );
      const id =
        ins.rows[0]?.id ??
        (
          await c.query<{ id: string }>(
            "select id from ai_task where type = $1 and md5(reference) = md5($2) and status in ('open', 'in_progress')",
            [t.type, t.reference],
          )
        ).rows[0]?.id;
      const r = await c.query<TaskRow>(`select ${COLUMNS("$2")} ${FROM} where t.id = $1`, [
        id,
        now,
      ]);
      const task = r.rows[0];
      if (!task) throw new Error("Task could not be stored");
      return { task, created: ins.rows[0] !== undefined };
    });
  }

  async list(userId: string, now: Date): Promise<readonly TaskRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<TaskRow>(`select ${COLUMNS("$1")} ${FROM} order by t.created_at desc, t.id desc`, [
        now,
      ]),
    );
    return r.rows;
  }

  async find(userId: string, id: string, now: Date): Promise<TaskRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<TaskRow>(`select ${COLUMNS("$2")} ${FROM} where t.id = $1`, [id, now]),
    );
    return r.rows[0] ?? null;
  }

  async transition(
    userId: string,
    id: string,
    change: {
      from: readonly string[];
      to: string;
      connectionId?: string;
      draftId?: string;
    },
    now: Date,
  ): Promise<TaskRow | null> {
    return withAccount(this.pool, userId, async (c) => {
      const moved = await c.query(
        `update ai_task set status = $3, updated_at = $4,
                connection_id = coalesce($5::uuid, connection_id), draft_id = coalesce($6::uuid, draft_id)
          where id = $1 and status = any($2::text[]) and created_at >= $4::timestamptz - interval '14 days'`,
        [id, change.from, change.to, now, change.connectionId ?? null, change.draftId ?? null],
      );
      if ((moved.rowCount ?? 0) === 0) return null;
      const r = await c.query<TaskRow>(`select ${COLUMNS("$2")} ${FROM} where t.id = $1`, [
        id,
        now,
      ]);
      return r.rows[0] ?? null;
    });
  }
}
