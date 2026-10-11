import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { EquipmentRow, EquipmentStatus, EquipmentValues } from "@pflanzendex/core";
export type { EquipmentRow, EquipmentStatus, EquipmentValues };

const UNIQUE = "23505";

// Dates leave as text `YYYY-MM-DD` (NFR-08), the price as a number.
const COLUMNS = `id, type, name, status, manufacturer, model, product_id as "productId",
  price_eur::float8 as "priceEur", to_char(bought_at, 'YYYY-MM-DD') as "boughtAt", note`;

/** Adapter for equipment; every call runs as the account of the caller under the row rules (P-04, P-05). */
export class EquipmentPostgres {
  constructor(private readonly pool: Pool) {}

  async list(userId: string): Promise<readonly EquipmentRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<EquipmentRow>(`select ${COLUMNS} from equipment order by lower(name)`),
    );
    return r.rows;
  }

  async create(
    userId: string,
    v: EquipmentValues,
    status: EquipmentStatus | null,
  ): Promise<EquipmentRow | "name_taken"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<EquipmentRow>(
          `insert into equipment (account_id, type, name, status, manufacturer, model, product_id, price_eur, bought_at, note)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10) returning ${COLUMNS}`,
          [
            userId,
            v.type,
            v.name,
            status,
            v.manufacturer,
            v.model,
            v.productId,
            v.priceEur,
            v.boughtAt,
            v.note,
          ],
        ),
      );
      return r.rows[0] as EquipmentRow;
    } catch (e) {
      if ((e as { code?: string }).code === UNIQUE) return "name_taken";
      throw e;
    }
  }
}
