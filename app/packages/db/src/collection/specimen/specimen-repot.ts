import type { Pool, PoolClient } from "pg";
import { withAccount } from "../../kernel/index.ts";
import { COLUMNS, type SpecimenRow } from "../specimen-shared.ts";

/** The refusals of a repot, as the core names them (`specimen.repot`). */
export type RepotRefusal = "not_found" | "archived" | "before_caught" | "day_unknown";

/**
 * The repot of one specimen inside the open transaction of `c` (US-BES-04, US-BES-19), as the account the connection is
 * set to: the specimen row is locked, then a cutting becomes a plant with its repot day (a plant keeps its repot day),
 * the day is appended to the repot history and every open repot observation is cleared on it. A chosen day before the
 * catch date, an archived specimen and a plant without a day change nothing and answer the refusal. Foreign specimens are
 * invisible to the row rule and answer `not_found` (P-04). The caller opens and ends the transaction.
 */
export async function repotOn(
  c: PoolClient,
  userId: string,
  id: string,
  days: { readonly date: string | null; readonly chosenDate: string | null },
): Promise<SpecimenRow | RepotRefusal> {
  const found = await c.query<{ status: string; caughtAt: string | null }>(
    `select status, to_char(caught_at, 'YYYY-MM-DD') as "caughtAt" from specimen where id = $1 for update`,
    [id],
  );
  const row = found.rows[0];
  if (!row) return "not_found";
  if (row.status === "archived") return "archived";
  if (days.chosenDate !== null && row.caughtAt !== null && row.caughtAt > days.chosenDate)
    return "before_caught";
  if (row.status === "plant" && days.date === null) return "day_unknown";
  const updated = await c.query<SpecimenRow>(
    `update specimen set status = 'plant',
        repotted_at = case when status = 'cutting' then $2::date else repotted_at end
      where id = $1 returning ${COLUMNS}`,
    [id, days.date],
  );
  if (days.date !== null) {
    await c.query(
      `insert into repot (account_id, specimen_id, repotted_on) values ($1, $2, $3::date)`,
      [userId, id, days.date],
    );
    // A clearing never dates before its tick (the check of the table); the day is the repot day otherwise.
    await c.query(
      `update repot_sign set cleared_on = greatest(ticked_on, $2::date)
        where specimen_id = $1 and cleared_on is null`,
      [id, days.date],
    );
  }
  return updated.rows[0] as SpecimenRow;
}

/** One transaction as the account of `userId` (US-BES-04, US-BES-19); see `repotOn`. */
export async function repotSpecimen(
  pool: Pool,
  userId: string,
  id: string,
  days: { readonly date: string | null; readonly chosenDate: string | null },
): Promise<SpecimenRow | RepotRefusal> {
  return withAccount(pool, userId, (c) => repotOn(c, userId, id, days));
}
