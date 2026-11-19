import type { PoolClient } from "pg";
import { specimenNamesOn } from "../collection/index.ts";

/**
 * The name of the offered specimen by swap ID, on the caller's giver rows (P-05). A gone specimen has no name (P-08). The
 * swap and its offer are this module's tables; the names are read through the collection's port as the caller, so this
 * module reads no collection table (AB-9). Only the requests screen asks for them, never the match path.
 */
export async function offeredNamesOf(c: PoolClient): Promise<ReadonlyMap<string, string>> {
  const r = await c.query<{ swapId: string; specimenId: string }>(
    `select s.swap_id as "swapId", o.specimen_id as "specimenId"
       from swap s join offer o on o.id = s.offer_id where s.role = 'giver'`,
  );
  const names = await specimenNamesOn(
    c,
    r.rows.map((x) => x.specimenId),
  );
  return new Map(
    r.rows.flatMap((x) =>
      names.has(x.specimenId) ? [[x.swapId, names.get(x.specimenId) as string] as const] : [],
    ),
  );
}
