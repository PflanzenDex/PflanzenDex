import type { Pool, PoolClient } from "pg";
import { withAccount } from "../../kernel/index.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { EquipmentWishChange, EquipmentWishRow, EquipmentWishValues } from "@pflanzendex/core";

const UNIQUE = "23505";

const COLUMNS = `id, name, equipment_type as "equipmentType", product_id as "productId",
  price_eur::float8 as "priceEur", status`;

/**
 * Adapter for the wishes of type equipment (US-EQU-08); every call runs as the account of the caller under the row
 * rules (P-04, P-05). They share the table `wish` with the plant wishes, but every query here filters on
 * `type = 'equipment'` and every plant query on `type = 'plant'`: the two never mix. The name is unique among all
 * wishes of the account (FR-WUN-06).
 */
export class EquipmentWishesPostgres {
  constructor(private readonly pool: Pool) {}

  async create(userId: string, v: EquipmentWishValues): Promise<EquipmentWishRow | "name_taken"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<EquipmentWishRow>(
          `insert into wish (account_id, name, name_key, type, equipment_type, product_id, price_eur)
           values ($1, $2, $3, 'equipment', $4, $5, $6) returning ${COLUMNS}`,
          [userId, v.name, v.nameKey, v.equipmentType, v.productId, v.priceEur],
        ),
      );
      return r.rows[0] as EquipmentWishRow;
    } catch (e) {
      const f = e as { code?: string; constraint?: string };
      if (f.code === UNIQUE && (f.constraint === "wish_name" || f.constraint === "wish_name_key"))
        return "name_taken";
      throw e;
    }
  }

  async list(userId: string): Promise<readonly EquipmentWishRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<EquipmentWishRow>(
        `select ${COLUMNS} from wish where type = 'equipment'
         order by (status = 'wishlist') desc, case when status = 'wishlist' then created_at end, lower(name), id`,
      ),
    );
    return r.rows;
  }

  buy(userId: string, wishId: string) {
    return this.change(userId, wishId, "bought");
  }

  discard(userId: string, wishId: string) {
    return this.change(userId, wishId, "discarded");
  }

  /**
   * Sets an open equipment wish to `to` in one statement; a second call (also a concurrent one) finds no open wish and
   * returns the wish with `changed: false` when it has that status already. The row rules hide a foreign wish.
   */
  private async change(
    userId: string,
    wishId: string,
    to: "bought" | "discarded",
  ): Promise<EquipmentWishChange | "not_found" | "not_open"> {
    return withAccount(this.pool, userId, async (c: PoolClient) => {
      const changed = await c.query<EquipmentWishRow>(
        `update wish set status = $2 where id = $1 and type = 'equipment' and status = 'wishlist' returning ${COLUMNS}`,
        [wishId, to],
      );
      if (changed.rows[0]) return { wish: changed.rows[0], changed: true };
      const seen = await c.query<EquipmentWishRow>(
        `select ${COLUMNS} from wish where id = $1 and type = 'equipment'`,
        [wishId],
      );
      const wish = seen.rows[0];
      if (!wish) return "not_found";
      return wish.status === to ? { wish, changed: false } : "not_open";
    });
  }
}
