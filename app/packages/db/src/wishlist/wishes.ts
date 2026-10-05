import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface WishRow {
  readonly id: string;
  readonly name: string;
  readonly german: string | null;
  readonly targetZoneId: string | null;
  readonly difficulty: number | null;
  readonly reasoning: string | null;
  readonly imageUrl: string | null;
  readonly imageSource: string | null;
  readonly license: string | null;
  readonly type: "plant";
  readonly status: "wishlist" | "bought" | "discarded";
}
export type WishValues = Omit<WishRow, "id" | "type" | "status"> & { readonly nameKey: string };
export interface WishPurchase {
  readonly wish: WishRow;
  readonly changed: boolean;
}

const COLUMNS = `id, name, german, target_zone_id as "targetZoneId", difficulty, reasoning, image_url as "imageUrl",
  image_source as "imageSource", license, type, status`;

const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

/**
 * Adapter for wishes; every call runs as the account of the caller under the row rules (P-04, P-05). The target zone
 * hangs on the own account through the composite foreign key (account_id, target_zone_id): the zone of another
 * account is unknown to the database, even if someone guesses its ID.
 */
export class WishesPostgres {
  constructor(private readonly pool: Pool) {}

  async create(userId: string, v: WishValues): Promise<WishRow | "name_taken" | "zone_unknown"> {
    try {
      const r = await withAccount(this.pool, userId, (c) =>
        c.query<WishRow>(
          `insert into wish (account_id, name, german, target_zone_id, difficulty, reasoning, image_url, image_source, license, name_key)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning ${COLUMNS}`,
          [
            userId,
            v.name,
            v.german,
            v.targetZoneId,
            v.difficulty,
            v.reasoning,
            v.imageUrl,
            v.imageSource,
            v.license,
            v.nameKey,
          ],
        ),
      );
      return r.rows[0] as WishRow;
    } catch (e) {
      const f = e as { code?: string; constraint?: string };
      if (f.code === UNIQUE && (f.constraint === "wish_name" || f.constraint === "wish_name_key"))
        return "name_taken";
      if (f.code === FOREIGN_KEY && f.constraint === "wish_target_zone") return "zone_unknown";
      throw e;
    }
  }

  /** Open plant wishes (FR-WUN-02), oldest first; the row rules show only the own ones. */
  async open(userId: string): Promise<readonly WishRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<WishRow>(
        `select ${COLUMNS} from wish where status = 'wishlist' and type = 'plant' order by created_at, id`,
      ),
    );
    return r.rows;
  }

  /**
   * "Bought" (US-WUN-03) in one transaction: only an open plant wish changes. A second call (also a concurrent one,
   * which waits for the row lock and then finds no open wish) returns the bought wish with `changed: false`; a
   * discarded wish is `not_open`; a wish the row rules hide (another account) is `not_found`, like an unknown one.
   */
  async buy(userId: string, wishId: string): Promise<WishPurchase | "not_found" | "not_open"> {
    return withAccount(this.pool, userId, async (c) => {
      const changed = await c.query<WishRow>(
        `update wish set status = 'bought' where id = $1 and type = 'plant' and status = 'wishlist' returning ${COLUMNS}`,
        [wishId],
      );
      if (changed.rows[0]) return { wish: changed.rows[0], changed: true };
      const now = await c.query<WishRow>(
        `select ${COLUMNS} from wish where id = $1 and type = 'plant'`,
        [wishId],
      );
      const wish = now.rows[0];
      if (!wish) return "not_found";
      return wish.status === "bought" ? { wish, changed: false } : "not_open";
    });
  }

  /** Bought plant wishes (the history of US-WUN-03), by name; the row rules show only the own ones. */
  async bought(userId: string): Promise<readonly WishRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<WishRow>(
        `select ${COLUMNS} from wish where status = 'bought' and type = 'plant' order by lower(name), id`,
      ),
    );
    return r.rows;
  }

  /** Wishes of any status that point at the zone, by name. */
  async usingZone(userId: string, zoneId: string): Promise<readonly WishRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<WishRow>(
        `select ${COLUMNS} from wish where target_zone_id = $1 order by lower(name), id`,
        [zoneId],
      ),
    );
    return r.rows;
  }
}
