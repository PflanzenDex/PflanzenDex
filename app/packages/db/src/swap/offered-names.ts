import type { PoolClient } from "pg";
import { specimenNamesOn } from "../collection/index.ts";

/** The offered specimen of a swap as the requests screen shows it: its name and whether it is still archived (P-05). */
export interface OfferedSpecimen {
  readonly name: string;
  readonly archived: boolean;
}

/**
 * The offered specimen of the caller's giver rows that need one: a plant that is accepted or handed over (US-SOZ-11, Q-149).
 * Before the confirmation the card names it; after the handover it names it while it is still archived (a restored plant
 * shows no archive line). A gone specimen has no entry (P-08). The swap and its offer are this module's tables; the name and
 * the archived state are read through the collection's port as the caller, so this module reads no collection table (AB-9).
 */
export async function offeredNamesOf(c: PoolClient): Promise<ReadonlyMap<string, OfferedSpecimen>> {
  const r = await c.query<{ swapId: string; specimenId: string }>(
    `select s.swap_id as "swapId", o.specimen_id as "specimenId"
       from swap s join offer o on o.id = s.offer_id
      where s.role = 'giver' and s.type = 'plant' and s.status in ('accepted', 'handed_over')`,
  );
  const specimens = await specimenNamesOn(
    c,
    r.rows.map((x) => x.specimenId),
  );
  return new Map(
    r.rows.flatMap((x) => {
      const specimen = specimens.get(x.specimenId);
      return specimen ? [[x.swapId, specimen] as const] : [];
    }),
  );
}
