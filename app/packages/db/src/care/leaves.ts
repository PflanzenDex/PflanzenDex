import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces of the leaf log in `core` (structurally equal; `db` does not import `core`).
export interface LeafRow {
  readonly id: string;
  readonly specimenId: string;
  readonly date: string;
  readonly lengthMm: number | null;
  readonly widthMm: number | null;
  readonly note: string | null;
  readonly createdAt: string;
}
export type LeafValues = Omit<LeafRow, "id" | "createdAt">;

// `date` comes back as text (the driver would build a `Date` in the server's time zone, NFR-08). `createdAt` is a
// fixed-width UTC timestamp, so the order of the text is the order of the moments (ties on one date, US-WAC-07).
const COLUMNS = `id, specimen_id as "specimenId", to_char(date, 'YYYY-MM-DD') as date,
  length_mm as "lengthMm", width_mm as "widthMm", note,
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "createdAt"`;

const FOREIGN_KEY = "23503";

/**
 * Adapter for the leaf log (US-WAC-07); every call runs as the account of the caller under the row rules (P-04). The plant
 * hangs on the own account through the composite foreign key (account_id, specimen_id): a plant of another account is
 * unknown to the database, even if someone guesses its ID.
 */
export class LeavesPostgres {
  constructor(private readonly pool: Pool) {}

  /** Newest first: by date, with the same date the leaf created last. */
  async list(userId: string, specimenId: string): Promise<readonly LeafRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<LeafRow>(
        `select ${COLUMNS} from leaf where specimen_id = $1 order by date desc, created_at desc, id`,
        [specimenId],
      ),
    );
    return r.rows;
  }

  /** One statement: all or nothing. A plant of another account counts as unknown and writes nothing. */
  async create(userId: string, w: LeafValues): Promise<LeafRow | "specimen_unknown"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<LeafRow>(
          `insert into leaf (account_id, specimen_id, date, length_mm, width_mm, note)
           values ($1, $2, $3, $4, $5, $6) returning ${COLUMNS}`,
          [userId, w.specimenId, w.date, w.lengthMm, w.widthMm, w.note],
        ),
      );
      return r.rows[0] as LeafRow;
    } catch (e) {
      const f = e as { code?: string; constraint?: string };
      if (f.code === FOREIGN_KEY && f.constraint === "leaf_specimen") return "specimen_unknown";
      throw e;
    }
  }

  /** Deletes the leaf of that plant; the row rules hide a foreign leaf, then nothing is deleted and the answer is `false` (P-04). */
  async remove(userId: string, specimenId: string, leafId: string): Promise<boolean> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query("delete from leaf where id = $1 and specimen_id = $2", [leafId, specimenId]),
    );
    return r.rowCount === 1;
  }
}
