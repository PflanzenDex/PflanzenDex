import type { Pool, PoolClient } from "pg";
import { withAccount } from "../kernel/index.ts";
import { specimenStatusesOn } from "../collection/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface PotRecord {
  readonly id: string;
  readonly name: string;
  readonly diameterCm: number | null;
}
export interface PlacementResult {
  readonly potId: string | null;
  readonly placedOn: string | null;
  readonly changed: boolean;
}
export type PlaceRefusal = "pot_not_found" | "pot_taken";

/** The open placement of a plant, if any: its pot and the day it started. */
async function openPlacement(
  c: PoolClient,
  specimenId: string,
): Promise<{ id: string; potId: string; placedOn: string } | null> {
  const r = await c.query<{ id: string; potId: string; placedOn: string }>(
    `select id, pot_id as "potId", to_char(placed_on, 'YYYY-MM-DD') as "placedOn"
       from pot_placement where specimen_id = $1 and left_on is null`,
    [specimenId],
  );
  return r.rows[0] ?? null;
}

/**
 * One placement inside the open transaction of `c` (US-BES-19, DM-EQU-06), as the account the connection is set to. The
 * pot is locked; it must be an active `Pot` of the account, and no plant that is not archived may hold it. The open
 * placement of the plant closes on `day`, the stale placements of archived plants in that pot close with it, and the new
 * one opens. Placing a plant into the pot it sits in already changes nothing. The plant itself is checked by the caller.
 */
export async function placePotOn(
  c: PoolClient,
  userId: string,
  target: { readonly specimenId: string; readonly potId: string | null; readonly day: string },
): Promise<PlacementResult | PlaceRefusal> {
  const { specimenId, potId, day } = target;
  if (potId !== null) {
    const pot = await c.query(
      `select id from equipment where id = $1 and type = 'Pot' and status = 'active' for update`,
      [potId],
    );
    if (!pot.rowCount) return "pot_not_found";
    const holders = await c.query<{ specimenId: string }>(
      `select specimen_id as "specimenId" from pot_placement
        where pot_id = $1 and left_on is null and specimen_id <> $2`,
      [potId, specimenId],
    );
    if (
      await anyActiveOn(
        c,
        holders.rows.map((h) => h.specimenId),
      )
    )
      return "pot_taken";
  }
  const open = await openPlacement(c, specimenId);
  if (open && open.potId === potId) return { potId, placedOn: open.placedOn, changed: false };
  if (!open && potId === null) return { potId: null, placedOn: null, changed: false };
  if (open)
    await c.query(
      `update pot_placement set left_on = greatest(placed_on, $2::date) where id = $1`,
      [open.id, day],
    );
  if (potId === null) return { potId: null, placedOn: null, changed: true };
  await c.query(
    `update pot_placement set left_on = greatest(placed_on, $2::date) where pot_id = $1 and left_on is null`,
    [potId, day],
  );
  await c.query(
    `insert into pot_placement (account_id, pot_id, specimen_id, placed_on) values ($1, $2, $3, $4::date)`,
    [userId, potId, specimenId, day],
  );
  return { potId, placedOn: day, changed: true };
}

/** The pot a plant sits in today; `null` when none is recorded (P-08). */
export async function currentPotOn(c: PoolClient, specimenId: string): Promise<PotRecord | null> {
  const r = await c.query<PotRecord>(
    `select e.id, e.name, e.diameter_cm::float8 as "diameterCm"
       from pot_placement p join equipment e on e.account_id = p.account_id and e.id = p.pot_id
      where p.specimen_id = $1 and p.left_on is null`,
    [specimenId],
  );
  return r.rows[0] ?? null;
}

/** Whether any of the plants is not archived (the status is read by the collection module, AB-9). */
async function anyActiveOn(c: PoolClient, specimenIds: readonly string[]): Promise<boolean> {
  const statuses = await specimenStatusesOn(c, specimenIds);
  return [...statuses.values()].some((status) => status !== "archived");
}

/** The active pots that no plant which is not archived holds, by name (US-BES-19). */
export async function freePotsOn(c: PoolClient): Promise<readonly PotRecord[]> {
  const pots = await c.query<PotRecord>(
    `select e.id, e.name, e.diameter_cm::float8 as "diameterCm" from equipment e
      where e.type = 'Pot' and e.status = 'active' order by lower(e.name)`,
  );
  const open = await c.query<{ potId: string; specimenId: string }>(
    `select pot_id as "potId", specimen_id as "specimenId" from pot_placement where left_on is null`,
  );
  const statuses = await specimenStatusesOn(c, [...new Set(open.rows.map((o) => o.specimenId))]);
  const held = new Set(
    open.rows
      .filter((o) => {
        const status = statuses.get(o.specimenId);
        return status !== undefined && status !== "archived";
      })
      .map((o) => o.potId),
  );
  return pots.rows.filter((pot) => !held.has(pot.id));
}

/**
 * Adapter for the pot placements (US-BES-19, DM-EQU-06); every call runs as the account of the caller under the row rules
 * (P-04). The plant and the pot hang on the own account through composite foreign keys.
 */
export class PotPlacementPostgres {
  constructor(private readonly pool: Pool) {}

  place(
    userId: string,
    specimenId: string,
    potId: string | null,
    day: string,
  ): Promise<PlacementResult | PlaceRefusal> {
    return withAccount(this.pool, userId, (c) => placePotOn(c, userId, { specimenId, potId, day }));
  }

  currentPot(userId: string, specimenId: string): Promise<PotRecord | null> {
    return withAccount(this.pool, userId, (c) => currentPotOn(c, specimenId));
  }

  freePots(userId: string): Promise<readonly PotRecord[]> {
    return withAccount(this.pool, userId, (c) => freePotsOn(c));
  }
}
