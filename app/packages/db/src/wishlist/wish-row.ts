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
 * Inserts a wish of the account. A Discover Yes or No (`lastDecision`, US-ENT-04) first moves the mark of the account's
 * last decision away from its earlier wish, under a lock per account, so two decisions at once cannot both hold it. A
 * refused insert (name taken) rolls the move back with the transaction, since the caller runs it in one.
 */
export async function insertWish(c: PoolClient, userId: string, v: WishValues) {
  if (v.lastDecision !== undefined) {
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [`wish-last-decision:${userId}`]);
    await c.query(
      "update wish set last_decision = null where account_id = $1 and last_decision is not null",
      [userId],
    );
  }
  return c.query<WishRow>(
    `insert into wish (account_id, name, german, target_zone_id, difficulty, reasoning, image_url, image_source, license, name_key, source, decided_at, status, last_decision)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning ${COLUMNS}`,
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
      v.lastDecision ?? null,
    ],
  );
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
