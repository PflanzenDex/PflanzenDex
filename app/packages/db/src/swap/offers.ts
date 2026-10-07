import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export type OfferStatus = "open" | "reserved" | "handed_over" | "withdrawn";
export interface OfferRow {
  readonly id: string;
  readonly specimenId: string;
  readonly type: "cutting" | "plant" | "offshoot";
  readonly mode: "swap" | "give_away";
  readonly wish: string | null;
  readonly note: string | null;
  readonly status: OfferStatus;
  readonly createdAt: string;
}
export type OfferValues = Pick<OfferRow, "specimenId" | "type" | "mode" | "wish" | "note">;

const COLUMNS = `id, specimen_id as "specimenId", type, mode, wish, note, status,
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt"`;
const UNIQUE = "23505";

/**
 * Adapter for offers (US-SOZ-08). Every call runs as the account of the caller under the row rule (P-04): an offer of
 * another account does not exist for it. The database also holds the rule "one open offer per specimen".
 */
export class OffersPostgres {
  constructor(private readonly pool: Pool) {}

  /** `"already_open"` when the specimen has an open or reserved offer already. */
  async create(userId: string, v: OfferValues): Promise<OfferRow | "already_open"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<OfferRow>(
          `insert into offer (account_id, specimen_id, type, mode, wish, note) values ($1, $2, $3, $4, $5, $6)
           returning ${COLUMNS}`,
          [userId, v.specimenId, v.type, v.mode, v.wish, v.note],
        ),
      );
      return r.rows[0] as OfferRow;
    } catch (e) {
      if ((e as { code?: string }).code === UNIQUE) return "already_open";
      throw e;
    }
  }

  async find(userId: string, id: string): Promise<OfferRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<OfferRow>(`select ${COLUMNS} from offer where id = $1`, [id]),
    );
    return r.rows[0] ?? null;
  }

  /** The caller's offers, newest first. */
  async list(userId: string): Promise<readonly OfferRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<OfferRow>(`select ${COLUMNS} from offer order by created_at desc, id`),
    );
    return r.rows;
  }

  /**
   * Withdraws an open or reserved offer; `"not_found"` for an unknown or foreign id, `"not_active"` when it is handed over
   * already, and an offer that is withdrawn already answers with itself (nothing is written twice).
   */
  async withdraw(userId: string, id: string): Promise<OfferRow | "not_found" | "not_active"> {
    return withAccount(this.pool, userId, async (c) => {
      const found = await c.query<OfferRow>(
        `select ${COLUMNS} from offer where id = $1 for update`,
        [id],
      );
      const row = found.rows[0];
      if (!row) return "not_found";
      if (row.status === "withdrawn") return row;
      if (row.status === "handed_over") return "not_active";
      const r = await c.query<OfferRow>(
        `update offer set status = 'withdrawn', updated_at = now() where id = $1 returning ${COLUMNS}`,
        [id],
      );
      return r.rows[0] as OfferRow;
    });
  }
}
