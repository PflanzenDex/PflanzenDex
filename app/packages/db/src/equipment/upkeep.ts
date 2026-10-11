import type { Pool, PoolClient } from "pg";
import type { ChangeResult, EquipmentRow, MaintenanceData, SupplyLevel } from "@pflanzendex/core";
import { withAccount } from "../kernel/index.ts";
import { COLUMNS } from "./columns.ts";

// Writes on one record that only apply to a device or a consumable (US-EQU-04, US-EQU-05): an update that finds
// nothing says whether the record is unknown or of the wrong kind (a record of another account looks unknown, P-04).

/** Why an update found nothing: no such record, or one of the wrong kind. */
async function missing<R extends string>(
  c: PoolClient,
  id: string,
  wrong: R,
): Promise<R | "not_found"> {
  const known = await c.query("select 1 from equipment where id = $1", [id]);
  return known.rowCount ? wrong : "not_found";
}

/** One update: the statement (with `$1` as the id), its further parameters and the kind the record must be of. */
interface Update<R extends string> {
  readonly wrong: R;
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** Runs one update and answers the changed row, or why nothing changed. */
async function change<R extends string>(
  pool: Pool,
  userId: string,
  id: string,
  u: Update<R>,
): Promise<ChangeResult<R>> {
  return withAccount(pool, userId, async (c) => {
    const changed = await c.query<EquipmentRow>(`${u.sql} returning ${COLUMNS}`, [id, ...u.params]);
    return changed.rows[0] ?? (await missing(c, id, u.wrong));
  });
}

/** Sets the operation data of a device; `null` clears a value back to unknown. */
export const setMaintenance = (pool: Pool, userId: string, id: string, d: MaintenanceData) =>
  change(pool, userId, id, {
    wrong: "consumable",
    sql: `update equipment set in_operation_since = $2::date, check_interval_days = $3, lifetime_value = $4,
       lifetime_source = $5 where id = $1 and status is not null`,
    params: [d.inOperationSince, d.checkIntervalDays, d.lifetimeValue, d.lifetimeSource],
  });

/** Notes the date the keeper checked a device. */
export const markChecked = (pool: Pool, userId: string, id: string, checkedOn: string) =>
  change(pool, userId, id, {
    wrong: "consumable",
    sql: "update equipment set last_checked_on = $2::date where id = $1 and status is not null",
    params: [checkedOn],
  });

/** Sets the supply of a consumable; a device has none. */
export const setSupply = (pool: Pool, userId: string, id: string, supply: SupplyLevel) =>
  change(pool, userId, id, {
    wrong: "not_consumable",
    sql: "update equipment set supply = $2 where id = $1 and status is null",
    params: [supply],
  });

/** Links a plant agent to the text of `Treatment.Agent`; `null` removes the link. */
export const setAgentLink = (pool: Pool, userId: string, id: string, agentLink: string | null) =>
  change(pool, userId, id, {
    wrong: "not_plant_agent",
    sql: "update equipment set agent_link = $2 where id = $1 and type = 'Plant agent'",
    params: [agentLink],
  });
