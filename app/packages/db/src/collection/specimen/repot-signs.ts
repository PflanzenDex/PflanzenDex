import type { Pool, PoolClient } from "pg";
import { withAccount } from "../../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export type RepotSign = "roots_out" | "dries_fast" | "tips_over";
export interface OpenSign {
  readonly sign: RepotSign;
  readonly tickedOn: string;
}
export type SignRefusal = "not_found" | "archived" | "not_a_plant";

// The order of the observations as the core lists them (`REPOT_SIGNS`).
const SIGN_ORDER = `array['roots_out', 'dries_fast', 'tips_over']`;

/** The state of a specimen as the row rule shows it; `null` for a foreign or unknown one (P-04). */
async function stateOf(c: PoolClient, specimenId: string): Promise<string | null> {
  const r = await c.query<{ status: string }>("select status from specimen where id = $1", [
    specimenId,
  ]);
  return r.rows[0]?.status ?? null;
}

/** A refusal for a specimen that is not an active plant; `null` when it is one. */
function refusalOf(state: string | null): SignRefusal | null {
  if (state === null) return "not_found";
  if (state === "archived") return "archived";
  return state === "plant" ? null : "not_a_plant";
}

async function openOn(c: PoolClient, specimenId: string): Promise<readonly OpenSign[]> {
  const r = await c.query<OpenSign>(
    `select sign, to_char(ticked_on, 'YYYY-MM-DD') as "tickedOn" from repot_sign
      where specimen_id = $1 and cleared_on is null
      order by array_position(${SIGN_ORDER}, sign::text)`,
    [specimenId],
  );
  return r.rows;
}

/**
 * Adapter for the repot history and the repot observations (US-BES-19, DM-BES-09); every call runs as the account of the
 * caller under the row rules (P-04). Dates are local calendar dates and come back as text (NFR-08).
 */
export class RepotPostgres {
  constructor(private readonly pool: Pool) {}

  /** The latest repot day per specimen; specimens never repotted are absent (P-08). */
  async lastRepotted(
    userId: string,
    specimenIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>> {
    const found = await withAccount(this.pool, userId, (c) =>
      c.query<{ specimenId: string; day: string }>(
        `select specimen_id as "specimenId", to_char(max(repotted_on), 'YYYY-MM-DD') as day
           from repot where specimen_id = any($1::uuid[]) group by specimen_id`,
        [specimenIds],
      ),
    );
    return new Map(found.rows.map((z) => [z.specimenId, z.day] as const));
  }

  /** The open observations of one specimen; a refusal when it is not an active plant. */
  async openSigns(userId: string, specimenId: string): Promise<readonly OpenSign[] | SignRefusal> {
    return withAccount(this.pool, userId, async (c) => {
      const refused = refusalOf(await stateOf(c, specimenId));
      return refused ?? openOn(c, specimenId);
    });
  }

  /** One statement: an open observation is not written twice (the partial unique index, US-QS-03). */
  async tickSign(
    userId: string,
    specimenId: string,
    sign: RepotSign,
    day: string,
  ): Promise<readonly OpenSign[] | SignRefusal> {
    return withAccount(this.pool, userId, async (c) => {
      const refused = refusalOf(await stateOf(c, specimenId));
      if (refused) return refused;
      await c.query(
        `insert into repot_sign (account_id, specimen_id, sign, ticked_on)
         values ($1, $2, $3, $4::date)
         on conflict (account_id, specimen_id, sign) where cleared_on is null do nothing`,
        [userId, specimenId, sign, day],
      );
      return openOn(c, specimenId);
    });
  }

  /** Clears the open observation on `day`, never before its tick; nothing open writes nothing. */
  async untickSign(
    userId: string,
    specimenId: string,
    sign: RepotSign,
    day: string,
  ): Promise<readonly OpenSign[] | SignRefusal> {
    return withAccount(this.pool, userId, async (c) => {
      const refused = refusalOf(await stateOf(c, specimenId));
      if (refused) return refused;
      await c.query(
        `update repot_sign set cleared_on = greatest(ticked_on, $3::date)
          where specimen_id = $1 and sign = $2 and cleared_on is null`,
        [specimenId, sign, day],
      );
      return openOn(c, specimenId);
    });
  }
}
