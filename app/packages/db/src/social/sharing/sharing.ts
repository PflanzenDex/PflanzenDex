import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

// Same shape as the interface SharingStore in `core` (structurally equal; `db` does not import `core`).
export interface SharingRow {
  readonly specimenId: string;
  readonly photos: boolean;
}

export interface SharingRowSince extends SharingRow {
  /** UTC instant (ISO 8601): when the specimen became visible to the caller. */
  readonly visibleSince: string;
}

/**
 * Adapter for the sharing settings (US-SOZ-04). Every call runs as the account of the caller (P-04): the rows of the
 * own account through the normal row rule, the rows of a friend only through `friend_shares()`, which checks the
 * confirmed friendship in the database. The composite foreign key keeps a row from pointing at a foreign specimen.
 */
export class SharingPostgres {
  constructor(private readonly pool: Pool) {}

  async set(userId: string, specimenId: string, shared: boolean, photos: boolean): Promise<void> {
    await this.setMany(userId, [specimenId], shared, photos);
  }

  async setMany(
    userId: string,
    specimenIds: readonly string[],
    shared: boolean,
    photos: boolean,
  ): Promise<void> {
    await withAccount(this.pool, userId, async (c) => {
      if (shared)
        await c.query(
          `insert into sharing (account_id, specimen_id, share_photos)
           select $1, id, $3 from unnest($2::uuid[]) as id
           on conflict (account_id, specimen_id) do update set share_photos = excluded.share_photos`,
          [userId, specimenIds, photos],
        );
      else await c.query("delete from sharing where specimen_id = any($1::uuid[])", [specimenIds]);
    });
  }

  async list(userId: string): Promise<readonly SharingRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SharingRow>(
        `select specimen_id as "specimenId", share_photos as photos from sharing order by created_at, specimen_id`,
      ),
    );
    return r.rows;
  }

  async sharedBy(userId: string, ownerId: string): Promise<readonly SharingRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SharingRow>(
        `select specimen_id as "specimenId", share_photos as photos from friend_shares($1)`,
        [ownerId],
      ),
    );
    return r.rows;
  }

  /** What `ownerId` shares with the caller, with the instant each specimen became visible (US-SOZ-06); empty without a confirmed friendship. */
  async sharedBySince(userId: string, ownerId: string): Promise<readonly SharingRowSince[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SharingRowSince>(
        `select specimen_id as "specimenId", share_photos as photos,
                to_char(visible_since at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "visibleSince"
           from friend_shares_since($1)`,
        [ownerId],
      ),
    );
    return r.rows;
  }
}
