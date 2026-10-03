import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface LightZone {
  readonly id: string;
  readonly name: string;
  readonly luxCeiling: number;
  readonly ppfd: number | null;
  readonly sortOrder: number;
}
export interface ZoneValues {
  readonly name: string;
  readonly luxCeiling: number;
  readonly ppfd: number | null;
  readonly sortOrder: number | null;
}

const COLUMNS = `id, name, lux_ceiling as "luxCeiling", ppfd, sort_order as "sortOrder"`;
/** PostgreSQL error codes: unique violation, foreign key violation. */
export const UNIQUE = "23505";
export const FOREIGN_KEY = "23503";

export const errorCode = (e: unknown): string | undefined => (e as { code?: string }).code;

/** Adapter for light zones; every call runs as the caller's account under the row rules (P-04). */
export class ZonePostgres {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly LightZone[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<LightZone>(`select ${COLUMNS} from light_zone order by sort_order, lower(name)`),
    );
    return r.rows;
  }

  async create(userId: string, w: ZoneValues): Promise<LightZone | "name_taken"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<LightZone>(
          `insert into light_zone (account_id, name, lux_ceiling, ppfd, sort_order)
           values ($1, $2, $3, $4, coalesce($5, (select least(coalesce(max(sort_order), 0) + 1, 999) from light_zone)))
           returning ${COLUMNS}`,
          [userId, w.name, w.luxCeiling, w.ppfd, w.sortOrder],
        ),
      );
      return r.rows[0] as LightZone;
    } catch (e) {
      if (errorCode(e) === UNIQUE) return "name_taken";
      throw e;
    }
  }

  async update(
    userId: string,
    id: string,
    w: ZoneValues,
  ): Promise<LightZone | "name_taken" | "not_found"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<LightZone>(
          `update light_zone set name = $2, lux_ceiling = $3, ppfd = $4, sort_order = coalesce($5, sort_order)
           where id = $1 returning ${COLUMNS}`,
          [id, w.name, w.luxCeiling, w.ppfd, w.sortOrder],
        ),
      );
      return r.rows[0] ?? "not_found";
    } catch (e) {
      if (errorCode(e) === UNIQUE) return "name_taken";
      throw e;
    }
  }

  /** The foreign key of `location` is the fallback in case a usage arose between check and delete. */
  async remove(userId: string, id: string): Promise<"deleted" | "not_found" | "in_use"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query("delete from light_zone where id = $1", [id]),
      );
      return r.rowCount === 1 ? "deleted" : "not_found";
    } catch (e) {
      if (errorCode(e) === FOREIGN_KEY) return "in_use";
      throw e;
    }
  }
}
