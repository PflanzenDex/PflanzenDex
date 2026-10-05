import type { Pool } from "pg";
import { withAccount } from "../kernel/index.ts";

// Same shapes as the interfaces in `core` (structurally equal; `db` does not import `core`).
export interface SpecimenRow {
  readonly id: string;
  readonly speciesId: string;
  readonly name: string;
  readonly marker: string | null;
  readonly locationId: string | null;
  readonly status: "plant" | "cutting" | "archived";
  readonly caughtAt: string | null;
  readonly createdAt: string | null;
  readonly archivedAt: string | null;
  readonly archivedReason: string | null;
}

// `date` and `timestamptz` come back as text: the driver would turn it into a `Date` in the server's time zone (NFR-08).
export const COLUMNS = `id, species_id as "speciesId", name, marker, location_id as "locationId", status,
  to_char(caught_at, 'YYYY-MM-DD') as "caughtAt",
  to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "createdAt",
  to_char(archived_at, 'YYYY-MM-DD') as "archivedAt",
  archived_reason as "archivedReason"`;

export const FOREIGN_KEY = "23503";
export const pgError = (e: unknown) => e as { code?: string; constraint?: string };

export class SpeciesGone extends Error {}

/**
 * After a write that references a species: it must not have been merged away meanwhile. A merge locks the species
 * row of the proposal first, so a write that waited for that lock finds the merged case here and rolls back
 * (FR-BES-11, P-10); a write that came first holds a key lock, the merge waits for it and re-points it. The check is a
 * function of the catalog (ADR 0003: no SQL on its tables from here).
 */
export async function ensureSpeciesVisible(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: { merged: boolean }[] }> },
  speciesId: string,
): Promise<void> {
  const r = await client.query("select species_is_merged($1) as merged", [speciesId]);
  if (r.rows[0]?.merged) throw new SpeciesGone();
}

/**
 * One statement (US-BES-11): only `caught_at` of one specimen of the account changes. On an archived specimen a date
 * after its archiving date changes nothing (`after_archived`); a foreign specimen is invisible to the row rule and
 * looks like an unknown one (`not_found`, P-04). Calendar rules and "not in the future" are checked by the operation.
 */
export async function setCaughtAt(
  pool: Pool,
  userId: string,
  id: string,
  date: string,
): Promise<SpecimenRow | "not_found" | "after_archived"> {
  return withAccount(pool, userId, async (c) => {
    const r = await c.query<SpecimenRow>(
      `update specimen set caught_at = $2::date
        where id = $1 and (archived_at is null or archived_at >= $2::date) returning ${COLUMNS}`,
      [id, date],
    );
    if (r.rows[0]) return r.rows[0];
    const there = await c.query("select 1 from specimen where id = $1", [id]);
    return there.rowCount ? "after_archived" : "not_found";
  });
}
