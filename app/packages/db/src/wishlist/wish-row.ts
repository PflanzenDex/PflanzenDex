import type { PoolClient } from "pg";

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
  readonly specimenId: string | null;
}
export type WishValues = Omit<WishRow, "id" | "type" | "status" | "specimenId"> & {
  readonly nameKey: string;
};
export interface WishChange {
  readonly wish: WishRow;
  readonly changed: boolean;
}
export type WishPurchase = WishChange;

export const COLUMNS = `id, name, german, target_zone_id as "targetZoneId", difficulty, reasoning, image_url as "imageUrl",
  image_source as "imageSource", license, type, status, specimen_id as "specimenId"`;

/** The plant wish with the ID as the row rules show it to the account; `undefined` when there is none (or it is foreign). */
export async function findWish(c: PoolClient, wishId: string): Promise<WishRow | undefined> {
  const r = await c.query<WishRow>(`select ${COLUMNS} from wish where id = $1 and type = 'plant'`, [
    wishId,
  ]);
  return r.rows[0];
}
