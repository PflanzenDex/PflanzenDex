import type { PoolClient } from "pg";

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
