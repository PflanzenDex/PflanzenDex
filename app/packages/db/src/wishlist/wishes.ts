import type { Pool, PoolClient } from "pg";
import { withAccount } from "../kernel/index.ts";
import {
  COLUMNS,
  findWish,
  type WishChange,
  type WishPurchase,
  type WishRow,
  type WishValues,
} from "./wish-row.ts";
import { discardedWishes, discardWish, linkWish } from "./wish-outcome.ts";

export type { WishChange, WishPurchase, WishRow, WishValues } from "./wish-row.ts";

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
          `insert into wish (account_id, name, german, target_zone_id, difficulty, reasoning, image_url, image_source, license, name_key, source, decided_at, status)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning ${COLUMNS}`,
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
            v.source ?? "manual",
            v.decidedAt ?? null,
            v.status ?? "wishlist",
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

  /** One wish of the account; the row rules hide a foreign one (P-04). */
  async find(userId: string, wishId: string): Promise<WishRow | null> {
    return (await withAccount(this.pool, userId, (c) => findWish(c, wishId))) ?? null;
  }

  /** Records the stored copy with its verified source and license (US-WUN-04); `null` if the wish is not the account's. */
  async setImage(
    userId: string,
    wishId: string,
    image: { object: string; source: string; license: string },
  ): Promise<WishRow | null> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<WishRow>(
        `update wish set image_object = $2, image_source = $3, license = $4
         where id = $1 and type = 'plant' returning ${COLUMNS}`,
        [wishId, image.object, image.source, image.license],
      ),
    );
    return r.rows[0] ?? null;
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
      const wish = await findWish(c, wishId);
      if (!wish) return "not_found";
      return wish.status === "bought" ? { wish, changed: false } : "not_open";
    });
  }

  /** Sets an open wish to `discarded` (US-WUN-05); see `discardWish`. */
  discard(userId: string, wishId: string): Promise<WishChange | "not_found" | "not_open"> {
    return discardWish(this.pool, userId, wishId);
  }

  /** Discarded plant wishes, by name; the row rules show only the own ones. */
  discarded(userId: string): Promise<readonly WishRow[]> {
    return discardedWishes(this.pool, userId);
  }

  /** Links a bought wish to its specimen (US-WUN-05); see `linkWish`. */
  link(userId: string, wishId: string, specimenId: string) {
    return linkWish(this.pool, userId, wishId, specimenId);
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

  /**
   * Open plant wishes without a name key (FR-WUN-06, #303), oldest first: the ones migration 0020 left exempt from the
   * unique name rule. The row rules show only the own ones.
   */
  async keyless(userId: string): Promise<readonly WishRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<WishRow>(
        `select ${COLUMNS} from wish where name_key is null and status = 'wishlist' and type = 'plant' order by created_at, id`,
      ),
    );
    return r.rows;
  }

  /**
   * Renames a key-less wish and sets its key in one statement, so it leaves the exempt group. `not_duplicate`: the
   * wish has a key already (checked in the same statement, so a concurrent rename cannot slip through); a wish the
   * row rules hide is `not_found`; a taken name (key or old lower-case rule) is `name_taken`.
   */
  async rename(
    userId: string,
    wishId: string,
    name: string,
    nameKey: string,
  ): Promise<WishRow | "not_found" | "not_duplicate" | "name_taken"> {
    try {
      return await withAccount(this.pool, userId, async (c) => {
        const changed = await c.query<WishRow>(
          `update wish set name = $2, name_key = $3 where id = $1 and name_key is null returning ${COLUMNS}`,
          [wishId, name, nameKey],
        );
        return changed.rows[0] ?? (await this.missing(c, wishId));
      });
    } catch (e) {
      const f = e as { code?: string; constraint?: string };
      if (f.code === UNIQUE && (f.constraint === "wish_name" || f.constraint === "wish_name_key"))
        return "name_taken";
      throw e;
    }
  }

  /** Deletes a key-less wish and returns it; `not_found` / `not_duplicate` as for `rename`. */
  async remove(userId: string, wishId: string): Promise<WishRow | "not_found" | "not_duplicate"> {
    return withAccount(this.pool, userId, async (c) => {
      const gone = await c.query<WishRow>(
        `delete from wish where id = $1 and name_key is null returning ${COLUMNS}`,
        [wishId],
      );
      return gone.rows[0] ?? (await this.missing(c, wishId));
    });
  }

  /** Why an update or delete of a key-less wish touched nothing: it has a key already, or it is not visible. */
  private async missing(c: PoolClient, wishId: string): Promise<"not_found" | "not_duplicate"> {
    const seen = await c.query("select 1 from wish where id = $1", [wishId]);
    return seen.rowCount === 1 ? "not_duplicate" : "not_found";
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
