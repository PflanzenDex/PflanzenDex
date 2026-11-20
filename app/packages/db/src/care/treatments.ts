import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";
import { readGrouped } from "./group-rows.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { CompleteOutcome, TreatmentRow, TreatmentValues } from "@pflanzendex/core";
export type { CompleteOutcome, TreatmentRow, TreatmentValues };

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
  async complete(userId: string, id: string, doneAt: string): Promise<CompleteOutcome | "unknown"> {
    const r = await withAccount(this.pool, userId, async (c) => {
      const updated = await c.query<TreatmentRow>(
        `update treatment set done = true, done_at = $2 where id = $1 and not done returning ${COLUMNS}`,
        [id, doneAt],
      );
      if (updated.rows.length > 0) return { row: updated.rows[0], changed: true };
      const stored = await c.query<TreatmentRow>(`select ${COLUMNS} from treatment where id = $1`, [
        id,
      ]);
      return { row: stored.rows[0], changed: false };
    });
    return r.row ? { ...r.row, changed: r.changed } : "unknown";
  }

  /**
   * Clears done and the done date of one treatment (US-QS-32, the undo of "Erledigt"). The table keeps both together
   * (`done = (done_at is not null)`). An open treatment comes back unchanged; a foreign or unknown ID is `unknown`.
   */
  /**
   * Clears done and the done date of one treatment, only while its done date is `doneOn` (US-QS-32, the undo of "Erledigt"):
   * the UPDATE is the check, so a row that moved on is not overwritten. An open treatment answers its row; a foreign or
   * unknown ID is `unknown`; a tick-off of another day is `not_reopenable`.
   */
  async reopen(
    userId: string,
    id: string,
    doneOn: string,
  ): Promise<TreatmentRow | "unknown" | "not_reopenable"> {
    return withAccount(this.pool, userId, async (c) => {
      const updated = await c.query<TreatmentRow>(
        `update treatment set done = false, done_at = null where id = $1 and done and done_at = $2 returning ${COLUMNS}`,
        [id, doneOn],
      );
      if (updated.rows.length > 0) return updated.rows[0] as TreatmentRow;
      const stored = await c.query<TreatmentRow>(`select ${COLUMNS} from treatment where id = $1`, [
        id,
      ]);
      const row = stored.rows[0];
      if (!row) return "unknown";
      return row.done ? "not_reopenable" : row;
    });
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

  /**
   * `open` and the latest done treatment (the first one `done` lists) of each ID in ONE statement (NFR-12): the open
   * rows come back earliest first, the done row is the one with the latest done date. Foreign IDs return nothing (P-04).
   */
  async openAndLastDone(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<{
    readonly open: ReadonlyMap<string, readonly TreatmentRow[]>;
    readonly lastDone: ReadonlyMap<string, TreatmentRow>;
  }> {
    if (specimenIds.length === 0) return { open: new Map(), lastDone: new Map() };
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<TreatmentRow>(
        `select ${COLUMNS} from treatment
          where specimen_id = any($1)
            and (not done or id in (
              select distinct on (specimen_id) id from treatment
               where specimen_id = any($1) and done
               order by specimen_id, done_at desc, due_at desc, id))
          order by due_at, id`,
        [specimenIds],
      ),
    );
    const open = new Map<string, TreatmentRow[]>();
    const lastDone = new Map<string, TreatmentRow>();
    for (const row of r.rows) {
      if (row.done) lastDone.set(row.specimenId, row);
      else open.set(row.specimenId, [...(open.get(row.specimenId) ?? []), row]);
    }
    return { open, lastDone };
  }

  /**
   * Done treatments of several specimens in one statement (NFR-12). Per specimen the order is the one of `done`: the
   * statement sorts by the same keys, and grouping keeps that order. Foreign IDs return nothing (P-04); no IDs, no query.
   */
  async doneMany(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly TreatmentRow[]>> {
    return readGrouped<TreatmentRow>(
      this.pool,
      userId,
      specimenIds,
      `select ${COLUMNS} from treatment where specimen_id = any($1) and done
       order by done_at desc, due_at desc, id`,
    );
  }

  /** Open treatments, earliest first; one query for all IDs. Foreign IDs return nothing (row rules, P-04). */
  async open(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly TreatmentRow[]>> {
    return readGrouped<TreatmentRow>(
      this.pool,
      userId,
      specimenIds,
      `select ${COLUMNS} from treatment where specimen_id = any($1) and not done order by due_at, id`,
    );
  }
}
