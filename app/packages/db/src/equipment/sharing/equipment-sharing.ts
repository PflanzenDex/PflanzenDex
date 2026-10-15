import type { Pool } from "pg";
import { withAccount } from "../../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface EquipmentSharingRow {
  readonly equipmentId: string;
  readonly note: string | null;
}

export interface SharedDeviceRow {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly model: string | null;
  readonly luxCeiling: number | null;
  readonly note: string | null;
}

/**
 * Adapter for the sharing settings of equipment (US-EQU-12). Every call runs as the account of the caller (P-04): the
 * own rows through the normal row rule, the rows of a friend only through `friend_equipment()`, which checks the
 * confirmed friendship in the database and returns the whitelist only. The setting lives on the equipment row itself.
 */
export class EquipmentSharingPostgres {
  constructor(private readonly pool: Pool) {}

  /** Shares (`note` may be `null`) or withdraws one piece of equipment, clearing the note; `not_found`: not equipment of the caller (P-04). */
  async set(
    userId: string,
    equipmentId: string,
    shared: boolean,
    note: string | null,
  ): Promise<"ok" | "not_found"> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query("update equipment set shared = $2, share_note = $3 where id = $1", [
        equipmentId,
        shared,
        shared ? note : null,
      ]),
    );
    return r.rowCount === 1 ? "ok" : "not_found";
  }

  /** The own settings of the shared equipment; everything else is private. */
  async list(userId: string): Promise<readonly EquipmentSharingRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<EquipmentSharingRow>(
        `select id as "equipmentId", share_note as note from equipment where shared order by lower(name), id`,
      ),
    );
    return r.rows;
  }

  /** What `ownerId` shares with the caller; empty without a confirmed friendship. */
  async sharedBy(userId: string, ownerId: string): Promise<readonly SharedDeviceRow[]> {
    const r = await withAccount(this.pool, userId, (c) =>
      c.query<SharedDeviceRow>(
        `select equipment_id as id, type, name, model, lux_ceiling as "luxCeiling", note from friend_equipment($1)`,
        [ownerId],
      ),
    );
    return r.rows;
  }
}
