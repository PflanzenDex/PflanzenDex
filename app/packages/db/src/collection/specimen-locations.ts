import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";
import { COLUMNS, FOREIGN_KEY, pgError, type SpecimenRow } from "./specimen-shared.ts";

/** A specimen was refused: the transaction is undone and the reason goes back to the caller. */
class Refused extends Error {
  constructor(readonly reason: "archived" | "specimen_unknown") {
    super(reason);
  }
}

/**
 * All or nothing in one transaction (US-PHA-03): sets the location of each active specimen. A specimen that is
 * unknown, foreign (invisible to the row rule) or archived undoes the whole call; a location of another account
 * violates the composite foreign key (account_id, location_id). Setting the location a specimen already has just
 * writes the same value again.
 */
export async function setLocations(
  pool: Pool,
  userId: string,
  assignments: readonly { readonly specimenId: string; readonly locationId: string }[],
): Promise<readonly SpecimenRow[] | "specimen_unknown" | "archived" | "location_unknown"> {
  try {
    return await withAccount(pool, userId, async (c) => {
      const rows: SpecimenRow[] = [];
      for (const a of assignments) {
        const r = await c.query<SpecimenRow>(
          `update specimen set location_id = $2 where id = $1 and status <> 'archived'
           returning ${COLUMNS}`,
          [a.specimenId, a.locationId],
        );
        if (r.rows[0]) rows.push(r.rows[0]);
        else {
          const da = await c.query("select 1 from specimen where id = $1", [a.specimenId]);
          throw new Refused(da.rowCount ? "archived" : "specimen_unknown");
        }
      }
      return rows;
    });
  } catch (e) {
    if (e instanceof Refused) return e.reason;
    if (pgError(e).code === FOREIGN_KEY && pgError(e).constraint === "specimen_location")
      return "location_unknown";
    throw e;
  }
}
