import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";
import { COLUMNS, findWish, type WishChange, type WishRow } from "./wish-row.ts";

const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

/**
 * Sets an open wish to `discarded` (US-WUN-05); the row is kept (P-10). A discarded wish is returned unchanged; a bought
 * one is `not_open`; a wish the row rules hide (another account) is `not_found`.
 */
export async function discardWish(
  pool: Pool,
  userId: string,
  wishId: string,
): Promise<WishChange | "not_found" | "not_open"> {
  return withAccount(pool, userId, async (c) => {
    const changed = await c.query<WishRow>(
      `update wish set status = 'discarded' where id = $1 and type = 'plant' and status = 'wishlist' returning ${COLUMNS}`,
      [wishId],
    );
    if (changed.rows[0]) return { wish: changed.rows[0], changed: true };
    const wish = await findWish(c, wishId);
    if (!wish) return "not_found";
    return wish.status === "discarded" ? { wish, changed: false } : "not_open";
  });
}

/** Discarded plant wishes, by name; the row rules show only the own ones. */
export async function discardedWishes(pool: Pool, userId: string): Promise<readonly WishRow[]> {
  const r = await withAccount(pool, userId, (c) =>
    c.query<WishRow>(
      `select ${COLUMNS} from wish where status = 'discarded' and type = 'plant' order by lower(name), id`,
    ),
  );
  return r.rows;
}

/**
 * Links a bought wish to its specimen (US-WUN-05) in one statement that only touches a bought wish without a link, so
 * two calls cannot both win. The composite foreign key keeps the specimen inside the account (`specimen_unknown`);
 * the unique index keeps a specimen with one wish (`already_linked`).
 */
export async function linkWish(
  pool: Pool,
  userId: string,
  wishId: string,
  specimenId: string,
): Promise<WishChange | "not_found" | "not_bought" | "specimen_unknown" | "already_linked"> {
  try {
    return await withAccount(pool, userId, async (c) => {
      const changed = await c.query<WishRow>(
        `update wish set specimen_id = $2 where id = $1 and type = 'plant' and status = 'bought' and specimen_id is null returning ${COLUMNS}`,
        [wishId, specimenId],
      );
      if (changed.rows[0]) return { wish: changed.rows[0], changed: true };
      const wish = await findWish(c, wishId);
      if (!wish) return "not_found";
      if (wish.status !== "bought") return "not_bought";
      return wish.specimenId === specimenId ? { wish, changed: false } : "already_linked";
    });
  } catch (e) {
    const f = e as { code?: string; constraint?: string };
    if (f.code === FOREIGN_KEY && f.constraint === "wish_specimen") return "specimen_unknown";
    if (f.code === UNIQUE && f.constraint === "wish_specimen_once") return "already_linked";
    throw e;
  }
}
