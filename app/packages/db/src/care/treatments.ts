import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface TreatmentRow {
  readonly id: string;
  readonly specimenId: string;
  readonly reason: string;
  readonly agent: string | null;
  readonly dueAt: string;
  readonly done: boolean;
  readonly doneAt: string | null;
  readonly courseId: string | null;
}
export type TreatmentValues = Pick<
  TreatmentRow,
  "specimenId" | "reason" | "agent" | "dueAt" | "courseId"
>;

// Dates come back as text (the driver would build a `Date` in the server's time zone, NFR-08).
const COLUMNS = `id, specimen_id as "specimenId", reason, agent, to_char(due_at, 'YYYY-MM-DD') as "dueAt", done,
  to_char(done_at, 'YYYY-MM-DD') as "doneAt", course_id as "courseId"`;

const FOREIGN_KEY = "23503";

/**
 * Adapter for treatments; every call runs as the account of the caller under the row rules (P-04). The specimen hangs
 * on the own account through the composite foreign key (account_id, specimen_id): the specimen of another account is
 * unknown to the database, even if someone guesses its ID.
 */
export class TreatmentsPostgres {
  constructor(private readonly pool: Pool) {}

  /** One statement: all or nothing; the rows come back in the order of the values. */
  async createMany(
    userId: string,
    values: readonly TreatmentValues[],
  ): Promise<readonly TreatmentRow[] | "specimen_unknown"> {
    if (values.length === 0) return [];
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<TreatmentRow & { position: number }>(
          `insert into treatment (account_id, specimen_id, reason, agent, due_at, course_id)
           select $1, v.specimen_id, v.reason, v.agent, v.due_at, v.course_id
           from unnest($2::uuid[], $3::text[], $4::text[], $5::date[], $6::uuid[])
             with ordinality as v(specimen_id, reason, agent, due_at, course_id, position)
           order by v.position
           returning ${COLUMNS}`,
          [
            userId,
            values.map((v) => v.specimenId),
            values.map((v) => v.reason),
            values.map((v) => v.agent),
            values.map((v) => v.dueAt),
            values.map((v) => v.courseId),
          ],
        ),
      );
      return r.rows;
    } catch (e) {
      const f = e as { code?: string; constraint?: string };
      if (f.code === FOREIGN_KEY && f.constraint === "treatment_specimen")
        return "specimen_unknown";
      throw e;
    }
  }

  /** Open treatments, earliest first; one query for all IDs. Foreign IDs return nothing (row rules, P-04). */
  async open(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly TreatmentRow[]>> {
    if (specimenIds.length === 0) return new Map();
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<TreatmentRow>(
        `select ${COLUMNS} from treatment where specimen_id = any($1) and not done order by due_at, id`,
        [specimenIds],
      ),
    );
    const grouped = new Map<string, TreatmentRow[]>();
    for (const row of r.rows)
      grouped.set(row.specimenId, [...(grouped.get(row.specimenId) ?? []), row]);
    return grouped;
  }
}
