import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { TreatmentRow, TreatmentValues } from "@pflanzendex/core";
export type { TreatmentRow, TreatmentValues };

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

  /** One treatment by ID; the row rules make a foreign ID look unknown (P-04). */
  async find(userId: string, id: string): Promise<TreatmentRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<TreatmentRow>(`select ${COLUMNS} from treatment where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  /**
   * Ticks off with the local date `doneAt`. Only an open treatment is updated; if a parallel call (second device) was
   * faster, the update waits for the row, finds nothing to change and the stored row comes back with its first done
   * date, so a repeat is harmless (idempotent, US-BEH-03).
   */
  async complete(userId: string, id: string, doneAt: string): Promise<TreatmentRow | "unknown"> {
    const r = await withAccount(this.pool, userId, async (c) => {
      const updated = await c.query<TreatmentRow>(
        `update treatment set done = true, done_at = $2 where id = $1 and not done returning ${COLUMNS}`,
        [id, doneAt],
      );
      if (updated.rows.length > 0) return updated;
      return c.query<TreatmentRow>(`select ${COLUMNS} from treatment where id = $1`, [id]);
    });
    return r.rows[0] ?? "unknown";
  }

  /** Done treatments of one specimen, latest done date first (history, US-BEH-03). */
  async done(userId: string, specimenId: string): Promise<readonly TreatmentRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<TreatmentRow>(
        `select ${COLUMNS} from treatment where specimen_id = $1 and done order by done_at desc, due_at desc, id`,
        [specimenId],
      ),
    );
    return r.rows;
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
