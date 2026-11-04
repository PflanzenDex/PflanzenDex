import type { Pool, PoolClient } from "pg";
import { withAccount } from "../kernel/index.ts";

// The shapes are the types of `core` (type-only import through its public entry, AB-2).
import type { WishChange, WishPurchase, WishRow, WishValues } from "@pflanzendex/core";
export type { WishChange, WishPurchase, WishRow, WishValues };

export const COLUMNS = `id, name, german, target_zone_id as "targetZoneId", difficulty, reasoning, image_url as "imageUrl",
  image_source as "imageSource", license, image_object as "imageObject", type, status, specimen_id as "specimenId"`;

/** The plant wish with the ID as the row rules show it to the account; `undefined` when there is none (or it is foreign). */
export async function findWish(c: PoolClient, wishId: string): Promise<WishRow | undefined> {
  const r = await c.query<WishRow>(`select ${COLUMNS} from wish where id = $1 and type = 'plant'`, [
    wishId,
  ]);
  return r.rows[0];
}

/**
 * Whether the account holds an open or bought plant wish: the rows of `open` and `bought` together, answered by one
 * `exists` on the same rows (NFR-12, US-ONB-05). The row rules apply as for the lists; runs as the account of the
 * caller (P-04). A function beside the rows, because `WishesPostgres` is at the file size limit.
 */
export async function hasOpenOrBoughtWish(pool: Pool, userId: string): Promise<boolean> {
  const r = await withAccount(pool, userId, (c) =>
    c.query<{ found: boolean }>(
      `select exists(select 1 from wish where type = 'plant' and status in ('wishlist', 'bought')) as found`,
    ),
  );
  return r.rows[0]?.found === true;
}
