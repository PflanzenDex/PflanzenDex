import type { PoolClient } from "pg";
import type { ApprovedTwin } from "@pflanzendex/core";

/**
 * The approved species (curated or reviewed) that holds a Latin name key, other than the case's own species (US-BES-10).
 * It takes the advisory lock of the key first: two approvals of one name run one after the other, and the second one
 * sees the approval of the first (each statement of READ COMMITTED sees what committed before it).
 */
export async function lockedTwin(
  c: PoolClient,
  caseId: string,
  latinKey: string,
): Promise<ApprovedTwin | null> {
  await c.query("select pg_advisory_xact_lock(hashtextextended($1::text, 0))", [
    `species-latin:${latinKey}`,
  ]);
  const r = await c.query<ApprovedTwin>(
    `select a.id, a.latin_name as "latinName"
       from species_name n join species a on a.id = n.species_id
      where n.field = 'latin' and n.norm = $2::text and a.review_status in ('curated', 'reviewed')
        and a.id is distinct from (select v.object_id from review_case v where v.id = $1)
      limit 1`,
    [caseId, latinKey],
  );
  return r.rows[0] ?? null;
}
