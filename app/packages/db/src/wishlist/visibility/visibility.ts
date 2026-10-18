import type { Pool } from "pg";
import type { WishVisibilityChange } from "@pflanzendex/core";
import { withAccount } from "../../kernel/index.ts";

/**
 * Adapter for the wish flag `visible_to_friends` (DM-TAU-02). Setting and listing run as the owner under the row rules
 * (P-04, P-05). What a friend may learn goes only through the function `friend_wants(keys)`: per confirmed friend, only
 * the passed species keys that the friend deliberately marked, never the list (FR-WUN-07).
 */
export class WishVisibilityPostgres {
  constructor(private readonly pool: Pool) {}

  /** `not_found`: no plant wish the row rules show; `not_open`: the flag is set only on an open wish, taking it back always works. */
  async set(
    userId: string,
    wishId: string,
    visible: boolean,
  ): Promise<WishVisibilityChange | "not_found" | "not_open"> {
    return withAccount(this.pool, userId, async (c) => {
      const changed = await c.query(
        `update wish set visible_to_friends = $2
          where id = $1 and type = 'plant' and visible_to_friends <> $2 and (not $2 or status = 'wishlist')
          returning id`,
        [wishId, visible],
      );
      if (changed.rows[0]) return { wishId, visible, changed: true };
      const wish = await c.query<{ status: string; visible: boolean }>(
        `select status, visible_to_friends as visible from wish where id = $1 and type = 'plant'`,
        [wishId],
      );
      const row = wish.rows[0];
      if (!row) return "not_found";
      if (visible && row.status !== "wishlist") return "not_open";
      return { wishId, visible, changed: false };
    });
  }

  /** The IDs of the own open plant wishes with the flag, oldest first. */
  async flagged(userId: string): Promise<readonly string[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ id: string }>(
        `select id from wish where visible_to_friends and type = 'plant' and status = 'wishlist' order by created_at, id`,
      ),
    );
    return r.rows.map((x) => x.id);
  }

  /** Which of the folded species names `keys` confirmed friends want and deliberately showed; owner ID to keys. */
  async friendWants(
    userId: string,
    keys: readonly string[],
  ): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
    if (keys.length === 0) return new Map();
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<{ ownerId: string; key: string }>(
        `select owner_id as "ownerId", name_key as key from friend_wants($1::text[])`,
        [[...keys]],
      ),
    );
    const out = new Map<string, Set<string>>();
    for (const row of r.rows)
      out.set(row.ownerId, (out.get(row.ownerId) ?? new Set()).add(row.key));
    return out;
  }
}
