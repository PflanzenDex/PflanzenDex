import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface MeasurementRow {
  readonly id: string;
  readonly specimenId: string;
  readonly date: string;
  readonly value: number;
  readonly quality: "healthy" | "etiolated";
  readonly note: string | null;
  readonly ratedBy: "keeper" | "ai_adopted";
  readonly photo: string | null;
}
export type MeasurementValues = Omit<MeasurementRow, "id" | "photo">;

// `date` comes back as text (the driver would build a `Date` in the server's time zone, NFR-08) and
// `numeric` as a number instead of text.
const COLUMNS = `id, specimen_id as "specimenId", to_char(date, 'YYYY-MM-DD') as date, value::float8 as value,
  quality, note, rated_by as "ratedBy", photo`;

const FOREIGN_KEY = "23503";

/**
 * Adapter for measurements; every call runs as the account of the caller under the row rules (P-04). The specimen hangs
 * on the own account through the composite foreign key (account_id, specimen_id): the specimen of another account is
 * unknown to the database, even if someone guesses its ID.
 */
export class MeasurementsPostgres {
  constructor(private readonly pool: Pool) {}

  /** Newest first: by date, with the same date the one recorded last. */
  async list(userId: string, specimenId: string): Promise<readonly MeasurementRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<MeasurementRow>(
        `select ${COLUMNS} from measurement where specimen_id = $1 order by date desc, created_at desc, id`,
        [specimenId],
      ),
    );
    return r.rows;
  }

  /**
   * The latest measurement per specimen (date, with the same date the one recorded last); one query for all IDs.
   * Foreign IDs return nothing: the row rules of the account hide them (P-04).
   */
  async lastFor(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, MeasurementRow>> {
    if (specimenIds.length === 0) return new Map();
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<MeasurementRow>(
        `select distinct on (specimen_id) ${COLUMNS} from measurement where specimen_id = any($1)
         order by specimen_id, date desc, created_at desc, id`,
        [specimenIds],
      ),
    );
    return new Map(r.rows.map((z) => [z.specimenId, z]));
  }

  /** The measurement of the specimen on that local date; with several the one recorded last (FR-WAC-07). */
  async findOnDate(
    userId: string,
    specimenId: string,
    date: string,
  ): Promise<MeasurementRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<MeasurementRow>(
        `select ${COLUMNS} from measurement where specimen_id = $1 and date = $2
         order by created_at desc, id limit 1`,
        [specimenId, date],
      ),
    );
    return r.rows[0] ?? null;
  }

  /** The row rules hide a foreign measurement: then nothing is updated and the answer is `false` (P-04). */
  async setPhoto(userId: string, measurementId: string, photo: string): Promise<boolean> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query("update measurement set photo = $2 where id = $1", [measurementId, photo]),
    );
    return r.rowCount === 1;
  }

  /** One statement: all or nothing. */
  async create(userId: string, w: MeasurementValues): Promise<MeasurementRow | "specimen_unknown"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<MeasurementRow>(
          `insert into measurement (account_id, specimen_id, date, value, quality, note, rated_by)
           values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUMNS}`,
          [userId, w.specimenId, w.date, w.value, w.quality, w.note, w.ratedBy],
        ),
      );
      return r.rows[0] as MeasurementRow;
    } catch (e) {
      const f = e as { code?: string; constraint?: string };
      if (f.code === FOREIGN_KEY && f.constraint === "measurement_specimen")
        return "specimen_unknown";
      throw e;
    }
  }
}
